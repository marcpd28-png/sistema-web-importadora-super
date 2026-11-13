#!/usr/bin/env python3
"""Durable standby bridge between ChatbotX and Super Bot.

The service defaults to TikTok, but can run a second isolated instance for
Messenger with ``CHATBOTX_BRIDGE_CHANNEL=messenger``. It remains deliberately
*off* until its explicit bridge flag is enabled. While off it only records the
current conversation history as observed; it never calls the model or sends a
customer message. That creates a safe baseline before a channel is activated.

The bridge uses the documented ChatbotX public API rather than patching its
compiled worker.  All secrets are read only from environment variables and
never written to SQLite, logs, or HTTP responses.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import base64
import mimetypes
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import PurePosixPath
from typing import Any, Callable, Iterable


SUPPORTED_CHANNELS = {"messenger", "tiktok"}


def _environment(*names: str, default: str = "") -> str:
    """Return the first explicitly configured environment value.

    ``TIKTOK_BRIDGE_*`` remains the backwards-compatible default. The generic
    names let a Messenger container reuse this reviewed transport without
    duplicating its delivery and idempotency logic.
    """
    for name in names:
        value = os.environ.get(name)
        if value is not None:
            return value
    return default


CHANNEL = _environment("CHATBOTX_BRIDGE_CHANNEL", default="tiktok").strip().lower() or "tiktok"
DEFAULT_POLL_SECONDS = 2.0
DEFAULT_SILENCE_SECONDS = 3.0
DEFAULT_TYPING_LEASE_SECONDS = 8.0
MAX_TYPING_LEASE_SECONDS = 30.0
MAX_TEXT = 1200
MAX_HISTORY = 6
MAX_PRODUCT_IMAGES = 3
MAX_MEDIA_BYTES = 5 * 1024 * 1024
MAX_VISION_IMAGE_BYTES = 4 * 1024 * 1024
DEFAULT_CONVERSATION_PAGES = 1
STORE_HOST = "tiendavirtualsuper.com"
PRODUCT_IMAGE_PATH_PREFIX = "/api/telegram/product-image/"


class BridgeError(Exception):
    def __init__(self, message: str, status: int = 502, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


@dataclass(frozen=True)
class Config:
    enabled: bool
    database_path: str
    chatbot_url: str
    chatbot_token: str
    super_bot_url: str
    super_bot_key: str
    bridge_secret: str
    poll_seconds: float = DEFAULT_POLL_SECONDS
    silence_seconds: float = DEFAULT_SILENCE_SECONDS
    # New customer messages surface at the top of ChatbotX's conversation
    # feed. Scanning the complete historical inbox on every short poll makes
    # a busy Messenger channel unhealthy before it can react to that new turn.
    conversation_pages: int = DEFAULT_CONVERSATION_PAGES

    @classmethod
    def from_env(cls) -> "Config":
        def positive(generic_name: str, legacy_name: str, default: float, maximum: float) -> float:
            try:
                value = float(_environment(generic_name, legacy_name, default=str(default)))
            except ValueError:
                return default
            return min(maximum, max(0.1, value))

        return cls(
            enabled=_environment("CHATBOTX_BRIDGE_ENABLED", "TIKTOK_BRIDGE_ENABLED", default="false").lower() == "true",
            database_path=_environment("CHATBOTX_BRIDGE_DB", "TIKTOK_BRIDGE_DB", default="/data/tiktok-bridge.db"),
            chatbot_url=os.environ.get("CHATBOTX_API_URL", "").rstrip("/"),
            chatbot_token=os.environ.get("SOCIAL_INBOX_API_TOKEN", ""),
            super_bot_url=os.environ.get("SUPER_BOT_URL", "").rstrip("/"),
            super_bot_key=os.environ.get("SUPER_BOT_INTERNAL_API_KEY", ""),
            bridge_secret=_environment("CHATBOTX_BRIDGE_SECRET", "TIKTOK_BRIDGE_SECRET"),
            poll_seconds=positive("CHATBOTX_BRIDGE_POLL_SECONDS", "TIKTOK_BRIDGE_POLL_SECONDS", DEFAULT_POLL_SECONDS, 30),
            silence_seconds=positive("CHATBOTX_BRIDGE_SILENCE_SECONDS", "TIKTOK_BRIDGE_SILENCE_SECONDS", DEFAULT_SILENCE_SECONDS, 30),
            conversation_pages=int(positive("CHATBOTX_BRIDGE_MAX_CONVERSATION_PAGES", "TIKTOK_BRIDGE_MAX_CONVERSATION_PAGES", DEFAULT_CONVERSATION_PAGES, 10)),
        )

    def require_runtime_secrets(self) -> None:
        """Validate the minimum credentials for the selected operating mode.

        Even a disabled bridge polls ChatbotX to establish its safe baseline,
        so it must have the read token and a valid API URL. The Super Bot
        credential is intentionally not required until automated replies are
        explicitly enabled.
        """
        required = [
            ("CHATBOTX_API_URL", self.chatbot_url),
            ("SOCIAL_INBOX_API_TOKEN", self.chatbot_token),
            ("CHATBOTX_BRIDGE_SECRET", self.bridge_secret),
        ]
        if self.enabled:
            required.extend([
                ("SUPER_BOT_URL", self.super_bot_url),
                ("SUPER_BOT_INTERNAL_API_KEY", self.super_bot_key),
            ])
        missing = [name for name, value in required if not value]
        if missing:
            raise BridgeError("Faltan variables de configuración del puente.", 503)
        if CHANNEL not in SUPPORTED_CHANNELS:
            raise BridgeError("El canal del puente no es válido.", 503)
        if len(self.bridge_secret) < 32:
            raise BridgeError("La clave del puente debe tener al menos 32 caracteres.", 503)
        for value in (self.chatbot_url, *([self.super_bot_url] if self.enabled else [])):
            try:
                parsed = urllib.parse.urlsplit(value)
            except ValueError as error:
                raise BridgeError("La URL del puente no es válida.", 503) from error
            if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
                raise BridgeError("La URL del puente no es válida.", 503)


@dataclass
class HttpResponse:
    status: int
    headers: dict[str, str]
    body: bytes


class UrllibTransport:
    """Tiny injectable HTTP transport; tests use a fake instead."""

    def request(self, method: str, url: str, headers: dict[str, str] | None = None, body: bytes | None = None, timeout: float = 30) -> HttpResponse:
        request = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
        try:
            # Store assets are allow-listed before this method is called. Do
            # not follow a redirect that could silently turn that safe URL into
            # an arbitrary internal request.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *_args: Any, **_kwargs: Any) -> None:
                    return None
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
                return HttpResponse(response.status, dict(response.headers.items()), response.read())
        except urllib.error.HTTPError as error:
            return HttpResponse(error.code, dict(error.headers.items()) if error.headers else {}, error.read())
        except (urllib.error.URLError, TimeoutError) as error:
            raise BridgeError("No se pudo comunicar con el servicio de mensajería.", 503, True) from error


def _json(body: bytes) -> Any:
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


class ChatbotXApi:
    def __init__(self, base_url: str, token: str, transport: UrllibTransport | None = None, max_conversation_pages: int = DEFAULT_CONVERSATION_PAGES):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.transport = transport or UrllibTransport()
        self.max_conversation_pages = max(1, min(10, int(max_conversation_pages)))

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None, *, idempotency_key: str | None = None) -> tuple[int, dict[str, str], Any]:
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        response = self.transport.request(method, f"{self.base_url}/v1{path}", headers, body)
        return response.status, response.headers, _json(response.body)

    def list_conversations(self) -> list[dict[str, Any]]:
        conversations: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(self.max_conversation_pages):
            query = {"channel": CHANNEL, "botCategory": "all", "perPage": "50"}
            if cursor:
                query["cursor"] = cursor
            status, _, payload = self._request("GET", "/conversations?" + urllib.parse.urlencode(query))
            if status != 200 or not isinstance(payload, dict):
                raise BridgeError("ChatbotX no permitió consultar las conversaciones.", status, status >= 500)
            data = payload.get("data")
            if isinstance(data, list):
                conversations.extend(item for item in data if isinstance(item, dict))
            next_cursor = payload.get("nextCursor")
            if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor
        return conversations

    def list_messages(self, conversation_id: str) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(100):
            query = {"perPage": "50"}
            if cursor:
                query["cursor"] = cursor
            status, _, payload = self._request("GET", f"/conversations/{urllib.parse.quote(conversation_id, safe='')}/messages?" + urllib.parse.urlencode(query))
            if status != 200 or not isinstance(payload, dict):
                raise BridgeError("ChatbotX no permitió consultar los mensajes.", status, status >= 500)
            data = payload.get("data")
            if isinstance(data, list):
                messages.extend(item for item in data if isinstance(item, dict))
            next_cursor = payload.get("nextCursor")
            if not isinstance(next_cursor, str) or not next_cursor or next_cursor == cursor:
                break
            cursor = next_cursor
        return messages

    def download_image_attachment(self, attachment: dict[str, Any]) -> str | None:
        """Return one bounded private Messenger image as a data URL.

        ChatbotX serves inbound media from its internal ``filesystem`` host.
        The URL originates in a provider payload, so accept only its expected
        host/path and validate the declared MIME, size and magic bytes before
        a customer photo reaches the vision matcher.
        """
        mime_type = attachment.get("mimeType")
        size = attachment.get("size")
        url = attachment.get("url")
        if mime_type not in ("image/jpeg", "image/png", "image/webp") or not isinstance(url, str):
            return None
        try:
            parsed_size = int(size)
            parsed = urllib.parse.urlsplit(url)
        except (TypeError, ValueError):
            return None
        if (
            parsed_size <= 0
            or parsed_size > MAX_VISION_IMAGE_BYTES
            or parsed.scheme != "http"
            or parsed.hostname != "filesystem"
            or parsed.port is not None
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or not parsed.path.startswith("/chatbotx/public/ws/")
        ):
            return None
        response = self.transport.request("GET", url, {
            "Authorization": f"Bearer {self.token}",
            "Accept": mime_type,
        }, timeout=30)
        content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        data = response.body
        valid_magic = (
            (mime_type == "image/jpeg" and data[:2] == b"\xff\xd8")
            or (mime_type == "image/png" and data[:8] == b"\x89PNG\r\n\x1a\n")
            or (mime_type == "image/webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP")
        )
        if response.status != 200 or content_type != mime_type or not data or len(data) > MAX_VISION_IMAGE_BYTES or not valid_magic:
            return None
        return f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}"

    def send_text(self, conversation_id: str, inbox_id: str, text: str, key: str) -> None:
        # ChatbotX's optional clientId accepts numeric values only. The
        # durable delivery key intentionally contains channel-safe separators,
        # so rely on its documented Idempotency-Key header instead.
        status, _, _ = self._request("POST", f"/conversations/{conversation_id}/messages", {"text": text, "inboxId": inbox_id}, idempotency_key=key)
        if not 200 <= status < 300:
            raise BridgeError("ChatbotX no confirmó el mensaje saliente.", status, status >= 500)

    def send_media(self, conversation_id: str, inbox_id: str, media_file_id: str, key: str) -> None:
        status, _, _ = self._request("POST", f"/conversations/{conversation_id}/messages", {"mediaFileId": media_file_id, "inboxId": inbox_id}, idempotency_key=key)
        if not 200 <= status < 300:
            raise BridgeError("ChatbotX no confirmó el archivo saliente.", status, status >= 500)

    def disable_bot(self, conversation_id: str, key: str) -> None:
        status, _, payload = self._request("POST", f"/conversations/{conversation_id}/disable-bot", {}, idempotency_key=key)
        if not 200 <= status < 300 or (isinstance(payload, dict) and payload.get("success") is False):
            raise BridgeError("ChatbotX no confirmó la derivación a un asesor.", status, status >= 500)

    def upload_public_file(self, url: str, name: str, mime_type: str, maximum: int = MAX_MEDIA_BYTES) -> str:
        """Download a verified public store asset, then register it in Media Library."""
        asset = self.transport.request("GET", url, {
            "Accept": "*/*",
            # The store's edge protects media from anonymous scrapers. Use the
            # same stable transport identity as the authenticated Super Bot
            # request so this private adapter can fetch the verified asset.
            "User-Agent": f"SuperBot{CHANNEL.title()}Adapter/1.0",
        }, timeout=45)
        if asset.status != 200 or not asset.body or len(asset.body) > maximum:
            raise BridgeError("El archivo visual no se pudo preparar para el canal.", 502)
        status, _, upload = self._request("POST", "/media-library/files/upload-url", {"fileName": name, "mimeType": mime_type})
        if status not in (200, 201) or not isinstance(upload, dict) or not isinstance(upload.get("path"), str) or not isinstance(upload.get("uploadUrl"), str):
            raise BridgeError("ChatbotX no pudo preparar el archivo visual.", 502)
        put = self.transport.request("PUT", upload["uploadUrl"], {"Content-Type": mime_type, "Content-Length": str(len(asset.body))}, asset.body, timeout=45)
        if not 200 <= put.status < 300:
            raise BridgeError("ChatbotX rechazó el archivo visual.", 502)
        status, _, media = self._request("POST", "/media-library/files", {"name": name, "path": upload["path"], "mimeType": mime_type, "size": len(asset.body), "folderId": None})
        raw_media_id = media.get("id") if isinstance(media, dict) else None
        # ChatbotX serializes bigint primary keys as JSON numbers in this
        # private API. Normalize that transport detail before passing the
        # reference back to its message endpoint; accepting anything else
        # would still risk a malformed attachment destination.
        media_id = str(raw_media_id) if isinstance(raw_media_id, (str, int)) and not isinstance(raw_media_id, bool) else ""
        if status not in (200, 201) or not media_id.isdigit():
            raise BridgeError("ChatbotX no confirmó el archivo visual.", 502)
        return media_id


class SuperBotApi:
    def __init__(self, url: str, key: str, transport: UrllibTransport | None = None):
        self.url = url
        self.key = key
        self.transport = transport or UrllibTransport()

    def reply(self, payload: dict[str, Any]) -> tuple[int, dict[str, str], Any]:
        response = self.transport.request("POST", self.url, {
            "Content-Type": "application/json",
            "x-super-bot-key": self.key,
            "User-Agent": f"SuperBot{CHANNEL.title()}Adapter/1.0",
        }, json.dumps(payload, separators=(",", ":")).encode("utf-8"), timeout=120)
        return response.status, response.headers, _json(response.body)


def _clean_text(value: Any, maximum: int = MAX_TEXT) -> str:
    return " ".join(value.strip().split())[:maximum] if isinstance(value, str) else ""


def _store_action_links(reply: dict[str, Any]) -> list[str]:
    """Render verified storefront actions in channels without button support.

    ChatbotX's message API carries plain text/media only. A Super Bot reply
    can include trusted quick actions for the web UI, so preserve storefront
    navigation by placing the approved HTTPS URL in the outgoing text. Do
    not relay arbitrary action URLs into a customer conversation.
    """
    actions = reply.get("quickActions")
    if not isinstance(actions, list):
        return []
    links: list[str] = []
    seen: set[str] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        href = action.get("href")
        if not isinstance(href, str) or len(href) > 2048:
            continue
        try:
            parsed = urllib.parse.urlsplit(href.strip())
        except ValueError:
            continue
        if (
            parsed.scheme != "https"
            or parsed.hostname != STORE_HOST
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            continue
        url = href.strip()
        if url in seen:
            continue
        seen.add(url)
        label = _clean_text(action.get("label"), 80)
        links.append(f"{label}: {url}" if label else url)
    return links


def _text_with_store_actions(text: str, reply: dict[str, Any]) -> str:
    """Append store actions without truncating their clickable URL."""
    for link in _store_action_links(reply):
        url = link.rsplit(": ", 1)[-1]
        if url in text:
            continue
        separator = "\n" if text else ""
        available = MAX_TEXT - len(separator) - len(link)
        if available < 0:
            # The link is more useful than a long generic sentence, but the
            # strict allow-list above ensures this can only be a store URL.
            return link[:MAX_TEXT]
        text = f"{text[:available]}{separator}{link}"
    return text


def _stable_id(conversation_id: str, first_id: str, last_id: str) -> str:
    digest = hashlib.sha256(f"{CHANNEL}\x1f{conversation_id}\x1f{first_id}\x1f{last_id}".encode()).hexdigest()[:32]
    return f"{CHANNEL}:{conversation_id}:{digest}"


def _store_url(value: Any, *, suffixes: tuple[str, ...], path_prefixes: tuple[str, ...]) -> str | None:
    if not isinstance(value, str) or len(value) > 4096:
        return None
    try:
        parsed = urllib.parse.urlsplit(value.strip())
    except ValueError:
        return None
    if parsed.scheme != "https" or parsed.hostname != STORE_HOST or parsed.username or parsed.password or parsed.port not in (None, 443):
        return None
    path = urllib.parse.unquote(parsed.path)
    if parsed.query or parsed.fragment or not path.startswith(path_prefixes) or not path.lower().endswith(suffixes):
        return None
    return value.strip()


def _telegram_product_image_url(value: Any) -> str | None:
    """Expand only the storefront's prevalidated JPEG derivative route.

    Super Bot deliberately emits this route as a relative URL. It has no file
    suffix because the route selects a visible product by code and renders a
    JPEG itself. Never fall back to an arbitrary external supplier image: the
    bridge can prove neither its origin nor its content.
    """
    if not isinstance(value, str) or len(value) > 4096:
        return None
    raw = value.strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
    except ValueError:
        return None
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        return None
    if parsed.scheme or parsed.netloc:
        if parsed.scheme != "https" or parsed.hostname != STORE_HOST or parsed.port not in (None, 443):
            return None
    elif not raw.startswith("/"):
        return None
    path = urllib.parse.unquote(parsed.path)
    if not path.startswith(PRODUCT_IMAGE_PATH_PREFIX):
        return None
    code = path[len(PRODUCT_IMAGE_PATH_PREFIX):]
    ascii_code_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
    if not code or "/" in code or not all(char in ascii_code_chars for char in code) or len(code) > 64:
        return None
    if not code[0].isalnum():
        return None
    return f"https://{STORE_HOST}{PRODUCT_IMAGE_PATH_PREFIX}{urllib.parse.quote(code, safe='._-')}"


def _image_asset(product: dict[str, Any]) -> tuple[str, str, str] | None:
    derivative = _telegram_product_image_url(product.get("telegramImageUrl"))
    if derivative:
        code = _clean_text(product.get("code"), 64)
        return derivative, "image/jpeg", code
    for candidate in (product.get("outboundImageUrl"), product.get("imageUrl")):
        url = _store_url(candidate, suffixes=(".jpg", ".jpeg", ".png"), path_prefixes=("/uploads/", "/api/telegram/product-image/"))
        if not url:
            continue
        suffix = PurePosixPath(urllib.parse.urlsplit(url).path).suffix.lower()
        mime = "image/png" if suffix == ".png" else "image/jpeg"
        code = _clean_text(product.get("code"), 64)
        return url, mime, code
    return None


def _document_asset(document: dict[str, Any]) -> tuple[str, str, int] | None:
    url = _store_url(document.get("url"), suffixes=(".pdf",), path_prefixes=("/uploads/catalogs/",))
    size = document.get("sizeBytes")
    if not url or not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= MAX_MEDIA_BYTES:
        return None
    return url, "application/pdf", size


def _technical_question(text: str) -> bool:
    words = ("especific", "técnic", "tecnic", "compatib", "watt", "volt", "amper", "mah", "medida", "pulgada", "ram", "memoria")
    lowered = text.lower()
    return any(word in lowered for word in words)


def _requires_advisor(response: Any) -> bool:
    if not isinstance(response, dict):
        return False
    if response.get("requiresAdvisor") is True:
        return True
    reply = response.get("reply")
    return isinstance(reply, dict) and isinstance(reply.get("meta"), dict) and reply["meta"].get("requiresAdvisor") is True


class Bridge:
    def __init__(self, config: Config, chatbot: ChatbotXApi, super_bot: SuperBotApi, now: Callable[[], float] = time.time):
        self.config, self.chatbot, self.super_bot, self.now = config, chatbot, super_bot, now
        self.lock = threading.RLock()
        self.db = sqlite3.connect(config.database_path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS chats (
            conversation_id TEXT PRIMARY KEY, inbox_id TEXT NOT NULL, contact_inbox_id TEXT NOT NULL DEFAULT '', bot_enabled INTEGER NOT NULL DEFAULT 0,
            typing_until REAL NOT NULL DEFAULT 0, shown_codes TEXT NOT NULL DEFAULT '[]', last_incoming_marker TEXT NOT NULL DEFAULT ''
          );
          CREATE TABLE IF NOT EXISTS inbound_events (
            conversation_id TEXT NOT NULL, message_id TEXT NOT NULL, inbox_id TEXT NOT NULL,
            created REAL NOT NULL, text TEXT NOT NULL, has_attachments INTEGER NOT NULL DEFAULT 0,
            attachment_count INTEGER NOT NULL DEFAULT 0, first_contact INTEGER NOT NULL DEFAULT 0,
            state TEXT NOT NULL, batch_id TEXT, PRIMARY KEY (conversation_id, message_id)
          );
          CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, inbox_id TEXT NOT NULL, payload TEXT NOT NULL,
            state TEXT NOT NULL, next_retry REAL NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS deliveries (
            batch_id TEXT NOT NULL, delivery_key TEXT NOT NULL, state TEXT NOT NULL,
            PRIMARY KEY (batch_id, delivery_key)
          );
          CREATE TABLE IF NOT EXISTS bridge_state (
            key TEXT PRIMARY KEY, value TEXT NOT NULL
          );
        """)
        # Keep databases created by an earlier standby version usable.  The
        # contact-inbox id is distinct from the outbound inbox id and is
        # required to prevent cross-channel history leaking into TikTok.
        try:
            self.db.execute("ALTER TABLE chats ADD COLUMN contact_inbox_id TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError as error:
            if "duplicate column name" not in str(error).lower():
                raise
        # Polling every message page on every cycle turns a healthy busy inbox
        # into its own rate-limit source. The provider's last incoming marker
        # lets the bridge re-read a conversation only when the customer sent a
        # new turn. Existing standby databases are upgraded in place.
        try:
            self.db.execute("ALTER TABLE chats ADD COLUMN last_incoming_marker TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError as error:
            if "duplicate column name" not in str(error).lower():
                raise
        # A process crash must never leave a batch permanently claimed. The
        # next poll can retry it with the same deterministic delivery keys.
        self.db.execute("UPDATE batches SET state='queued' WHERE state='sending'")
        self.db.execute("UPDATE inbound_events SET state='queued' WHERE state='sending'")
        self._activation_cutoff = self._sync_activation_guard()
        self.db.commit()
        self._last_poll_success = 0.0
        self._last_poll_failure = 0.0

    def _sync_activation_guard(self) -> float | None:
        """Prevent a standby-to-live switch from answering old transcripts.

        A disabled instance leaves a durable marker. When it is later enabled,
        a conversation that only now reaches the newest page may contain a
        long prior transcript. Only customer turns received after the switch
        may be queued; earlier turns stay observed.
        """
        row = self.db.execute("SELECT value FROM bridge_state WHERE key='enabled'").fetchone()
        previous = row[0] if row else None
        if not self.config.enabled:
            self.db.execute(
                "INSERT INTO bridge_state(key,value) VALUES ('enabled','false') "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
            )
            self.db.execute("DELETE FROM bridge_state WHERE key='queue_after'")
            return None

        cutoff_row = self.db.execute("SELECT value FROM bridge_state WHERE key='queue_after'").fetchone()
        if previous == "false":
            cutoff = self.now()
            self.db.execute(
                "INSERT INTO bridge_state(key,value) VALUES ('queue_after',?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(cutoff),),
            )
        elif cutoff_row:
            try:
                cutoff = float(cutoff_row[0])
            except (TypeError, ValueError):
                cutoff = self.now()
        else:
            # Do not silently change delivery semantics for an existing bridge
            # that had already been running enabled before this safeguard.
            cutoff = None
        self.db.execute(
            "INSERT INTO bridge_state(key,value) VALUES ('enabled','true') "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        )
        return cutoff

    def close(self) -> None:
        self.db.close()

    def set_typing(self, conversation_id: str, typing: bool, seconds: float = DEFAULT_TYPING_LEASE_SECONDS) -> float | None:
        if not conversation_id.isdigit():
            raise BridgeError("Conversación no válida.", 400)
        try:
            seconds = float(seconds)
        except (TypeError, ValueError):
            raise BridgeError("La duración de escritura no es válida.", 400) from None
        if not 1 <= seconds <= MAX_TYPING_LEASE_SECONDS:
            raise BridgeError("La duración de escritura debe estar entre 1 y 30 segundos.", 400)
        with self.lock:
            row = self.db.execute("SELECT inbox_id FROM chats WHERE conversation_id=?", (conversation_id,)).fetchone()
            if not row:
                # The UI verifies the conversation against ChatbotX before it
                # calls us. Keep this placeholder so a first lease races safely
                # with the next poll rather than becoming an unbounded error.
                self.db.execute("INSERT INTO chats(conversation_id,inbox_id,typing_until) VALUES (?,?,?)", (conversation_id, "pending", 0))
            until = self.now() + seconds if typing else 0
            self.db.execute("UPDATE chats SET typing_until=? WHERE conversation_id=?", (until, conversation_id))
            self.db.commit()
        return until if typing else None

    def typing_active(self, conversation_id: str) -> bool:
        with self.lock:
            row = self.db.execute("SELECT typing_until FROM chats WHERE conversation_id=?", (conversation_id,)).fetchone()
            return bool(row and float(row[0]) > self.now())

    def mark_poll_failure(self) -> None:
        with self.lock:
            self._last_poll_failure = self.now()

    def health(self) -> tuple[bool, bool]:
        """Return (healthy, enabled) without exposing identifiers or secrets."""
        with self.lock:
            # A successful poll proves the sidecar can read its source. A
            # recent failed poll makes the endpoint fail closed even if an old
            # successful one exists.
            # A single ChatbotX page can legitimately approach the HTTP
            # timeout. Docker must not restart a poller while it is waiting.
            freshness = max(self.config.poll_seconds * 3, 45)
            healthy = self._last_poll_success > 0 and self.now() - self._last_poll_success <= freshness
            if self._last_poll_failure > self._last_poll_success:
                healthy = False
            return healthy, self.config.enabled

    def _matching_inbox(self, conversation: dict[str, Any]) -> tuple[str, str, str, str] | None:
        conversation_id = str(conversation.get("id") or "")
        matches = [item for item in conversation.get("contactInboxes", []) if isinstance(item, dict) and item.get("channel") == CHANNEL and str(item.get("id") or "") and str(item.get("inboxId") or "")]
        if not conversation_id.isdigit() or len(matches) != 1:
            return None
        return conversation_id, str(matches[0]["id"]), str(matches[0]["inboxId"]), str(matches[0].get("lastIncomingMessageAt") or "")

    def observe(self, conversation: dict[str, Any], queue: bool) -> int:
        matched = self._matching_inbox(conversation)
        if not matched:
            return 0
        conversation_id, contact_inbox_id, inbox_id, incoming_marker = matched
        bot_enabled = bool(conversation.get("botEnabled"))
        with self.lock:
            try:
                existing = self.db.execute("SELECT inbox_id,last_incoming_marker FROM chats WHERE conversation_id=?", (conversation_id,)).fetchone()
                # A tightly scoped operator test can make just the next unseen
                # customer turn behave like a first contact. It never deletes
                # transcript state and is consumed atomically by that one turn.
                force_key = f"force_first_contact:{conversation_id}"
                force_first_contact = self.db.execute("SELECT 1 FROM bridge_state WHERE key=?", (force_key,)).fetchone() is not None
                needs_history = existing is None or existing[0] == "pending" or existing[1] != incoming_marker
                # Do not advance the marker before the message page has been
                # persisted. A transient ChatbotX failure must be retried, not
                # mistaken for a fully observed customer turn.
                self.db.execute(
                    "INSERT INTO chats(conversation_id,inbox_id,contact_inbox_id,bot_enabled) VALUES (?,?,?,?) "
                    "ON CONFLICT(conversation_id) DO UPDATE SET inbox_id=excluded.inbox_id,contact_inbox_id=excluded.contact_inbox_id,bot_enabled=excluded.bot_enabled",
                    (conversation_id, inbox_id, contact_inbox_id, int(bot_enabled)),
                )
                if not bot_enabled:
                    # A durable ChatbotX handoff wins over any unprocessed
                    # automatic work. The short adviser typing lease never uses
                    # this path, so it simply expires instead of changing owner.
                    self.db.execute("UPDATE inbound_events SET state='paused' WHERE conversation_id=? AND state='queued'", (conversation_id,))
                    self.db.execute("UPDATE batches SET state='paused' WHERE conversation_id=? AND state='queued'", (conversation_id,))
                if not needs_history:
                    self.db.commit()
                    return 0

                seen_before = self.db.execute("SELECT 1 FROM inbound_events WHERE conversation_id=? LIMIT 1", (conversation_id,)).fetchone() is not None
                added = 0
                for message in sorted(self.chatbot.list_messages(conversation_id), key=lambda item: str(item.get("createdAt") or "")):
                    if message.get("contactInboxId") != contact_inbox_id or message.get("senderType") != "contact" or message.get("messageType") != "incoming" or message.get("deletedAt"):
                        continue
                    message_id = str(message.get("sourceId") or message.get("id") or "")
                    if not message_id:
                        continue
                    created = _message_time(message.get("createdAt"), self.now())
                    attachments = message.get("attachments") if isinstance(message.get("attachments"), list) else []
                    text = _clean_text(message.get("text"))
                    # Reactions and provider placeholders have neither customer
                    # text nor an attachment for Super Bot to evaluate.
                    if not text and not attachments:
                        continue
                    after_activation = self._activation_cutoff is None or created >= self._activation_cutoff
                    state = "queued" if queue and bot_enabled and after_activation else "observed"
                    inserted = self.db.execute(
                        "INSERT OR IGNORE INTO inbound_events(conversation_id,message_id,inbox_id,created,text,has_attachments,attachment_count,first_contact,state) VALUES (?,?,?,?,?,?,?,?,?)",
                        (conversation_id, message_id, inbox_id, created, text, int(bool(attachments)), min(len(attachments), 10), int(force_first_contact or not seen_before), state),
                    ).rowcount
                    if inserted:
                        added += 1
                        seen_before = True
                        if force_first_contact:
                            self.db.execute("DELETE FROM bridge_state WHERE key=?", (force_key,))
                            force_first_contact = False
                self.db.execute("UPDATE chats SET last_incoming_marker=? WHERE conversation_id=?", (incoming_marker, conversation_id))
                self.db.commit()
                return added
            except Exception:
                self.db.rollback()
                raise

    def poll_once(self) -> int:
        try:
            self.config.require_runtime_secrets()
            added = 0
            for conversation in self.chatbot.list_conversations():
                added += self.observe(conversation, queue=self.config.enabled)
            if self.config.enabled:
                self.process_due()
        except Exception:
            self.mark_poll_failure()
            raise
        with self.lock:
            self._last_poll_success = self.now()
        return added

    def _due_groups(self) -> Iterable[tuple[str, str, list[tuple[Any, ...]]]]:
        cutoff = self.now() - self.config.silence_seconds
        # A silence window is per conversation, not per individual message.
        # Load every unbatched customer turn first, then only release a group
        # when its *last* turn is old enough. Otherwise an older first turn
        # could claim a newer one that was not in the payload.
        rows = self.db.execute("""
          SELECT events.conversation_id,events.inbox_id,events.message_id,events.created,events.text,events.has_attachments,events.attachment_count,events.first_contact
          FROM inbound_events AS events
          JOIN chats ON chats.conversation_id=events.conversation_id
          WHERE events.state='queued' AND events.batch_id IS NULL AND chats.bot_enabled=1
            AND NOT EXISTS (
              SELECT 1 FROM batches
              WHERE batches.conversation_id=events.conversation_id
                AND batches.state IN ('queued','sending')
            )
          ORDER BY events.conversation_id,events.created,events.message_id
        """).fetchall()
        groups: dict[tuple[str, str], list[tuple[Any, ...]]] = {}
        for row in rows:
            groups.setdefault((row[0], row[1]), []).append(row)
        for (conversation_id, inbox_id), events in groups.items():
            if events and float(events[-1][3]) <= cutoff:
                yield conversation_id, inbox_id, events

    def _history(self, conversation_id: str, contact_inbox_id: str, excluded: set[str]) -> list[dict[str, str]]:
        result: list[dict[str, str]] = []
        for message in self.chatbot.list_messages(conversation_id):
            if message.get("contactInboxId") != contact_inbox_id or message.get("deletedAt"):
                continue
            identifier = str(message.get("sourceId") or message.get("id") or "")
            text = _clean_text(message.get("text"), 4000)
            if not text or identifier in excluded:
                continue
            role = "user" if message.get("senderType") == "contact" else "assistant"
            result.append({"role": role, "text": text})
        return result[-MAX_HISTORY:]

    def _shown_codes(self, conversation_id: str) -> list[str]:
        with self.lock:
            row = self.db.execute("SELECT shown_codes FROM chats WHERE conversation_id=?", (conversation_id,)).fetchone()
        try:
            values = json.loads(row[0]) if row else []
        except (TypeError, ValueError, json.JSONDecodeError):
            values = []
        return [value for value in values if isinstance(value, str)][:MAX_PRODUCT_IMAGES]

    def _claim_batch(self, conversation_id: str, inbox_id: str, events: list[tuple[Any, ...]]) -> tuple[str, dict[str, Any]] | None:
        if self.typing_active(conversation_id):
            return None
        first_id, last_id = str(events[0][2]), str(events[-1][2])
        batch_id = _stable_id(conversation_id, first_id, last_id)
        # An attachment-only payload deliberately carries an empty message.
        # The server then follows its attachment policy instead of treating a
        # fabricated transport label as a commercial customer request.
        content = "\n".join(row[4] for row in events if row[4]).strip()[:MAX_TEXT]
        chat = self.db.execute("SELECT contact_inbox_id FROM chats WHERE conversation_id=?", (conversation_id,)).fetchone()
        if not chat or not isinstance(chat[0], str) or not chat[0]:
            return None
        payload = {
            "eventId": batch_id,
            "channel": CHANNEL,
            "conversationId": conversation_id,
            "message": content,
            "recentMessages": self._history(conversation_id, chat[0], {str(row[2]) for row in events}),
            "hasAttachments": any(bool(row[5]) for row in events),
            "attachmentCount": min(sum(int(row[6]) for row in events), 10),
            # Only stable provider message IDs are persisted. Private media
            # URLs and photo bytes are re-fetched just-in-time and never saved
            # in bridge SQLite or logs.
            "imageMessageIds": [str(row[2]) for row in events if bool(row[5])],
            "shownProductCodes": self._shown_codes(conversation_id),
            "isFirstContact": any(bool(row[7]) for row in events),
        }
        message_ids = [str(row[2]) for row in events]
        placeholders = ",".join("?" for _ in message_ids)
        try:
            self.db.execute("BEGIN IMMEDIATE")
            inserted = self.db.execute(
                "INSERT OR IGNORE INTO batches(id,conversation_id,inbox_id,payload,state,next_retry) VALUES (?,?,?,?,?,?)",
                (batch_id, conversation_id, inbox_id, json.dumps(payload, ensure_ascii=False), "sending", self.now()),
            ).rowcount
            if inserted != 1:
                self.db.rollback()
                return None
            claimed = self.db.execute(
                f"UPDATE inbound_events SET state='sending',batch_id=? WHERE conversation_id=? AND state='queued' AND batch_id IS NULL AND message_id IN ({placeholders})",
                (batch_id, conversation_id, *message_ids),
            ).rowcount
            if claimed != len(message_ids):
                self.db.rollback()
                return None
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return batch_id, payload

    def _claim_due_retries(self) -> list[tuple[str, dict[str, Any]]]:
        """Reclaim persisted batches without changing their event payload.

        Retries retain their original deterministic ID and obey `next_retry`.
        New customer messages stay unbatched until this prior delivery has a
        terminal state, preserving chronological replies.
        """
        claimed: list[tuple[str, dict[str, Any]]] = []
        rows = self.db.execute(
            """
              SELECT batches.id,batches.payload
              FROM batches JOIN chats ON chats.conversation_id=batches.conversation_id
              WHERE batches.state='queued' AND batches.next_retry<=? AND chats.bot_enabled=1
              ORDER BY batches.next_retry,batches.id
            """,
            (self.now(),),
        ).fetchall()
        for batch_id, serialized in rows:
            try:
                payload = json.loads(serialized)
            except (TypeError, json.JSONDecodeError):
                self.db.execute("UPDATE batches SET state='failed' WHERE id=?", (batch_id,))
                self.db.execute("UPDATE inbound_events SET state='failed' WHERE batch_id=?", (batch_id,))
                continue
            if not isinstance(payload, dict):
                self.db.execute("UPDATE batches SET state='failed' WHERE id=?", (batch_id,))
                self.db.execute("UPDATE inbound_events SET state='failed' WHERE batch_id=?", (batch_id,))
                continue
            changed = self.db.execute(
                "UPDATE batches SET state='sending' WHERE id=? AND state='queued' AND next_retry<=?",
                (batch_id, self.now()),
            ).rowcount
            if changed:
                self.db.execute("UPDATE inbound_events SET state='sending' WHERE batch_id=? AND state='queued'", (batch_id,))
                claimed.append((str(batch_id), payload))
        self.db.commit()
        return claimed

    def _batch_image_data_url(self, payload: dict[str, Any]) -> str | None:
        """Fetch at most one current customer image without persisting it."""
        conversation_id = payload.get("conversationId")
        message_ids = payload.get("imageMessageIds")
        if not isinstance(conversation_id, str) or not isinstance(message_ids, list):
            return None
        expected_ids = {value for value in message_ids if isinstance(value, str) and value}
        if not expected_ids:
            return None
        with self.lock:
            row = self.db.execute("SELECT contact_inbox_id FROM chats WHERE conversation_id=?", (conversation_id,)).fetchone()
        contact_inbox_id = row[0] if row and isinstance(row[0], str) else ""
        if not contact_inbox_id:
            return None
        download = getattr(self.chatbot, "download_image_attachment", None)
        if not callable(download):
            return None
        try:
            for message in self.chatbot.list_messages(conversation_id):
                if (
                    message.get("contactInboxId") != contact_inbox_id
                    or message.get("senderType") != "contact"
                    or message.get("messageType") != "incoming"
                    or message.get("deletedAt")
                ):
                    continue
                message_id = str(message.get("sourceId") or message.get("id") or "")
                if message_id not in expected_ids:
                    continue
                attachments = message.get("attachments")
                if not isinstance(attachments, list):
                    continue
                for attachment in attachments:
                    if isinstance(attachment, dict):
                        image_data_url = download(attachment)
                        if isinstance(image_data_url, str) and image_data_url:
                            return image_data_url
        except Exception:
            # Image matching is optional. The store's normal attachment policy
            # safely handles a photo that can no longer be fetched.
            return None
        return None

    def process_due(self) -> int:
        # Claim work atomically, then make network requests outside the SQLite
        # critical section so a typing lease can still arrive promptly.
        with self.lock:
            retries = self._claim_due_retries()
            groups = list(self._due_groups())
            claimed = [self._claim_batch(*group) for group in groups]
        processed = 0
        for item in [*retries, *claimed]:
            if not item:
                continue
            batch_id, payload = item
            self._process_batch(batch_id, payload)
            processed += 1
        return processed

    def _mark_batch(self, batch_id: str, state: str, *, retry_after: float | None = None) -> None:
        with self.lock:
            next_retry = self.now() + retry_after if retry_after else 0
            self.db.execute("UPDATE batches SET state=?,attempts=attempts+1,next_retry=? WHERE id=?", (state, next_retry, batch_id))
            event_state = "queued" if state == "queued" else state
            self.db.execute("UPDATE inbound_events SET state=? WHERE batch_id=?", (event_state, batch_id))
            self.db.commit()

    def _handoff_to_advisor(self, batch_id: str, conversation_id: str) -> None:
        # The provider owns the visible queue state. Do not send even a generic
        # acknowledgement before its durable bot pause has succeeded.
        self.chatbot.disable_bot(conversation_id, f"{batch_id}:handoff")
        with self.lock:
            self.db.execute("UPDATE chats SET bot_enabled=0,typing_until=0 WHERE conversation_id=?", (conversation_id,))
            self.db.execute("UPDATE inbound_events SET state='paused' WHERE conversation_id=? AND state IN ('queued','sending')", (conversation_id,))
            self.db.execute("UPDATE batches SET state='paused' WHERE conversation_id=? AND state IN ('queued','sending')", (conversation_id,))
            self.db.commit()

    def _process_batch(self, batch_id: str, payload: dict[str, Any]) -> None:
        if self.typing_active(payload["conversationId"]):
            self._mark_batch(batch_id, "queued", retry_after=self.config.silence_seconds)
            return
        request_payload = dict(payload)
        image_data_url = self._batch_image_data_url(payload)
        if image_data_url:
            request_payload["imageDataUrl"] = image_data_url
        status, headers, response = self.super_bot.reply(request_payload)
        if status == 202:
            self._mark_batch(batch_id, "queued", retry_after=_retry_after(headers, 1))
            return
        if status == 409:
            self._mark_batch(batch_id, "paused")
            return
        if status in (429, 503):
            self._mark_batch(batch_id, "queued", retry_after=_retry_after(headers, 5))
            return
        if status != 200 or not isinstance(response, dict) or not isinstance(response.get("reply"), dict):
            self._mark_batch(batch_id, "failed")
            return
        if _requires_advisor(response):
            try:
                self._handoff_to_advisor(batch_id, payload["conversationId"])
            except BridgeError:
                self._mark_batch(batch_id, "queued", retry_after=5)
            return
        try:
            self._deliver(batch_id, payload, response["reply"])
        except BridgeError:
            # If no output was accepted, the incoming events remain queued for
            # a bounded retry. After a partial output we fail closed to avoid a
            # duplicate image/PDF sequence.
            with self.lock:
                partial = self.db.execute("SELECT 1 FROM deliveries WHERE batch_id=? AND state='sent' LIMIT 1", (batch_id,)).fetchone()
            self._mark_batch(batch_id, "partial" if partial else "queued", retry_after=5 if not partial else None)
            return
        self._mark_batch(batch_id, "delivered")

    def _delivered(self, batch_id: str, key: str) -> bool:
        with self.lock:
            row = self.db.execute("SELECT state FROM deliveries WHERE batch_id=? AND delivery_key=?", (batch_id, key)).fetchone()
            return bool(row and row[0] == "sent")

    def _remember_delivery(self, batch_id: str, key: str) -> None:
        with self.lock:
            self.db.execute("INSERT INTO deliveries(batch_id,delivery_key,state) VALUES (?,?,?) ON CONFLICT(batch_id,delivery_key) DO UPDATE SET state='sent'", (batch_id, key, "sent"))
            self.db.commit()

    def _deliver(self, batch_id: str, payload: dict[str, Any], reply: dict[str, Any]) -> None:
        conversation_id = payload["conversationId"]
        # ChatbotX's inbox id is stored in the batch record, not derived from a
        # public TikTok username.  That prevents delivery to a wrong account.
        with self.lock:
            row = self.db.execute("SELECT inbox_id FROM batches WHERE id=?", (batch_id,)).fetchone()
        if not row:
            raise BridgeError("No se encontró la conversación para entrega.")
        inbox_id = row[0]
        products = reply.get("products") if isinstance(reply.get("products"), list) else []
        images: list[tuple[str, str, str]] = []
        seen: set[str] = set()
        for product in products:
            if not isinstance(product, dict):
                continue
            asset = _image_asset(product)
            if asset and asset[0] not in seen:
                seen.add(asset[0]); images.append(asset)
            if len(images) >= MAX_PRODUCT_IMAGES:
                break
        for index, (url, mime_type, code) in enumerate(images, start=1):
            if self.typing_active(conversation_id):
                raise BridgeError("Un asesor está escribiendo.", 409)
            key = f"{batch_id}:image:{index}"
            if not self._delivered(batch_id, key):
                media_id = self.chatbot.upload_public_file(url, f"producto-{index}{'.png' if mime_type == 'image/png' else '.jpg'}", mime_type)
                self.chatbot.send_media(conversation_id, inbox_id, media_id, key)
                self._remember_delivery(batch_id, key)
            if code:
                codes = self._shown_codes(conversation_id)
                if code not in codes:
                    with self.lock:
                        self.db.execute("UPDATE chats SET shown_codes=? WHERE conversation_id=?", (json.dumps((codes + [code])[:MAX_PRODUCT_IMAGES]), conversation_id))
                        self.db.commit()

        document_delivery_unavailable = False
        if "documents" in reply:
            raw_documents = reply.get("documents")
            if not isinstance(raw_documents, list):
                raw_documents = []
                document_delivery_unavailable = True
        elif isinstance(reply.get("document"), dict):
            raw_documents = [reply["document"]]
        else:
            raw_documents = []

        valid_documents: list[tuple[str, str, int]] = []
        for item in raw_documents:
            asset = _document_asset(item) if isinstance(item, dict) else None
            if not asset:
                document_delivery_unavailable = True
                continue
            valid_documents.append(asset)
        # The document collection is all-or-nothing. Sending only the parts
        # that happen to fit would claim a complete catalogue while silently
        # omitting products. Super Bot normally pre-splits channel bundles to
        # this limit; this is a final fail-closed guard for stale/invalid data.
        if document_delivery_unavailable:
            valid_documents = []
        for index, (url, mime_type, _size) in enumerate(valid_documents, start=1):
            if self.typing_active(conversation_id):
                raise BridgeError("Un asesor está escribiendo.", 409)
            key = f"{batch_id}:document:{index}"
            if not self._delivered(batch_id, key):
                media_id = self.chatbot.upload_public_file(url, f"catalogo-{index}.pdf", mime_type)
                self.chatbot.send_media(conversation_id, inbox_id, media_id, key)
                self._remember_delivery(batch_id, key)

        text = _text_with_store_actions(_clean_text(reply.get("text"), 1000), reply)
        batch_text = _clean_text(payload.get("message"))
        if document_delivery_unavailable:
            if CHANNEL == "tiktok":
                text = "No puedo adjuntar ese catálogo completo por el límite de archivo de TikTok. Puedes verlo actualizado aquí: https://tiendavirtualsuper.com/"
            else:
                text = "No puedo adjuntar ese catálogo completo por el límite de archivo del canal. Puedes verlo actualizado aquí: https://tiendavirtualsuper.com/"
        elif len(images) >= 2 and not valid_documents and not _technical_question(batch_text):
            text = "¿Cuál de estas opciones te interesa?"
        if not text:
            text = "¿Cuál de estas opciones te interesa?" if images else "¿Qué detalle necesitas confirmar?"
        if self.typing_active(conversation_id):
            raise BridgeError("Un asesor está escribiendo.", 409)
        key = f"{batch_id}:text"
        if not self._delivered(batch_id, key):
            self.chatbot.send_text(conversation_id, inbox_id, text, key)
            self._remember_delivery(batch_id, key)


def _message_time(value: Any, fallback: float) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    # ChatbotX delivers ISO timestamps. Lexicographic ordering is used above;
    # the precise epoch only determines the short silence window here.
    if isinstance(value, str):
        try:
            return __import__("datetime").datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            pass
    return fallback


def _retry_after(headers: dict[str, str], fallback: float) -> float:
    try:
        return min(60, max(1, float(headers.get("Retry-After", fallback))))
    except (TypeError, ValueError):
        return fallback


class ControlHandler(BaseHTTPRequestHandler):
    bridge: Bridge
    secret: str

    def log_message(self, _format: str, *_args: Any) -> None:
        # Request logs may contain paths/identifiers; keep the sidecar quiet.
        return

    def _send(self, status: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path != "/health":
            self._send(404, {"error": "No encontrado."})
            return
        healthy, enabled = self.bridge.health()
        self._send(200 if healthy else 503, {"ok": healthy, "enabled": enabled})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path != "/typing":
            self._send(404, {"error": "No encontrado."})
            return
        if not self.secret or not hmac.compare_digest(self.headers.get(f"x-{CHANNEL}-bridge-key", ""), self.secret):
            self._send(401, {"error": "No autorizado."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise BridgeError("Solicitud inválida.", 400)
            payload = _json(self.rfile.read(length))
            if not isinstance(payload, dict) or not isinstance(payload.get("conversationId"), str) or not isinstance(payload.get("typing"), bool):
                raise BridgeError("Solicitud inválida.", 400)
            until = self.bridge.set_typing(payload["conversationId"], payload["typing"], payload.get("leaseSeconds", DEFAULT_TYPING_LEASE_SECONDS))
            self._send(200, {"typing": payload["typing"], "typingUntil": until})
        except BridgeError as error:
            self._send(error.status, {"error": str(error)})
        except Exception:
            self._send(400, {"error": "Solicitud inválida."})


def run() -> None:
    config = Config.from_env()
    config.require_runtime_secrets()
    chatbot = ChatbotXApi(config.chatbot_url, config.chatbot_token, max_conversation_pages=config.conversation_pages)
    super_bot = SuperBotApi(config.super_bot_url, config.super_bot_key)
    bridge = Bridge(config, chatbot, super_bot)
    ControlHandler.bridge, ControlHandler.secret = bridge, config.bridge_secret
    host = _environment("CHATBOTX_BRIDGE_HOST", "TIKTOK_BRIDGE_HOST", default="127.0.0.1")
    port = int(_environment("CHATBOTX_BRIDGE_PORT", "TIKTOK_BRIDGE_PORT", default="13125"))
    server = ThreadingHTTPServer((host, port), ControlHandler)

    def poll() -> None:
        while True:
            try:
                bridge.poll_once()
            except BridgeError as error:
                # Keep logs useful without exposing contents, URLs, or tokens.
                print(json.dumps({"event": "poll_failed", "status": error.status, "retryable": error.retryable}), flush=True)
            except Exception:
                print(json.dumps({"event": "poll_failed", "status": "unexpected"}), flush=True)
            time.sleep(config.poll_seconds)

    threading.Thread(target=poll, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    run()
