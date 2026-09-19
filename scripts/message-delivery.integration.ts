import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { enqueueManychatImage, cancelQueuedImage, processQueuedImages } from "../src/lib/manychat-image-queue";
import { extractDeliveryEvents, persistDeliveryEvents, reconcileDeliveryEvents } from "../src/lib/message-delivery";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(url.pathname.startsWith("/bc_message_delivery_test_"), "A dedicated disposable database is required");
  assert(["localhost", "127.0.0.1"].includes(url.hostname), "Only loopback test databases allowed");
  const db = new PrismaClient();
  try {
    const user = await db.user.create({ data: { email: "delivery@example.test", name: "Delivery test", passwordHash: "not-a-login", role: "ADMIN" } });
    const contact = await db.chatContact.create({ data: { name: "Isolated queue test", externalId: "51999999999", phoneNormalized: "51999999999", channel: "WHATSAPP", manychatSubscriberId: "123456" } });
    const conversation = await db.conversation.create({ data: { contactId: contact.id } });
    const input = { conversationId: conversation.id, subscriberId: "123456", requestId: "first", mediaUrl: "https://example.test/first.jpg", content: "First", agentId: user.id };
    const first = await enqueueManychatImage(db, input);
    const same = await Promise.all([enqueueManychatImage(db, input), enqueueManychatImage(db, input)]);
    assert(same.every(m => m.id === first.id));
    await assert.rejects(enqueueManychatImage(db, { ...input, content: "Different" }), /otro contenido/);
    const second = await enqueueManychatImage(db, { ...input, requestId: "second", mediaUrl: "https://example.test/second.jpg" });
    const third = await enqueueManychatImage(db, { ...input, requestId: "third", mediaUrl: "https://example.test/third.jpg" });
    assert(await cancelQueuedImage(db, third.id, user.id));
    const calls: string[] = [];
    const config = { apiKey: "fake", signingSecret: "fake", fetchImpl: async (url: string | URL | Request, options?: RequestInit) => {
      const request = JSON.parse(String(options?.body));
      calls.push(String(url).endsWith("setCustomFields") ? request.fields[0].field_value : "flow");
      return Response.json({ status: "success" });
    } };
    await Promise.all([processQueuedImages(db, config), processQueuedImages(db, config)]);
    assert.deepEqual(calls, [input.mediaUrl, "flow"], "Concurrent workers send the first image once");
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: second.id } })).status, "queued");
    assert.equal(await cancelQueuedImage(db, first.id, user.id), false);
    await db.$executeRaw`UPDATE "ChatMessage" SET "metadata" = "metadata" || '{"manychatImageFlowAck":{"processedAt":"test"}}'::jsonb WHERE "id" = ${first.id}`;
    await processQueuedImages(db, { ...config, fetchImpl: async (url, options) => {
      const response = await config.fetchImpl(url, options);
      if (String(url).endsWith("sendFlow")) await db.$executeRaw`UPDATE "ChatMessage" SET "metadata" = "metadata" || '{"manychatImageFlowAck":{"processedAt":"early"}}'::jsonb WHERE "id" = ${second.id}`;
      return response;
    } });
    assert.deepEqual(calls, [input.mediaUrl, "flow", "https://example.test/second.jpg", "flow"]);
    const early = await db.chatMessage.findUniqueOrThrow({ where: { id: second.id } });
    assert.equal((early.metadata as Record<string, unknown>).manychatImageFlowAck !== undefined, true);
    const uncertain = await enqueueManychatImage(db, { ...input, requestId: "timeout" });
    await processQueuedImages(db, { ...config, fetchImpl: async () => { throw Error("timeout"); } });
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: uncertain.id } })).status, "uncertain");
    await enqueueManychatImage(db, { ...input, requestId: "waiting" });
    const before = calls.length;
    await processQueuedImages(db, config, new Date(Date.now() + 3_600_000));
    assert.equal(calls.length, before, "Timeout never frees contact or blindly retries");
    const otherContact = await db.chatContact.create({ data: { name: "Other isolated contact", externalId: "51888888888", phoneNormalized: "51888888888", channel: "WHATSAPP", manychatSubscriberId: "654321" } });
    const otherConversation = await db.conversation.create({ data: { contactId: otherContact.id } });
    const otherInput = { ...input, conversationId: otherConversation.id, subscriberId: "654321" };
    const rejected = await enqueueManychatImage(db, otherInput);
    await processQueuedImages(db, { ...config, fetchImpl: async () => Response.json({ status: "error" }, { status: 400 }) });
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: rejected.id } })).status, "failed");
    const crashed = await enqueueManychatImage(db, { ...otherInput, requestId: "crashed" });
    await db.$executeRaw`UPDATE "ChatMessage" SET "status" = 'pending', "metadata" = "metadata" || '{"manychatImageDispatch":"reserved","dispatchStartedAt":"2020-01-01T00:00:00.000Z"}'::jsonb WHERE "id" = ${crashed.id}`;
    const waitingOther = await enqueueManychatImage(db, { ...otherInput, requestId: "after-crash" });
    await processQueuedImages(db, config);
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: crashed.id } })).status, "uncertain");
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: waitingOther.id } })).status, "queued");
    await db.$executeRaw`UPDATE "ChatMessage" SET "metadata" = "metadata" || '{"manychatImageFlowAck":{"processedAt":"late"}}'::jsonb WHERE "id" = ${crashed.id}`;
    await processQueuedImages(db, config);
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: waitingOther.id } })).status, "sent", "Late callback releases only its own contact");
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: uncertain.id } })).status, "uncertain");

    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = (status: string, recipient = contact.phoneNormalized) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "123" }, statuses: [{ id: "wamid.isolated", recipient_id: recipient, status, timestamp }],
    } }] }] });
    const events = extractDeliveryEvents(payload("delivered"), new Set(["123"]));
    assert.equal(await persistDeliveryEvents(db, events), 1);
    assert.equal(await persistDeliveryEvents(db, events), 0);
    assert.equal((await reconcileDeliveryEvents(db)).applied, 0, "Receipt is retained before message arrives");
    assert.equal(await db.messageDeliveryEvent.count({ where: { reconciledAt: null } }), 1);
    const sent = await db.chatMessage.create({ data: { conversationId: conversation.id, direction: "OUTBOUND", senderType: "AGENT", content: "Test", status: "sent", externalMessageId: "wamid.isolated", metadata: { requestId: "preserved" } } });
    await reconcileDeliveryEvents(db, new Date(Date.now() + 360_000));
    assert.equal((await db.chatMessage.findUniqueOrThrow({ where: { id: sent.id } })).status, "delivered");
    await persistDeliveryEvents(db, extractDeliveryEvents(payload("read"), new Set(["123"])));
    await Promise.all([reconcileDeliveryEvents(db), reconcileDeliveryEvents(db)]);
    await persistDeliveryEvents(db, extractDeliveryEvents(payload("failed"), new Set(["123"])));
    await reconcileDeliveryEvents(db);
    const read = await db.chatMessage.findUniqueOrThrow({ where: { id: sent.id } });
    assert.equal(read.status, "read");
    assert.equal((read.metadata as Record<string, unknown>).requestId, "preserved");
    await persistDeliveryEvents(db, extractDeliveryEvents(payload("sent", "51888888888"), new Set(["123"])));
    await reconcileDeliveryEvents(db);
    assert.equal(await db.messageDeliveryEvent.count({ where: { reconciledAt: null } }), 1, "Wrong recipient never updates another contact");
    console.log("PASS: concurrent queue, dedupe, cancellation, early callback, timeout isolation, durable receipts, late mapping, recipient protection, monotonic delivery");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
