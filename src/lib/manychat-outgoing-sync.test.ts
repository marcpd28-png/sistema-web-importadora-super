import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { manychatOutgoingEventSchema, recordManychatOutgoing } from "./manychat-outgoing-sync";

const started = new Date("2026-09-19T12:00:00Z");
const now = new Date("2026-09-19T12:10:00Z");
const input = { eventId: "event-1", subscriberId: "123", occurredAt: "2026-09-19T12:01:00Z", source: "agent", type: "TEXT", content: "Hola" };

function database() {
  const messages: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    $executeRaw: async () => 1,
    conversation: {
      findMany: async () => [{ id: "conversation-1", contact: { externalId: "real" } }],
      updateMany: async (args: Record<string, unknown>) => { updates.push(args); return { count: 1 }; },
    },
    chatMessage: {
      findUnique: async ({ where }: { where: { externalMessageId: string } }) => messages.find(m => m.externalMessageId === where.externalMessageId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const message = { id: "message-1", ...data }; messages.push(message); return message; },
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(db),
  };
  return { db: db as unknown as PrismaClient, messages, updates };
}

test("new manual sends are stored outbound once without asserting delivery or changing unread counts", async () => {
  const { db, messages, updates } = database();
  const event = manychatOutgoingEventSchema.parse(input);
  const first = await recordManychatOutgoing(db, event, started, now);
  const second = await recordManychatOutgoing(db, event, started, now);
  assert.equal(first.duplicate, false); assert.equal(second.duplicate, true);
  assert.equal(messages.length, 1); assert.equal(messages[0].direction, "OUTBOUND");
  assert.equal(messages[0].senderType, "AGENT"); assert.equal(messages[0].status, "unknown");
  assert.equal((messages[0].createdAt as Date).toISOString(), event.occurredAt.replace("Z", ".000Z"));
  assert.deepEqual(Object.keys(updates[0].data as object), ["lastMessageAt"]);
  assert.deepEqual(updates[1], { where: { id: "conversation-1" }, data: { botEnabled: false, status: "ATENDIENDO" } });
  assert.equal(updates.length, 2, "a duplicated import must not pause a newly resumed conversation again");
});

test("old messages and invalid future timestamps are ignored before touching the database", async () => {
  const db = {} as PrismaClient;
  const old = manychatOutgoingEventSchema.parse({ ...input, occurredAt: "2026-09-18T12:00:00Z" });
  assert.deepEqual(await recordManychatOutgoing(db, old, started, now), { ignored: "before_activation" });
  const future = manychatOutgoingEventSchema.parse({ ...input, occurredAt: "2027-09-18T12:00:00Z" });
  assert.deepEqual(await recordManychatOutgoing(db, future, started, now), { ignored: "future_timestamp" });
});

test("automated attachments retain origin, media and explicit provider status", async () => {
  const { db, messages } = database();
  const event = manychatOutgoingEventSchema.parse({ ...input, source: "automation", type: "IMAGE", content: "", mediaUrl: "https://example.test/photo.jpg", status: "sent" });
  await recordManychatOutgoing(db, event, started, now);
  assert.equal(messages[0].senderType, "BOT"); assert.equal(messages[0].mediaUrl, event.mediaUrl);
  assert.equal(messages[0].status, "sent"); assert.equal((messages[0].metadata as Record<string, unknown>).externalSync, true);
});

test("contact mismatches cannot reuse another conversation's message identifier", async () => {
  const { db, messages } = database();
  messages.push({ id: "other-message", externalMessageId: "wamid.existing", conversationId: "other-conversation" });
  const event = manychatOutgoingEventSchema.parse({ ...input, externalMessageId: "wamid.existing" });
  assert.deepEqual(await recordManychatOutgoing(db, event, started, now), { ignored: "message_contact_mismatch" });
  assert.equal(messages.length, 1);
});
