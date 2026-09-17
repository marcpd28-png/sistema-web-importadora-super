import assert from "node:assert/strict";
import test from "node:test";
import { buildChatInputBatch, CHAT_QUIET_PERIOD_MS, type ChatInputMessage } from "./chat-input-batch";
import { selectCatalogProducts } from "./catalog-selection";

const origin = Date.parse("2026-09-17T10:00:00Z");
const message = (id: string, seconds: number, content: string, extra: Partial<ChatInputMessage> = {}): ChatInputMessage => ({
  id, content, createdAt: new Date(origin + seconds * 1000), direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", mediaUrl: null, status: "delivered", ...extra,
});
const batch = (messages: ChatInputMessage[], trigger: string, seconds: number) => buildChatInputBatch(messages, trigger, origin + seconds * 1000);

test("espera exactamente 12 segundos sin mensajes y reinicia al recibir otro", () => {
  assert.equal(CHAT_QUIET_PERIOD_MS, 12000);
  const first = message("a", 0, "hola");
  assert.deepEqual(batch([first], "a", 11.999), { triggerMessageId: "a", latestMessageId: "a", status: "WAITING", waitMs: 1 });
  assert.equal(batch([first], "a", 12).status, "READY");
  const second = message("b", 9, "busco catálogo");
  assert.equal(batch([first, second], "a", 12).status, "SUPERSEDED");
  assert.equal(batch([first, second], "b", 20.999).status, "WAITING");
  assert.equal(batch([first, second], "b", 21).status, "READY");
});

test("conserva toda la consulta aunque dure más de 12 segundos o tenga más de ocho mensajes", () => {
  const messages = Array.from({ length: 10 }, (_, i) => message(String(i).padStart(2, "0"), i * 8, i === 0 ? "hola busco catálogo" : i === 9 ? "de proyectores" : "por favor"));
  const result = batch(messages.slice().reverse(), "09", 84);
  assert.equal(result.status, "READY");
  if (result.status !== "READY") return;
  assert.equal(result.messageIds.length, 10);
  assert(result.content.startsWith("hola busco catálogo\n"));
  assert(result.content.endsWith("de proyectores"));
  assert.equal(selectCatalogProducts(result.content, [{ code: "P1", name: "PROYECTOR HAVIT PJ215", brand: "HAVIT", category: "PROYECTORES" }]).products.length, 1);
});

test("procesa categorías pedidas en mensajes separados en el mismo catálogo", () => {
  const result = batch([message("a", 0, "hola"), message("b", 4, "busco catálogo de proyectores"), message("c", 10, "y de parlantes")], "c", 22);
  assert.equal(result.status, "READY");
  if (result.status !== "READY") return;
  const selected = selectCatalogProducts(result.content, [
    { code: "P1", name: "PROYECTOR HAVIT PJ215", brand: "HAVIT", category: "PROYECTORES" },
    { code: "S1", name: "PARLANTE JBL CHARGE", brand: "JBL", category: "PARLANTES" },
    { code: "A1", name: "AUDIFONO JBL", brand: "JBL", category: "AURICULARES" },
  ]);
  assert.deepEqual(selected.products.map(p => p.code).sort(), ["P1", "S1"]);
});

test("no reutiliza mensajes ya respondidos ni atraviesa una respuesta del asesor", () => {
  for (const senderType of ["BOT", "AGENT"]) {
    const messages = [message("a", 0, "catálogo"), message("b", 13, "respuesta", { direction: "OUTBOUND", senderType, status: "sent" })];
    assert.equal(batch(messages, "a", 25).status, "ALREADY_ANSWERED");
    const result = batch([...messages, message("c", 15, "ahora parlantes")], "c", 27);
    assert.equal(result.status, "READY");
    if (result.status === "READY") assert.equal(result.content, "ahora parlantes");
  }
});

test("los intentos fallidos no consumen fragmentos y se conservan referencias multimedia", () => {
  const messages = [message("a", 0, "", { messageType: "IMAGE", mediaUrl: "https://example.com/product.jpg" }),
    message("b", 1, "respuesta fallida", { direction: "OUTBOUND", senderType: "BOT", status: "failed" }), message("c", 2, "cuánto cuesta este")];
  const result = batch(messages, "c", 14);
  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.deepEqual(result.messageIds, ["a", "c"]);
    assert.equal(result.content, "cuánto cuesta este");
    assert.equal(result.media[0].messageId, "a");
  }
  assert.equal(batch(messages, "missing", 14).status, "TRIGGER_NOT_FOUND");
});

test("consulta demasiado larga se señala sin truncar silenciosamente los mensajes", () => {
  const messages = [message("a", 0, "a".repeat(6000)), message("b", 1, "b".repeat(6000))];
  assert.equal(batch(messages, "b", 12).status, "WAITING");
  const result = batch(messages, "b", 13);
  assert.equal(result.status, "TOO_LARGE");
  if (result.status === "TOO_LARGE") assert.deepEqual(result.messageIds, ["a", "b"]);
  assert.equal(messages[0].content.length, 6000);
});
