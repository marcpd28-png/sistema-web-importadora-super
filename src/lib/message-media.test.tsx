import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatMessage } from "@/types/messages";
import { MessageBubble } from "@/components/admin/messages/MessageBubble";
import { getMessageMedia, getMessageMediaSrc, safeMessageMediaUrl } from "./message-media";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1", conversationId: "conversation-1", externalMessageId: null,
    direction: "INBOUND", senderType: "CUSTOMER", messageType: "AUDIO",
    content: "", mediaUrl: null, metadata: {}, createdAt: new Date("2026-09-17T12:00:00Z"),
    status: "delivered", ...overrides,
  };
}

test("el audio con URL se muestra con controles y conserva su descripción", () => {
  const html = renderToStaticMarkup(<MessageBubble message={message({ mediaUrl: "https://cdn.example.com/voice.ogg", content: "Detalle del pedido" })} />);
  assert.match(html, /<audio[^>]*controls=""[^>]*preload="none"[^>]*src="https:\/\/cdn.example.com\/voice.ogg"/);
  assert.match(html, /Detalle del pedido/);
  assert.match(html, /Abrir audio/);
});

test("el sticker se muestra sin recortar ni transformar su archivo WebP", () => {
  const html = renderToStaticMarkup(<MessageBubble message={message({ messageType: "STICKER", mediaUrl: "https://cdn.example.com/animated.webp" })} />);
  assert.match(html, /<img[^>]*alt="Sticker"[^>]*src="https:\/\/cdn.example.com\/animated.webp"/);
  assert.match(html, /object-fit:contain/);
});

test("recupera stickers antiguos guardados como UNKNOWN y archivos Meta sin URL pública", () => {
  const old = message({ messageType: "UNKNOWN", metadata: { phoneNumberId: "123", message: { type: "sticker", sticker: { id: "456", mime_type: "image/webp" } } } });
  assert.equal(getMessageMedia(old).type, "STICKER");
  assert.equal(getMessageMedia(old).mediaId, "456");
  const html = renderToStaticMarkup(<MessageBubble message={old} />);
  assert.match(html, /alt="Sticker"/);
  assert.match(html, /src="\/api\/admin\/messages\/message-1\/media"/);
});

test("acepta metadata cruda reenviada por n8n y URL multimedia anterior", () => {
  const old = message({ messageType: "UNKNOWN", metadata: { type: "audio", audio: { id: "123", mime_type: "audio/ogg" } } });
  assert.equal(getMessageMedia(old).type, "AUDIO");
  assert.equal(getMessageMediaSrc(old), "/api/admin/messages/message-1/media");
  assert.equal(getMessageMediaSrc(message({ metadata: { mediaUrl: "https://cdn.example.com/old.ogg" } })), "https://cdn.example.com/old.ogg");
});

test("audios y stickers con URL protegida de Meta se cargan por la ruta autenticada", () => {
  for (const type of ["AUDIO", "STICKER"] as const) {
    const protectedUrl = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=456&ext=1&hash=expired";
    const received = message({
      messageType: type,
      mediaUrl: protectedUrl,
      metadata: { mediaId: "456", phoneNumberId: "123", message: {
        type: type.toLowerCase(), [type.toLowerCase()]: { id: "456", url: protectedUrl },
      } },
    });
    assert.equal(getMessageMediaSrc(received), "/api/admin/messages/message-1/media");
    const html = renderToStaticMarkup(<MessageBubble message={received} />);
    assert.match(html, /src="\/api\/admin\/messages\/message-1\/media"/);
    assert.doesNotMatch(html, /lookaside|hash=expired/);
    if (type === "AUDIO") assert.match(html, /href="\/api\/admin\/messages\/message-1\/media"/);
  }
});

test("los medios antiguos con URL e ID en metadata también usan el servidor", () => {
  const received = message({ messageType: "UNKNOWN", metadata: {
    type: "sticker", sticker: { id: "456", url: "https://lookaside.fbsbx.com/expired" },
  } });
  assert.equal(getMessageMediaSrc(received), "/api/admin/messages/message-1/media");
});

test("los archivos faltantes conservan una burbuja comprensible", () => {
  for (const type of ["AUDIO", "STICKER"] as const) {
    const html = renderToStaticMarkup(<MessageBubble message={message({ messageType: type })} />);
    assert.match(html, /recibido. Archivo no disponible/);
    assert.doesNotMatch(html, /<(audio|img)/);
  }
});

test("no cambia el texto ni las imágenes existentes", () => {
  assert.match(renderToStaticMarkup(<MessageBubble message={message({ messageType: "TEXT", content: "Hola" })} />), /Hola/);
  assert.match(renderToStaticMarkup(<MessageBubble message={message({ messageType: "IMAGE", mediaUrl: "/uploads/photo.jpg" })} />), /src="\/uploads\/photo.jpg"/);
});

test("rechaza esquemas ejecutables y URLs relativas a otros hosts", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "//evil.example/a", "/\\evil.example/a", "https://user:pass@example.com/a"]) {
    assert.equal(safeMessageMediaUrl(url), null);
  }
});
