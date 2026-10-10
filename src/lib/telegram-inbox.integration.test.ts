import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { receiveTelegramEvent, telegramMessageKey } from "./telegram-events";
import { sendInternalMessage, updateConversation } from "./messages-service";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.searchParams.get("schema") !== "telegram_inbox_test_20261009" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Tests require disposable localhost schema telegram_inbox_test_20261009");
let server: Server, calls = 0, mode = "ok", revision = 1, agentId: string;
const inbound = (extra: Record<string, unknown> = {}) => ({ eventId: randomUUID(), kind: "message", connectionId: "test-linked", chatId: "12345", messageId: 10, sender: "CUSTOMER", type: "TEXT", content: "Hola", name: "Cliente sintético", timestamp: Math.floor(Date.now() / 1000), ...extra });

before(async () => {
  process.env.TELEGRAM_BRIDGE_SECRET = "test-secret-".repeat(5);
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(request.headers.authorization, `Bearer ${process.env.TELEGRAM_BRIDGE_SECRET}`);
    if (request.url === "/inbox/send") calls++;
    response.setHeader("Content-Type", "application/json");
    if (mode === "uncertain" && request.url === "/inbox/send") { response.statusCode = 502; response.end(JSON.stringify({ error: "Entrega sin confirmar", uncertain: true })); return; }
    if (request.url === "/inbox/send") {
      await receiveTelegramEvent(inbound({ eventId: randomUUID(), messageId: 100 + calls, sender: "AGENT", content: data.content, localMessageId: data.requestId }));
      response.end(JSON.stringify({ messageId: 100 + calls, revision: ++revision }));
    } else response.end(JSON.stringify({ revision: ++revision }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
  process.env.TELEGRAM_BRIDGE_URL = `http://127.0.0.1:${address.port}`;
  const user = await prisma.user.create({ data: { email: `telegram-test-${randomUUID()}@example.invalid`, name: "Test", passwordHash: "unused", role: "ADMIN" } });
  agentId = user.id;
});
beforeEach(async () => { await prisma.chatContact.deleteMany(); await prisma.telegramInboxEvent.deleteMany(); calls = 0; mode = "ok"; revision = 1; });
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); if (agentId) await prisma.user.delete({ where: { id: agentId } }); await prisma.$disconnect(); });

test("concurrent Telegram retries persist one contact, conversation and message without WhatsApp jobs", async () => {
  const event = inbound();
  const results = await Promise.all(Array.from({ length: 6 }, () => receiveTelegramEvent(event)));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal(await prisma.chatMessage.count(), 1);
  assert.equal(await prisma.chatContact.count(), 1);
  assert.equal(await prisma.rockyInboundTurn.count(), 0);
  assert.equal((await prisma.chatContact.findFirstOrThrow()).phone, null);
});
test("reply round trip and bridge echo create only one outgoing message", async () => {
  const result = await receiveTelegramEvent(inbound());
  const requestId = randomUUID();
  const input = { content: "Respuesta sintética", type: "TEXT" as const, requestId };
  const reply = await sendInternalMessage(result.conversationId!, input, agentId);
  assert.equal(reply.status, "sent");
  assert.equal((await sendInternalMessage(result.conversationId!, input, agentId)).id, reply.id);
  assert.equal(calls, 1); assert.equal(await prisma.chatMessage.count(), 2);
  assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: result.conversationId } })).botEnabled, false);
});
test("ambiguous sends remain uncertain and replay does not send twice", async () => {
  const result = await receiveTelegramEvent(inbound()); mode = "uncertain";
  const input = { content: "Respuesta", type: "TEXT" as const, requestId: randomUUID() };
  const reply = await sendInternalMessage(result.conversationId!, input, agentId);
  assert.equal(reply.status, "uncertain");
  await sendInternalMessage(result.conversationId!, input, agentId); assert.equal(calls, 1);
});
test("expired conversations cannot reach the sender", async () => {
  const result = await receiveTelegramEvent(inbound({ timestamp: Math.floor(Date.now() / 1000) - 86401 }));
  await assert.rejects(sendInternalMessage(result.conversationId!, { content: "No enviar", type: "TEXT", requestId: randomUUID() }, agentId), /24 horas/);
  assert.equal(calls, 0);
});
test("media references stay private and edits and deletes preserve the stored copy", async () => {
  const result = await receiveTelegramEvent(inbound({ type: "IMAGE", fileId: "private-file", content: "Foto" }));
  const first = await prisma.chatMessage.findFirstOrThrow({ where: { conversationId: result.conversationId } });
  assert.equal(first.mediaUrl, "telegram-file:private-file");
  await receiveTelegramEvent(inbound({ kind: "edit", type: "IMAGE", fileId: "private-file", content: "Foto corregida" }));
  await receiveTelegramEvent(inbound({ kind: "delete", messageIds: [10] }));
  const updated = await prisma.chatMessage.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(updated.content, "Foto corregida"); assert.equal(updated.status, "deleted");
});
test("an old queued control event cannot undo taking or resuming a conversation", async () => {
  const result = await receiveTelegramEvent(inbound());
  await updateConversation(result.conversationId!, { botEnabled: false, status: "ATENDIENDO" });
  await receiveTelegramEvent(inbound({ kind: "control", revision: 1, botEnabled: true }));
  assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: result.conversationId } })).botEnabled, false);
  await updateConversation(result.conversationId!, { botEnabled: true });
  assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: result.conversationId } })).botEnabled, true);
});
test("identical numeric chat IDs from separate connections never merge", async () => {
  await receiveTelegramEvent(inbound()); await receiveTelegramEvent(inbound({ connectionId: "another-account" }));
  assert.equal(await prisma.conversation.count(), 2);
  assert.notEqual(telegramMessageKey("test-linked", "12345", 10), telegramMessageKey("another-account", "12345", 10));
});
