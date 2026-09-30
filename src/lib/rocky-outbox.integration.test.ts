import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { RockyOutbox } from "./rocky-outbox";
import { recordYCloudReceipt } from "./ycloud-receipts";
import type { YCloudOutboundMessageInput } from "./ycloud-outbound";

const url = process.env.ROCKY_TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/rocky_phase2_integration") {
  throw new Error("Use a disposable localhost database named rocky_phase2_integration; no production tests allowed");
}
if (process.env.DATABASE_URL !== url) throw new Error("DATABASE_URL must also point to the disposable test database");
const db = new PrismaClient({ datasourceUrl: url });
const sent: YCloudOutboundMessageInput[] = [];
const recipient = "+15005550006";
const notify = () => {};
let deliver: (input: YCloudOutboundMessageInput) => Promise<{ messageId: string; provider: "ycloud" }>;
const outbox = new RockyOutbox(db, input => deliver(input), notify);

beforeEach(async () => {
  await db.chatContact.deleteMany();
  await db.user.deleteMany();
  await db.storeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: { botMasterSwitch: true } });
  sent.length = 0;
  deliver = async input => { sent.push(input); return { messageId: randomUUID(), provider: "ycloud" }; };
});
after(async () => { await db.$disconnect(); });

async function fixture() {
  const contact = await db.chatContact.create({ data: { name: "Phase 2 synthetic test", externalId: recipient, phoneNormalized: "15005550006", channel: "WHATSAPP" } });
  const conversation = await db.conversation.create({ data: { contactId: contact.id } });
  const inbound = await db.chatMessage.create({ data: { conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", content: "hola" } });
  const input = { conversationId: conversation.id, recipient, source: "test", content: "Respuesta de prueba" };
  const run = <T>(work: () => Promise<T>) => outbox.runTurn(conversation.id, inbound.id, work, null);
  return { conversation, inbound, input, run };
}

test("persists before delivery, deduplicates concurrent producers and sends once", async () => {
  const f = await fixture();
  await Promise.all([f.run(() => outbox.enqueue(f.input)), f.run(() => outbox.enqueue(f.input))]);
  assert.equal(sent.length, 0);
  assert.equal(await db.rockyOutboundJob.count(), 1);
  await outbox.tick(); await outbox.tick();
  assert.equal(sent.length, 1);
  assert.ok(sent[0].externalId);
  assert.equal((await db.rockyOutboundJob.findFirst())?.state, "submitted");
});

test("retired product messages already in the outbox cannot reach the provider", async () => {
  const f = await fixture();
  for (const source of ["product_search_result", "product_search_result_without_image", "verified_quantity_quote", "product_selection_quantity", "product_clarification"]) {
    await f.run(() => outbox.enqueue({ ...f.input, content: source, source }));
    await outbox.tick();
  }
  assert.equal(sent.length, 0);
  assert.equal(await db.rockyOutboundJob.count({ where: { state: "cancelled", reason: "product_automation_retired" } }), 5);
});

test("an identical automatic reply cannot appear a third time even after the dedupe window", async () => {
  const f = await fixture();
  for (let i = 0; i < 2; i++) await db.chatMessage.create({ data: {
    conversationId: f.conversation.id, senderType: "BOT", direction: "OUTBOUND", messageType: "TEXT",
    content: f.input.content, status: "delivered", createdAt: new Date(Date.now() - (i + 1) * 60 * 60_000),
  } });
  await f.run(() => outbox.enqueue(f.input));
  assert.equal(await db.rockyOutboundJob.count(), 0);
});

test("human intervention during debounce prevents enqueue and stale handoff", async () => {
  const f = await fixture();
  await f.run(async () => {
    await db.conversation.update({ where: { id: f.conversation.id }, data: { botEnabled: false, status: "ATENDIENDO" } });
    await outbox.enqueue(f.input);
  });
  assert.equal(await db.rockyOutboundJob.count(), 0);
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: f.conversation.id } })).status, "ATENDIENDO");
});

test("human message insertion alone cancels queued text, image and document", async () => {
  const f = await fixture();
  await f.run(async () => {
    await outbox.enqueue(f.input);
    await outbox.enqueue({ ...f.input, type: "image", mediaUrl: "https://example.com/image.jpg" });
    await outbox.enqueue({ ...f.input, type: "document", mediaUrl: "https://example.com/test.pdf" });
  });
  await db.chatMessage.create({ data: { conversationId: f.conversation.id, direction: "OUTBOUND", senderType: "AGENT", content: "Atendiendo" } });
  assert.equal(await db.rockyOutboundJob.count({ where: { state: "cancelled" } }), 3);
  await outbox.tick(); assert.equal(sent.length, 0);
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: f.conversation.id } })).botEnabled, false);
});

test("taking a chat pauses even when a legacy writer only assigns the advisor", async () => {
  const f = await fixture();
  const advisor = await db.user.create({ data: { name: "Test", email: "phase2@example.invalid", passwordHash: "not-a-password" } });
  await f.run(async () => {
    await outbox.enqueue(f.input);
    await db.conversation.update({ where: { id: f.conversation.id }, data: { assignedUserId: advisor.id } });
    await outbox.handoff(f.input);
  });
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: f.conversation.id } });
  assert.equal(conversation.assignedUserId, advisor.id);
  assert.equal(conversation.botEnabled, false);
  assert.equal(await db.rockyOutboundJob.count({ where: { state: "queued" } }), 0);
});

test("pause then resume cannot revive old work; new work can run", async () => {
  const f = await fixture();
  await f.run(async () => {
    await outbox.enqueue(f.input);
    await db.conversation.update({ where: { id: f.conversation.id }, data: { botEnabled: false } });
    await db.conversation.update({ where: { id: f.conversation.id }, data: { botEnabled: true } });
    await outbox.enqueue({ ...f.input, content: "Stale" });
  });
  assert.equal(await db.rockyOutboundJob.count(), 1);
  await f.run(() => outbox.enqueue(f.input));
  await outbox.tick(); assert.equal(sent.length, 1);
});

test("global off blocks intent processing and queue consumption", async () => {
  const f = await fixture();
  await f.run(() => outbox.enqueue(f.input));
  await db.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  let ran = false;
  await f.run(async () => { ran = true; });
  await outbox.tick();
  assert.equal(ran, false); assert.equal(sent.length, 0);
  assert.equal((await db.rockyOutboundJob.findFirst())?.state, "cancelled");
});

test("global off/on invalidates in-progress generation even after reactivation", async () => {
  const f = await fixture();
  await f.run(async () => {
    await db.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
    await db.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: true } });
    await outbox.enqueue(f.input);
  });
  assert.equal(await db.rockyOutboundJob.count(), 0);
});

test("closing the chat cancels replies", async () => {
  const f = await fixture(); await f.run(() => outbox.enqueue(f.input));
  await db.conversation.update({ where: { id: f.conversation.id }, data: { status: "CERRADO" } });
  await outbox.tick(); assert.equal(sent.length, 0);
});

test("handoff permits exactly its notice while the bot is paused", async () => {
  const f = await fixture();
  await f.run(async () => { await outbox.handoff(f.input); await outbox.enqueue({ ...f.input, content: "Must not send" }); });
  await outbox.tick(); await outbox.tick();
  assert.equal(sent.length, 1);
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: f.conversation.id } })).botEnabled, false);
});

test("a human takeover cancels even the pending handoff notice", async () => {
  const f = await fixture(); await f.run(() => outbox.handoff(f.input));
  await db.conversation.update({ where: { id: f.conversation.id }, data: { status: "ATENDIENDO" } });
  await outbox.tick(); assert.equal(sent.length, 0);
});

test("one sender across workers; human takeover is not blocked by provider IO", async () => {
  const f = await fixture();
  await f.run(async () => { await outbox.enqueue(f.input); await outbox.enqueue({ ...f.input, content: "Second" }); });
  let release!: () => void;
  const providerWaiting = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const providerStarted = new Promise<void>(resolve => { started = resolve; });
  deliver = async input => { sent.push(input); started(); await providerWaiting; return { messageId: randomUUID(), provider: "ycloud" }; };
  const active = outbox.tick(); await providerStarted;
  try {
    assert.equal(await outbox.tick(), false);
    await db.conversation.update({ where: { id: f.conversation.id }, data: { botEnabled: false, status: "ATENDIENDO" } });
    assert.equal(await db.rockyOutboundJob.count({ where: { state: "cancelled" } }), 1);
  } finally { release(); }
  await active; await outbox.tick();
  assert.equal(sent.length, 1); // In-flight first reply cannot be recalled.
});

test("ambiguous provider failure is never retried and cancels the remainder", async () => {
  const f = await fixture();
  await f.run(async () => { await outbox.enqueue(f.input); await outbox.enqueue({ ...f.input, content: "Second" }); });
  deliver = async input => { sent.push(input); throw new Error("timeout after acceptance"); };
  await outbox.tick(); await outbox.tick();
  assert.equal(sent.length, 1);
  assert.equal(await db.rockyOutboundJob.count({ where: { state: "uncertain" } }), 1);
  assert.equal(await db.rockyOutboundJob.count({ where: { state: "cancelled" } }), 1);
});

test("a sender restart preserves queued work but never resends an abandoned claim", async () => {
  const f = await fixture(); await f.run(() => outbox.enqueue(f.input));
  await db.rockyOutboundJob.updateMany({ data: { state: "sending", startedAt: new Date() } });
  await new RockyOutbox(db, input => deliver(input), notify).tick();
  assert.equal(sent.length, 0);
  assert.equal((await db.rockyOutboundJob.findFirst())?.state, "uncertain");
});

test("expired or superseded replies never reach the transport", async () => {
  const f = await fixture(); await f.run(() => outbox.enqueue(f.input));
  await db.rockyOutboundJob.updateMany({ data: { expiresAt: new Date(0) } });
  await outbox.tick();
  await f.run(() => outbox.enqueue({ ...f.input, content: "New" }));
  await db.chatMessage.create({ data: { conversationId: f.conversation.id, direction: "INBOUND", senderType: "CUSTOMER", content: "precio", createdAt: new Date(Date.now() + 100) } });
  await outbox.tick(); assert.equal(sent.length, 0);
});

test("early provider receipt uses local externalId, preserves BOT and monotonic status", async () => {
  const f = await fixture(); await f.run(() => outbox.enqueue(f.input));
  deliver = async input => {
    sent.push(input);
    assert.equal(await recordYCloudReceipt(db, { ids: ["provider-id"], externalId: input.externalId!, recipient, status: "delivered" }), true);
    return { messageId: "provider-id", provider: "ycloud" };
  };
  await outbox.tick();
  await recordYCloudReceipt(db, { ids: ["provider-id"], externalId: null, recipient, status: "sent" });
  const message = await db.chatMessage.findUniqueOrThrow({ where: { id: sent[0].externalId } });
  assert.equal(message.senderType, "BOT"); assert.equal(message.status, "delivered");
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: f.conversation.id } })).botEnabled, true);
});

test("late receipt resolves uncertainty and does not reactivate a paused conversation", async () => {
  const f = await fixture(); await f.run(() => outbox.enqueue(f.input));
  deliver = async input => { sent.push(input); throw new Error("timeout"); };
  await outbox.tick();
  await recordYCloudReceipt(db, { ids: ["provider-id"], externalId: sent[0].externalId!, recipient, status: "delivered" });
  assert.equal((await db.rockyOutboundJob.findFirst())?.state, "submitted");
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: f.conversation.id } })).botEnabled, false);
});

test("provider-confirmed failure cancels the rest of the queue", async () => {
  const f = await fixture();
  await f.run(async () => { await outbox.enqueue(f.input); await outbox.enqueue({ ...f.input, content: "Second" }); });
  deliver = async input => {
    sent.push(input);
    await recordYCloudReceipt(db, { ids: ["failed-provider-id"], externalId: input.externalId!, recipient, status: "failed" });
    return { messageId: "failed-provider-id", provider: "ycloud" };
  };
  await outbox.tick(); await outbox.tick();
  assert.equal(sent.length, 1);
  assert.equal(await db.rockyOutboundJob.count({ where: { state: "failed" } }), 1);
});

test("recipient mismatch and simulator contacts cannot generate real sends", async () => {
  const f = await fixture();
  await assert.rejects(f.run(() => outbox.enqueue({ ...f.input, recipient: "+15005550007" })), /does not match/);
  await db.chatContact.update({ where: { id: f.conversation.contactId }, data: { externalId: "SIMULATOR:phase2" } });
  await f.run(() => outbox.enqueue(f.input));
  assert.equal(await db.rockyOutboundJob.count(), 0);
});

test("retired producers cannot refill old queues", async () => {
  const f = await fixture();
  const old = await db.chatMessage.create({ data: { conversationId: f.conversation.id, senderType: "BOT", direction: "OUTBOUND", content: "Legacy", status: "bc_queued" } });
  assert.equal(old.status, "cancelled");
  const retry = await db.chatMessage.update({ where: { id: old.id }, data: { status: "bc_sending" } });
  assert.equal(retry.status, "cancelled");
});

test("an inbound message hours later never automatically reactivates human control", async () => {
  const { processIncomingMessage } = await import("./messages-service");
  const f = await fixture();
  await db.conversation.update({ where: { id: f.conversation.id }, data: { botEnabled: false, status: "ATENDIENDO", lastMessageAt: new Date(Date.now() - 2 * 3600_000) } });
  const result = await processIncomingMessage({ channel: "WHATSAPP", externalContactId: recipient, externalMessageId: randomUUID(), phone: recipient, name: "Test", metadata: {}, content: "hola otra vez", type: "TEXT", timestamp: new Date().toISOString() });
  assert.equal(result.conversationId, f.conversation.id);
  assert.equal(result.conversation?.botEnabled, false);
});

test("real advisor service pauses and cancels BEFORE its provider call", async () => {
  const { sendInternalMessage } = await import("./messages-service");
  const f = await fixture(); await f.run(() => outbox.enqueue(f.input));
  const advisor = await db.user.create({ data: { name: "Test", email: "phase2@example.invalid", passwordHash: "not-a-password" } });
  const oldFetch = globalThis.fetch;
  process.env.YCLOUD_API_KEY = "synthetic-test-key";
  process.env.YCLOUD_WHATSAPP_FROM = "+15005550007";
  globalThis.fetch = async (_url, init) => {
    const c = await db.conversation.findUniqueOrThrow({ where: { id: f.conversation.id } });
    assert.equal(c.botEnabled, false); assert.equal(c.assignedUserId, advisor.id);
    assert.equal((await db.rockyOutboundJob.findFirst())?.state, "cancelled");
    assert.ok(JSON.parse(String(init?.body)).externalId);
    return new Response(JSON.stringify({ id: "manual-provider-id" }), { status: 200 });
  };
  try {
    await sendInternalMessage(f.conversation.id, { content: "Asesor", type: "TEXT", requestId: randomUUID() }, advisor.id);
  } finally { globalThis.fetch = oldFetch; delete process.env.YCLOUD_API_KEY; delete process.env.YCLOUD_WHATSAPP_FROM; }
});

test("signed inbound webhook persists a ten-second task and returns before processing", async () => {
  const { createHmac } = await import("node:crypto");
  const { NextRequest } = await import("next/server");
  const { POST } = await import("../app/api/webhook/ycloud/route");
  const f = await fixture();
  process.env.YCLOUD_WEBHOOK_SECRET = "synthetic-webhook-secret";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ type: "whatsapp.inbound_message.received", whatsappInboundMessage: { id: randomUUID(), from: recipient, type: "text", text: { body: "Hola" } } });
  const signature = createHmac("sha256", process.env.YCLOUD_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex");
  const started = Date.now();
  const response = await POST(new NextRequest("https://example.invalid/api/webhook/ycloud", { method: "POST", body, headers: { "ycloud-signature": `t=${timestamp},s=${signature}` } }));
  assert.ok(Date.now() - started < 3000);
  const pending = await db.rockyInboundTurn.findUniqueOrThrow({ where: { conversationId: f.conversation.id } });
  assert.equal(pending.state, "pending");
  assert.ok(pending.dueAt.getTime() >= started + 10_000);
  assert.equal(await db.rockyOutboundJob.count(), 0);
  await db.chatMessage.create({ data: { conversationId: f.conversation.id, direction: "OUTBOUND", senderType: "AGENT", content: "Yo lo atiendo" } });
  assert.equal(response.status, 200);
  assert.equal((await db.rockyInboundTurn.findUniqueOrThrow({ where: { conversationId: f.conversation.id } })).state, "cancelled");
  assert.equal(await db.rockyOutboundJob.count(), 0);
  delete process.env.YCLOUD_WEBHOOK_SECRET;
});
