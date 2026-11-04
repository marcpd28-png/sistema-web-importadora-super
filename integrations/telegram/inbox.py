"""Private, durable store inbox integration for the existing Telegram bridge."""
import hashlib
import hmac
import json
import mimetypes
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


DEFAULT_SUPER_BOT_SILENCE_SECONDS = 3
MAX_SUPER_BOT_PRODUCT_IMAGES = 3
STORE_PUBLIC_HOST = 'tiendavirtualsuper.com'
SUPER_BOT_PROTOCOL = 'super-bot-v1'
# Telegram may reject the optimized WebP files used by the storefront when
# they are passed to sendPhoto as a URL. Restrict automatic photos to broadly
# compatible source formats; a rejected photo is still handled defensively.
STORE_UPLOAD_IMAGE_EXTENSIONS = {'.jpeg', '.jpg', '.png'}
TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX = '/api/telegram/product-image/'
TELEGRAM_PRODUCT_IMAGE_CODE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')


class InboxError(Exception):
    def __init__(self, message, status=400, uncertain=False):
        super().__init__(message)
        self.status, self.uncertain = status, uncertain


class Inbox:
    def __init__(self, path, config, raw_api, now=time.time):
        self.config, self.raw_api, self.now = config, raw_api, now
        self.secret = config.get('inbox_secret', '')
        self.url = config.get('inbox_url', '')
        self.lock = threading.RLock()
        self.explicit = threading.local()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS inbox_events(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, payload TEXT, sent INTEGER DEFAULT 0);
          CREATE TABLE IF NOT EXISTS inbox_chats(connection TEXT, chat TEXT, last_inbound REAL DEFAULT 0, paused INTEGER DEFAULT 0, revision INTEGER DEFAULT 0, PRIMARY KEY(connection,chat));
          CREATE TABLE IF NOT EXISTS inbox_sends(id TEXT PRIMARY KEY, fingerprint TEXT, state TEXT, response TEXT);
          CREATE TABLE IF NOT EXISTS inbox_super_bot_replies(id TEXT PRIMARY KEY, connection TEXT NOT NULL, chat TEXT NOT NULL, content TEXT NOT NULL, source_event_id TEXT, first_contact INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'queued', error TEXT, created REAL NOT NULL, updated REAL NOT NULL);
        ''')
        # The bridge is deployed independently from the store. Keep existing
        # SQLite inboxes compatible when this batching metadata is introduced.
        # `super_bot` remains part of the explicit v1 ownership protocol.
        try:
            self.db.execute('ALTER TABLE inbox_chats ADD COLUMN super_bot INTEGER DEFAULT 0')
        except sqlite3.OperationalError as error:
            if 'duplicate column name' not in str(error).lower():
                raise
        for column in ('source_event_id TEXT', 'first_contact INTEGER NOT NULL DEFAULT 0'):
            try:
                self.db.execute('ALTER TABLE inbox_super_bot_replies ADD COLUMN ' + column)
            except sqlite3.OperationalError as error:
                if 'duplicate column name' not in str(error).lower():
                    raise
        self.db.execute("UPDATE inbox_sends SET state='uncertain' WHERE state='sending'")
        self.db.execute("UPDATE inbox_super_bot_replies SET state='uncertain',error='Bridge restarted before delivery was confirmed' WHERE state='sending'")
        self.db.commit()

    @property
    def enabled(self):
        return len(self.secret) >= 32 and bool(self.url)

    @property
    def super_bot_enabled(self):
        return bool(self.config.get('super_bot_url', '').strip() and self.config.get('super_bot_key', '').strip())

    def authorized(self, value):
        return self.enabled and hmac.compare_digest(value or '', 'Bearer '+self.secret)

    def super_bot_silence_seconds(self):
        value = self.config.get('super_bot_silence_seconds', self.config.get('super_bot_silence_window_seconds', DEFAULT_SUPER_BOT_SILENCE_SECONDS))
        try:
            return min(30, max(0, float(value)))
        except (TypeError, ValueError):
            return DEFAULT_SUPER_BOT_SILENCE_SECONDS

    def enqueue(self, event, key=None):
        if not self.enabled: return False
        event = dict(event, eventId=key or str(uuid.uuid4()))
        with self.lock:
            inserted = self.db.execute('INSERT OR IGNORE INTO inbox_events(key,payload) VALUES (?,?)',
                                       (event['eventId'], json.dumps(event, ensure_ascii=False))).rowcount > 0
            self.db.commit()
            return inserted

    def message(self, m, sender, kind='message', local_id=None, event_key=None, protocol=None):
        cid, chat = m.get('business_connection_id'), m.get('chat', {}).get('id')
        if not cid or not chat or not m.get('message_id'): return
        person = m.get('from', {}) if sender == 'CUSTOMER' else m.get('chat', {})
        name = ' '.join(filter(None, (person.get('first_name'), person.get('last_name')))) or person.get('username') or 'Cliente de Telegram'
        event = dict(kind=kind, connectionId=cid, chatId=str(chat), messageId=m['message_id'],
                     sender=sender, name=name[:180], timestamp=int(m.get('date', self.now())),
                     content=m.get('text') or m.get('caption') or '', type='TEXT')
        for field, kind_name in [('photo','IMAGE'),('video','VIDEO'),('animation','VIDEO'),('audio','AUDIO'),('voice','AUDIO'),('document','DOCUMENT'),('sticker','DOCUMENT')]:
            media = m.get(field)
            if not media: continue
            if isinstance(media, list): media = media[-1]
            event.update(type=kind_name, fileId=media['file_id'])
            if media.get('file_name'): event['filename'] = media['file_name'][:255]
            if not event['content']: event['content'] = {'IMAGE':'Imagen','VIDEO':'Video','AUDIO':'Audio','DOCUMENT':'Documento'}[kind_name]
            break
        if not event['content']: event['content'] = '[Mensaje de Telegram]'
        if local_id: event['localMessageId'] = local_id
        if protocol: event['protocol'] = protocol
        if m.get('reply_to_message'): event['replyToMessageId'] = m['reply_to_message']['message_id']
        return self.enqueue(event, event_key)

    def has_customer_history(self, cid, chat):
        """Whether this chat already had a customer turn before the current one."""
        with self.lock:
            rows = self.db.execute('SELECT payload FROM inbox_events ORDER BY id DESC LIMIT 200').fetchall()
        for (raw,) in rows:
            try:
                event = json.loads(raw)
            except (TypeError, ValueError):
                continue
            if (
                event.get('kind') == 'message'
                and event.get('sender') == 'CUSTOMER'
                and event.get('connectionId') == cid
                and str(event.get('chatId')) == str(chat)
            ):
                return True
        return False

    def observe(self, update, adapter):
        """Archive incoming updates and claim customer turns before any legacy bot can handle them."""
        deletion = update.get('deleted_business_messages')
        m = update.get('business_message') or update.get('edited_business_message')
        obj = deletion or m
        if not obj or obj.get('chat', {}).get('type') != 'private': return False
        cid, chat = obj.get('business_connection_id'), obj['chat']['id']
        connection = adapter.get_connection(cid) if cid else None
        if not connection: return False
        if deletion:
            self.enqueue(dict(kind='delete', connectionId=cid, chatId=str(chat), timestamp=int(self.now()), messageIds=deletion['message_ids']), 'update:'+str(update['update_id']))
            return False
        sender = m.get('from', {})
        role = 'BOT' if m.get('sender_business_bot') or sender.get('is_bot') else 'AGENT' if sender.get('id') == connection[0] else 'CUSTOMER'
        kind = 'edit' if 'edited_business_message' in update else 'message'
        is_first_contact = role == 'CUSTOMER' and kind == 'message' and not self.has_customer_history(cid, chat)
        event_id = 'update:'+str(update['update_id'])
        inserted = self.message(m, role, kind, event_key=event_id)
        if role == 'CUSTOMER':
            if kind == 'message' and inserted:
                with self.lock:
                    self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
                    self.db.execute('UPDATE inbox_chats SET last_inbound=max(last_inbound,?) WHERE connection=? AND chat=?', (m.get('date', self.now()),cid,str(chat)))
                    self.db.commit()
                self.enqueue_super_bot_reply(m, event_id, is_first_contact)
            # Fail closed: a missing Super Bot configuration must never revive
            # the legacy business bot after this adapter takes ownership.
            return True
        elif kind == 'message' and role == 'AGENT':
            # A human reply invalidates an optimistic v1 BOT ownership claim.
            self.set_paused(cid, chat, True, advance_revision=True)
        return False

    def enqueue_super_bot_reply(self, message, source_event_id=None, is_first_contact=False):
        cid, chat, message_id = message.get('business_connection_id'), message.get('chat', {}).get('id'), message.get('message_id')
        if not cid or not chat or not message_id: return
        key = 'tgbot:' + hashlib.sha256(f'{cid}:{chat}:{message_id}'.encode()).hexdigest()
        content = (message.get('text') or message.get('caption') or '[Mensaje de Telegram]').strip()[:1200]
        stamp = self.now()
        with self.lock:
            self.db.execute('''INSERT OR IGNORE INTO inbox_super_bot_replies(id,connection,chat,content,source_event_id,first_contact,created,updated)
                             VALUES (?,?,?,?,?,?,?,?)''', (key,cid,str(chat),content,source_event_id,int(bool(is_first_contact)),stamp,stamp))
            self.db.commit()

    def recent_super_bot_messages(self, cid, chat, excluded_event_ids):
        """Return the small, chronological conversation window accepted by Super Bot."""
        with self.lock:
            rows = self.db.execute('SELECT payload FROM inbox_events ORDER BY id DESC LIMIT 200').fetchall()
        history = []
        for (raw,) in rows:
            try:
                event = json.loads(raw)
            except (TypeError, ValueError):
                continue
            if event.get('eventId') in excluded_event_ids:
                continue
            if event.get('kind') != 'message' or event.get('connectionId') != cid or str(event.get('chatId')) != str(chat):
                continue
            sender = event.get('sender')
            if sender == 'CUSTOMER':
                role = 'user'
            elif sender in ('BOT', 'AGENT'):
                role = 'assistant'
            else:
                continue
            content = event.get('content')
            if not isinstance(content, str) or not content.strip():
                continue
            history.append({'role': role, 'text': content.strip()[:4000]})
            if len(history) >= 6:
                break
        history.reverse()
        return history

    def super_bot_conversation_id(self, cid, chat):
        value = f'telegram:{cid}:{chat}'
        if len(value) <= 160:
            return value
        return 'telegram:' + hashlib.sha256(f'{cid}:{chat}'.encode()).hexdigest()

    def next_super_bot_batch(self):
        """Claim one quiet customer turn without letting a noisy chat block others.

        Every source message keeps its own durable queue row. Rows separated by
        no more than the silence window form one customer turn; claiming all of
        them together preserves replay safety if the process exits mid-delivery.
        """
        silence = self.super_bot_silence_seconds()
        now = self.now()
        with self.lock:
            rows = self.db.execute('''SELECT id,connection,chat,content,source_event_id,first_contact,created,updated
                                   FROM inbox_super_bot_replies WHERE state='queued' ORDER BY created,rowid''').fetchall()
            by_chat = {}
            for row in rows:
                by_chat.setdefault((row[1], row[2]), []).append(row)

            candidates = []
            for chat_rows in by_chat.values():
                batch = [chat_rows[0]]
                for row in chat_rows[1:]:
                    if float(row[6]) - float(batch[-1][7]) <= silence:
                        batch.append(row)
                    else:
                        break
                if now - float(batch[-1][7]) >= silence:
                    candidates.append(batch)

            if not candidates:
                return None
            batch = min(candidates, key=lambda items: (items[0][6], items[0][0]))
            ids = [row[0] for row in batch]
            placeholders = ','.join('?' for _ in ids)
            claimed = self.db.execute(
                f"UPDATE inbox_super_bot_replies SET state='sending',updated=? WHERE state='queued' AND id IN ({placeholders})",
                [now, *ids],
            ).rowcount
            if claimed != len(ids):
                self.db.rollback()
                return None
            self.db.commit()
            return batch

    def super_bot_request(self, batch):
        key, cid, chat = batch[0][0], batch[0][1], batch[0][2]
        content = '\n'.join(row[3].strip() for row in batch if isinstance(row[3], str) and row[3].strip()).strip()[:1200]
        if not content:
            content = '[Mensaje de Telegram]'
        with self.lock:
            outstanding = self.db.execute('''SELECT source_event_id FROM inbox_super_bot_replies
                                           WHERE connection=? AND chat=? AND state IN ('queued','sending')''', (cid, chat)).fetchall()
        excluded = {row[4] for row in batch if isinstance(row[4], str) and row[4]}
        excluded.update(value for (value,) in outstanding if isinstance(value, str) and value)
        return {
            'message': content,
            'channel': 'telegram',
            'eventId': key,
            'conversationId': self.super_bot_conversation_id(cid, chat),
            'recentMessages': self.recent_super_bot_messages(cid, chat, excluded),
            'isFirstContact': bool(batch[0][5]),
        }

    def super_bot_reply(self, request_body):
        url, key = self.config.get('super_bot_url', '').strip(), self.config.get('super_bot_key', '').strip()
        if not url or not key: raise InboxError('Super Bot no está configurado en el puente.',503)
        request = urllib.request.Request(url, data=json.dumps(request_body).encode(), headers={
            'Content-Type':'application/json', 'x-super-bot-key':key, 'User-Agent':'SuperBotTelegramAdapter/1.0'
        })
        try:
            with urllib.request.urlopen(request,timeout=20) as response:
                payload = json.loads(response.read().decode())
        except Exception as error:
            raise InboxError('Super Bot no pudo preparar la respuesta automática.',503) from error
        reply = payload.get('reply') if isinstance(payload,dict) else None
        raw_text = reply.get('text','') if isinstance(reply,dict) else ''
        text = raw_text.strip() if isinstance(raw_text, str) else ''
        if not text or len(text)>4000: raise InboxError('Super Bot devolvió una respuesta inválida.',502)
        document = reply.get('document') if isinstance(reply,dict) and isinstance(reply.get('document'),dict) else None
        products = reply.get('products') if isinstance(reply,dict) and isinstance(reply.get('products'),list) else []
        return {'text': text, 'document': document, 'products': products}

    def product_image_messages(self, products):
        result, seen = [], set()
        for product in products if isinstance(products, list) else []:
            if not isinstance(product, dict):
                continue
            url = None
            # `telegramImageUrl` is a narrow own-origin JPEG route. It looks
            # the product up again server-side, so this bridge can never turn
            # a catalog or model value into an arbitrary URL/file proxy.
            for candidate in (product.get('telegramImageUrl'), product.get('outboundImageUrl'), product.get('imageUrl')):
                if not isinstance(candidate, str):
                    continue
                value = candidate.strip()
                if not value or len(value) > 4096:
                    continue
                if value.startswith('/uploads/') or value.startswith(TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX):
                    value = 'https://' + STORE_PUBLIC_HOST + value
                try:
                    parsed = urllib.parse.urlsplit(value)
                    extension = Path(urllib.parse.unquote(parsed.path)).suffix.lower()
                    port = parsed.port
                except ValueError:
                    continue
                is_verified_telegram_derivative = (
                    parsed.path.startswith(TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX)
                    and not parsed.query
                    and not parsed.fragment
                    and bool(TELEGRAM_PRODUCT_IMAGE_CODE.fullmatch(
                        parsed.path[len(TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX):]
                    ))
                )
                is_verified_store_upload = (
                    parsed.path.startswith('/uploads/')
                    and extension in STORE_UPLOAD_IMAGE_EXTENSIONS
                )
                if (
                    parsed.scheme == 'https'
                    and parsed.hostname == STORE_PUBLIC_HOST
                    and not parsed.username
                    and port in (None, 443)
                    and (is_verified_telegram_derivative or is_verified_store_upload)
                ):
                    url = value
                    break
            if not url or url in seen:
                continue
            name = product.get('name')[:800] if isinstance(product.get('name'), str) else ''
            code = product.get('code')[:160] if isinstance(product.get('code'), str) else ''
            caption = ' · '.join(part.strip() for part in (name, code) if part and part.strip())[:1000] or 'Producto disponible'
            seen.add(url)
            result.append({'url': url, 'caption': caption})
            if len(result) >= MAX_SUPER_BOT_PRODUCT_IMAGES:
                break
        return result

    def normalized_super_bot_reply(self, value):
        # Kept for bridge-local compatibility with deployments/tests that
        # injected the earlier (text, document) helper while rolling out.
        if isinstance(value, tuple) and len(value) == 2:
            return {'text': value[0], 'document': value[1], 'products': []}
        if isinstance(value, dict):
            return value
        raise InboxError('Super Bot devolvió una respuesta inválida.',502)

    def super_bot_tick(self, adapter):
        batch = self.next_super_bot_batch()
        if not batch:
            return False
        key, cid, chat = batch[0][0], batch[0][1], batch[0][2]
        try:
            if not self.super_bot_enabled: raise InboxError('Super Bot no está configurado en el puente.',503)
            # Do not disclose conversation context to a model after a human
            # has taken ownership. `command` repeats this check on delivery
            # to cover a handoff that races the model response.
            if self.paused(cid, chat) or adapter.shopping.support_session(cid, int(chat)):
                raise InboxError('Un asesor está atendiendo esta conversación.',409)
            reply = self.normalized_super_bot_reply(self.super_bot_reply(self.super_bot_request(batch)))
            text = reply.get('text')
            document = reply.get('document')
            products = reply.get('products')
            if not isinstance(text, str) or not text.strip() or len(text) > 4000:
                raise InboxError('Super Bot devolvió una respuesta inválida.',502)
            for index, image in enumerate(self.product_image_messages(products), start=1):
                try:
                    self.command('send', {
                        'connectionId': cid, 'chatId': chat, 'requestId': f'{key}:image:{index}',
                        'type': 'IMAGE', 'content': image['caption'], 'mediaUrl': image['url'], 'automated': True,
                    }, adapter)
                except InboxError as error:
                    # A bad or unsupported photo must not withhold the factual
                    # text answer. Ambiguous transport failures and human
                    # handoffs remain fail-closed to prevent duplicate sends.
                    if error.uncertain or self.paused(cid, chat) or adapter.shopping.support_session(cid, int(chat)):
                        raise
            payload = {'connectionId':cid,'chatId':chat,'requestId':key,'type':'TEXT','content':text,'automated':True}
            if isinstance(document, dict) and isinstance(document.get('url'),str):
                payload.update(type='DOCUMENT',mediaUrl=document['url'])
            self.command('send',payload,adapter)
            state,error = 'sent',None
        except InboxError as failure:
            state,error = ('uncertain' if failure.uncertain else 'failed'),str(failure)
        except Exception:
            state,error = 'uncertain','No se pudo confirmar la entrega de Super Bot.'
        with self.lock:
            ids = [row[0] for row in batch]
            placeholders = ','.join('?' for _ in ids)
            self.db.execute(f'UPDATE inbox_super_bot_replies SET state=?,error=?,updated=? WHERE id IN ({placeholders})', [state,error,self.now(),*ids])
            self.db.commit()
        return True

    def paused(self, cid, chat):
        with self.lock:
            row = self.db.execute('SELECT paused FROM inbox_chats WHERE connection=? AND chat=?', (cid,str(chat))).fetchone()
            return bool(row and row[0])

    def super_bot_claimed(self, cid, chat):
        """Whether the explicit v1 BOT owner currently controls this chat."""
        with self.lock:
            row = self.db.execute('SELECT paused,super_bot FROM inbox_chats WHERE connection=? AND chat=?', (cid,str(chat))).fetchone()
            return bool(row and row[0] and row[1])

    def current_revision(self, cid, chat):
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
            row = self.db.execute('SELECT revision FROM inbox_chats WHERE connection=? AND chat=?', (cid,str(chat))).fetchone()
            return int(row[0]) if row else 0

    def set_paused(self, cid, chat, value, advance_revision=False):
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
            if advance_revision:
                self.db.execute('UPDATE inbox_chats SET paused=?,super_bot=0,revision=revision+1 WHERE connection=? AND chat=?',
                                (bool(value),cid,str(chat)))
            else:
                self.db.execute('UPDATE inbox_chats SET paused=?,super_bot=0 WHERE connection=? AND chat=?',
                                (bool(value),cid,str(chat)))
            self.db.commit()

    def take_super_bot_control(self, cid, chat, expected_revision, adapter):
        """CAS ownership for the existing Super Bot v1 bridge contract."""
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
            row = self.db.execute('SELECT revision FROM inbox_chats WHERE connection=? AND chat=?', (cid,str(chat))).fetchone()
            if not row or row[0] != expected_revision:
                raise InboxError('La conversación cambió antes de que Super Bot tomara el control.',409)
            revision = row[0] + 1
            # `paused` keeps legacy automation quiet, while `super_bot`
            # permits only the versioned BOT sender below.
            self.db.execute('UPDATE inbox_chats SET paused=1,super_bot=1,revision=? WHERE connection=? AND chat=?',
                            (revision,cid,str(chat)))
            self.db.commit()
        adapter.shopping.leave_support(cid,int(chat))
        adapter.db.commit()
        self.enqueue(dict(kind='control',connectionId=cid,chatId=str(chat),timestamp=int(self.now()),
                          botEnabled=False,needsAdvisor=False,revision=revision,
                          sender='BOT',protocol=SUPER_BOT_PROTOCOL))
        return revision

    def snapshot(self, adapter, cid, chat):
        if not cid or not chat: return 0
        if not adapter.get_connection(cid): return 0
        support = adapter.shopping.support_session(cid, int(chat))
        enabled = not self.paused(cid, chat) and not support
        needs = bool(support and support[0] == 'human' and not self.paused(cid, chat))
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
            self.db.execute('UPDATE inbox_chats SET revision=revision+1 WHERE connection=? AND chat=?', (cid,str(chat)))
            revision = self.db.execute('SELECT revision FROM inbox_chats WHERE connection=? AND chat=?', (cid,str(chat))).fetchone()[0]
            self.db.commit()
            self.enqueue(dict(kind='control',connectionId=cid,chatId=str(chat),timestamp=int(self.now()),botEnabled=enabled,needsAdvisor=needs,revision=revision))
            return revision

    def command(self, action, data, adapter):
        cid, chat = data.get('connectionId'), data.get('chatId')
        if not isinstance(cid,str) or not isinstance(chat,str) or not chat.isdigit(): raise InboxError('Conversación inválida.')
        with adapter.lock:
            connection = adapter.get_connection(cid)
            if not connection or not connection[1] or not connection[2]: raise InboxError('La conexión de Telegram está desactivada o sin permiso para responder.',409)
            if action == 'control':
                sender, protocol = data.get('sender'), data.get('protocol')
                if sender == 'BOT':
                    if protocol != SUPER_BOT_PROTOCOL or data.get('botEnabled') is not False:
                        raise InboxError('El protocolo de Super Bot no es compatible.',409)
                    expected = data.get('expectedRevision')
                    if not isinstance(expected,int) or isinstance(expected,bool) or expected < 0:
                        raise InboxError('La revisión esperada no es válida.',409)
                    revision = self.take_super_bot_control(cid,chat,expected,adapter)
                    return {'revision':revision,'sender':'BOT','protocol':SUPER_BOT_PROTOCOL}
                if sender not in (None,'AGENT') or protocol is not None:
                    raise InboxError('Remitente inválido.',409)
                enabled = data.get('botEnabled')
                if not isinstance(enabled,bool): raise InboxError('Estado inválido.')
                self.set_paused(cid,chat,not enabled)
                if enabled: adapter.shopping.leave_support(cid,int(chat))
                else: adapter.shopping.pause(cid,int(chat))
                adapter.db.commit()
                return {'revision':self.snapshot(adapter,cid,chat)}
            if action != 'send': raise InboxError('Acción inválida.')
            rid, kind, content, automated = data.get('requestId'), data.get('type'), data.get('content'), data.get('automated',False)
            sender, protocol = data.get('sender'), data.get('protocol')
            if not isinstance(automated,bool): raise InboxError('Solicitud inválida.')
            if sender not in (None,'AGENT','BOT'):
                raise InboxError('Remitente inválido.',409)
            explicit_super_bot = sender == 'BOT'
            if explicit_super_bot and protocol != SUPER_BOT_PROTOCOL:
                raise InboxError('El protocolo de Super Bot no es compatible.',409)
            if not explicit_super_bot and protocol is not None:
                raise InboxError('El protocolo de Super Bot no es compatible.',409)
            if automated:
                valid_prefix = isinstance(rid,str) and rid.startswith('tgbot:')
            elif explicit_super_bot:
                valid_prefix = isinstance(rid,str) and rid.startswith('ai:')
            else:
                valid_prefix = isinstance(rid,str) and rid.startswith('tgout:')
            if not valid_prefix or len(rid)>120: raise InboxError('Identificador inválido.')
            super_bot = automated or explicit_super_bot
            fingerprint = hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
            with self.lock:
                prev = self.db.execute('SELECT fingerprint,state,response FROM inbox_sends WHERE id=?', (rid,)).fetchone()
                if prev:
                    if prev[0] != fingerprint: raise InboxError('La solicitud ya existe con otro contenido.',409)
                    if prev[1] == 'sent': return json.loads(prev[2])
                    raise InboxError('Este envío ya fue procesado. Comprueba la conversación antes de reenviar.',409,prev[1] != 'failed')
                state = self.db.execute('SELECT last_inbound FROM inbox_chats WHERE connection=? AND chat=?',(cid,chat)).fetchone()
            if not state or self.now()-state[0]>=86400: raise InboxError('La ventana de 24 horas de Telegram terminó. Espera un nuevo mensaje del cliente.',409)
            methods = {'TEXT':('sendMessage','text'), 'IMAGE':('sendPhoto','photo'), 'VIDEO':('sendVideo','video'), 'AUDIO':('sendAudio','audio'), 'DOCUMENT':('sendDocument','document')}
            if kind not in methods or not isinstance(content,str) or not 0<len(content)<= (4000 if kind=='TEXT' else 1000): raise InboxError('Mensaje inválido.')
            method,field = methods[kind]
            body = {'business_connection_id':cid,'chat_id':int(chat),'_inbox_request_id':rid}
            if kind=='TEXT': body[field]=content
            else:
                url = data.get('mediaUrl','')
                try:
                    parsed = urllib.parse.urlsplit(url)
                    port = parsed.port
                except (TypeError, ValueError):
                    raise InboxError('El archivo debe pertenecer a la tienda.') from None
                is_verified_telegram_derivative = (
                    kind == 'IMAGE'
                    and parsed.path.startswith(TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX)
                    and not parsed.query
                    and not parsed.fragment
                    and bool(TELEGRAM_PRODUCT_IMAGE_CODE.fullmatch(
                        parsed.path[len(TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX):]
                    ))
                )
                if (
                    parsed.scheme!='https'
                    or parsed.hostname!=STORE_PUBLIC_HOST
                    or (not parsed.path.startswith('/uploads/') and not is_verified_telegram_derivative)
                    or parsed.username
                    or port not in (None,443)
                ):
                    raise InboxError('El archivo debe pertenecer a la tienda.')
                if kind == 'AUDIO':
                    extension = Path(parsed.path).suffix.lower()
                    if extension == '.ogg': method,field = 'sendVoice','voice'
                    elif extension not in ('.mp3','.m4a'): method,field = 'sendDocument','document'
                body.update({field:url,'caption':content})
            reply = data.get('replyToMessageId')
            if reply is not None:
                if not isinstance(reply,int) or reply<1: raise InboxError('Respuesta inválida.')
                body['reply_parameters']={'message_id':reply}
            if automated:
                if self.paused(cid,chat) or adapter.shopping.support_session(cid,int(chat)):
                    raise InboxError('Un asesor está atendiendo esta conversación.',409)
                revision = self.snapshot(adapter,cid,chat)
            elif explicit_super_bot:
                if not self.super_bot_claimed(cid,chat):
                    raise InboxError('Super Bot no controla esta conversación.',409)
                revision = self.current_revision(cid,chat)
            else:
                self.set_paused(cid,chat,True)
                adapter.shopping.pause(cid,int(chat)); adapter.db.commit()
                revision = self.snapshot(adapter,cid,chat)
            with self.lock:
                self.db.execute('INSERT INTO inbox_sends VALUES (?,?,?,NULL)', (rid,fingerprint,'sending')); self.db.commit()
            try:
                if super_bot:
                    # Current bridge deployments use the explicit sender and
                    # protocol markers when archiving outbound messages. Keep
                    # the older automated marker too so both bridge revisions
                    # recognize this as a Super Bot reply rather than a human
                    # adviser reply (which would pause the conversation).
                    if automated: body['_inbox_automated'] = True
                    body['_inbox_sender'] = 'BOT'
                    body['_inbox_protocol'] = SUPER_BOT_PROTOCOL
                result = self.raw_api(method,body)
                response = {'messageId':result['message_id'],'revision':revision}
                if super_bot:
                    response.update(sender='BOT',protocol=SUPER_BOT_PROTOCOL)
                with self.lock:
                    self.db.execute("UPDATE inbox_sends SET state='sent',response=? WHERE id=?", (json.dumps(response),rid)); self.db.commit()
                return response
            except urllib.error.HTTPError as error:
                with self.lock:
                    self.db.execute("UPDATE inbox_sends SET state=? WHERE id=?", ('failed' if error.code<500 else 'uncertain',rid)); self.db.commit()
                error.close()
                raise InboxError('Telegram rechazó el envío. Revisa los permisos, el archivo o el límite de mensajes.',502,error.code>=500) from None
            except Exception:
                with self.lock:
                    self.db.execute("UPDATE inbox_sends SET state='uncertain' WHERE id=?", (rid,)); self.db.commit()
                raise InboxError('No se pudo confirmar el envío. Revisa Telegram antes de reenviar.',502,True) from None

    def status(self, adapter):
        with adapter.lock:
            connected = adapter.db.execute('SELECT count(*) FROM connections WHERE enabled=1 AND reply=1').fetchone()[0]>0
        with self.lock:
            pending = self.db.execute('SELECT count(*) FROM inbox_events WHERE sent=0').fetchone()[0]
            pending_super_bot = self.db.execute("SELECT count(*) FROM inbox_super_bot_replies WHERE state='queued'").fetchone()[0]
        return dict(connected=self.enabled and connected,pending=pending,pendingSuperBot=pending_super_bot,
                    superBotConfigured=self.super_bot_enabled,
                    capabilities={'superBotSendV1':True,'superBotControlV1':True})

    def tick(self):
        if not self.enabled: return False
        with self.lock:
            row = self.db.execute('SELECT id,payload FROM inbox_events WHERE sent=0 ORDER BY id LIMIT 1').fetchone()
        if not row: return False
        req = urllib.request.Request(self.url, data=row[1].encode(), headers={'Authorization':'Bearer '+self.secret,'Content-Type':'application/json','User-Agent':'SuperBotStoreInbox/1.0'})
        with urllib.request.urlopen(req,timeout=20) as response:
            if response.status != 200: raise RuntimeError('Inbox unavailable')
        with self.lock:
            self.db.execute('UPDATE inbox_events SET sent=1 WHERE id=?',(row[0],)); self.db.commit()
        return True

    def start(self, adapter=None):
        def run():
            while True:
                worked = False
                try:
                    worked = self.tick()
                except Exception as error: print('inbox_sync_retry '+type(error).__name__,flush=True)
                if adapter:
                    try: worked = self.super_bot_tick(adapter) or worked
                    except Exception as error: print('super_bot_reply_retry '+type(error).__name__,flush=True)
                if worked: continue
                time.sleep(min(3, max(.25, self.super_bot_silence_seconds())))
        threading.Thread(target=run,daemon=True).start()

    def media(self, handler, file_id):
        if not file_id or len(file_id)>1024: raise InboxError('Archivo inválido.')
        item = self.raw_api('getFile',{'file_id':file_id})
        path = item.get('file_path','')
        if path.startswith('/'):
            # Local Bot API returns a path in its shared data mount, not an arbitrary host file.
            target = Path('/telegram-files') / path.removeprefix('/var/lib/telegram-bot-api/')
            root = Path('/telegram-files').resolve()
            resolved = target.resolve()
            if root not in resolved.parents or not resolved.is_file(): raise InboxError('Archivo no disponible.',404)
            size = resolved.stat().st_size
            start,end,status = 0,size-1,200
            range_header = handler.headers.get('Range','')
            if range_header:
                import re
                match = re.fullmatch(r'bytes=(\d*)-(\d*)',range_header)
                if not match or not any(match.groups()): raise InboxError('Rango inválido.',416)
                a,b = match.groups()
                start = int(a) if a else max(0,size-int(b))
                end = min(int(b),size-1) if a and b else size-1
                if start>end or start>=size: raise InboxError('Rango inválido.',416)
                status=206
            handler.send_response(status)
            handler.send_header('Content-Type',mimetypes.guess_type(path)[0] or 'application/octet-stream')
            handler.send_header('Content-Length',str(end-start+1)); handler.send_header('Accept-Ranges','bytes')
            if status==206: handler.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            handler.end_headers()
            with resolved.open('rb') as source:
                source.seek(start); remaining=end-start+1
                while remaining:
                    chunk=source.read(min(65536,remaining))
                    if not chunk: break
                    handler.wfile.write(chunk); remaining-=len(chunk)
            return
        if not path or '..' in path.split('/'): raise InboxError('Archivo no disponible.',404)
        url = self.config.get('api_base','https://api.telegram.org').rstrip('/')+'/file/bot'+self.config['token']+'/'+urllib.parse.quote(path,safe='/')
        headers = {}
        if handler.headers.get('Range'): headers['Range']=handler.headers['Range']
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=45) as response:
            handler.send_response(response.status)
            for key in ('Content-Type','Content-Length','Content-Range','Accept-Ranges'):
                value=response.headers.get(key)
                if value: handler.send_header(key,value)
            handler.end_headers()
            while chunk:=response.read(65536): handler.wfile.write(chunk)


def handle(inbox, adapter, handler):
    path = urllib.parse.urlsplit(handler.path).path
    if not path.startswith('/inbox/'): return False
    if not inbox.authorized(handler.headers.get('Authorization')):
        handler.reply(401,{'error':'No autorizado'}); return True
    try:
        if handler.command=='GET' and path=='/inbox/status': handler.reply(200,inbox.status(adapter))
        elif handler.command=='GET' and path=='/inbox/media': inbox.media(handler,urllib.parse.parse_qs(urllib.parse.urlsplit(handler.path).query).get('fileId',[''])[0])
        elif handler.command=='POST' and path in ('/inbox/send','/inbox/control'):
            size=int(handler.headers.get('Content-Length','0'))
            if not 1<=size<=32000: raise InboxError('Solicitud demasiado grande.',413)
            handler.connection.settimeout(40)
            data=json.loads(handler.rfile.read(size))
            if not isinstance(data,dict): raise InboxError('Solicitud inválida.')
            handler.reply(200,inbox.command(path.rsplit('/',1)[-1],data,adapter))
        else: handler.reply(404,{'error':'No encontrado'})
    except InboxError as error: handler.reply(error.status,{'error':str(error),'uncertain':error.uncertain})
    except (ValueError,TypeError): handler.reply(400,{'error':'Solicitud inválida'})
    except Exception: handler.reply(502,{'error':'No se pudo completar la operación de Telegram','uncertain':True})
    return True
