import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { runManychatImageFlow, sendManychatImageFromInbox } from "./manychat-image-dispatch";
import { verifyManychatImageAckToken } from "./manychat-image-ack";

const input = { conversationId: "conversation-1", subscriberId: "12345", requestId: "request-1", mediaUrl: "https://example.test/photo.jpg", content: "Foto", agentId: "agent-1" };
const config = { apiKey: "test-key", signingSecret: "test-secret" };

test("invalid input is rejected before reserving a contact", async () => {
  await assert.rejects(sendManychatImageFromInbox({} as PrismaClient, { ...input, subscriberId: "9007199254740993" }, config), /no son válidos/);
});

test("writes all four fields before starting the exact flow; acknowledgement is scoped to request and contact", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  await runManychatImageFlow(input, { ...config, fetchImpl: async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return Response.json({ status: "success" });
  } });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /subscriber\/setCustomFields$/);
  const fields = calls[0].body.fields as Array<{ field_id: number; field_value: string }>;
  assert.equal(fields.find(f => f.field_id === 14982263)?.field_value, input.mediaUrl);
  assert.equal(fields.find(f => f.field_id === 14982291)?.field_value, input.requestId);
  assert(verifyManychatImageAckToken(input.requestId, input.subscriberId, fields.find(f => f.field_id === 14982292)!.field_value, config.signingSecret));
  assert.deepEqual(calls[1].body, { subscriber_id: 12345, flow_ns: "content20260919025706_215753" });
});

test("never starts the flow when updating custom fields fails", async () => {
  let count = 0;
  await assert.rejects(runManychatImageFlow(input, { ...config, fetchImpl: async () => { count++; return Response.json({ status: "error" }, { status: 400 }); } }), /rechazó/);
  assert.equal(count, 1);
});

function database() {
  type Row = { id: string; conversationId: string; createdAt: Date; status: string; metadata: Record<string, unknown> };
  const rows: Row[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("pg_advisory_xact_lock")) return 1;
      const sent = sql.includes("'sent'");
      const row = rows.find(r => r.id === values[sent ? 2 : 1])!;
      Object.assign(row.metadata, JSON.parse(String(values[sent ? 1 : 0])));
      row.status = sent ? "sent" : "failed";
      return 1;
    },
    $queryRaw: async (_strings: TemplateStringsArray, subscriber: string) => rows.filter(r => r.metadata.manychatImageSubscriber === subscriber
      && ["reserved", "accepted", "uncertain"].includes(String(r.metadata.manychatImageDispatch)) && !r.metadata.manychatImageFlowAck).map(r => ({ id: r.id })),
    chatMessage: {
      findFirst: async ({ where }: { where: { metadata: { equals: string } } }) => rows.find(r => r.metadata.requestId === where.metadata.equals) ?? null,
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => { const row = { id: `message-${rows.length}`, createdAt: new Date(), ...data }; rows.push(row); return row; },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => rows.find(r => r.id === where.id)!,
    },
    conversation: { update: async () => ({}) },
  };
  const db = { ...tx, $transaction: (callback: (client: typeof tx) => Promise<unknown>) => {
    const result = queue.then(() => callback(tx)); queue = result.catch(() => undefined); return result;
  } } as unknown as PrismaClient;
  return { db, rows };
}

test("per-contact reservation blocks the next image until callback and preserves a callback arriving before HTTP response", async () => {
  const { db, rows } = database();
  let calls = 0;
  const options = { ...config, fetchImpl: async () => { calls++; return Response.json({ status: "success" }); } };
  await sendManychatImageFromInbox(db, input, options);
  await assert.rejects(sendManychatImageFromInbox(db, { ...input, requestId: "request-2" }, options), /imagen anterior/);
  assert.equal(calls, 2); assert.equal(rows.length, 1);
  rows[0].metadata.manychatImageFlowAck = { processedAt: new Date().toISOString() };
  await sendManychatImageFromInbox(db, { ...input, requestId: "request-2" }, { ...config, fetchImpl: async url => {
    if (String(url).endsWith("sendFlow")) rows[1].metadata.manychatImageFlowAck = { processedAt: "early-ack" };
    return Response.json({ status: "success" });
  } });
  assert.deepEqual(rows[1].metadata.manychatImageFlowAck, { processedAt: "early-ack" });
  await sendManychatImageFromInbox(db, input, options);
  assert.equal(calls, 2, "same request must not send again");
});

test("network uncertainty remains reserved and cannot overwrite fields on retry", async () => {
  const { db, rows } = database();
  let calls = 0;
  const options = { ...config, fetchImpl: async () => { calls++; throw new Error("timeout"); } };
  await assert.rejects(sendManychatImageFromInbox(db, input, options), /no confirmó/);
  assert.equal(rows[0].metadata.manychatImageDispatch, "uncertain"); assert.equal(rows[0].metadata.retryBlocked, true);
  await assert.rejects(sendManychatImageFromInbox(db, { ...input, requestId: "request-2" }, options), /imagen anterior/);
  assert.equal(calls, 1);
});

test("explicit provider rejection allows a later request", async () => {
  const { db, rows } = database();
  await assert.rejects(sendManychatImageFromInbox(db, input, { ...config, fetchImpl: async () => Response.json({ status: "error" }, { status: 400 }) }), /rechazó/);
  assert.equal(rows[0].metadata.manychatImageDispatch, "rejected");
  await sendManychatImageFromInbox(db, { ...input, requestId: "request-2" }, { ...config, fetchImpl: async () => Response.json({ status: "success" }) });
  assert.equal(rows[1].status, "sent");
});
