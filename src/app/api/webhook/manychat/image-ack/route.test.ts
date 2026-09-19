import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { createManychatImageAckToken, verifyManychatImageAckToken } from "@/lib/manychat-image-ack";

test("ack token is scoped to one request and subscriber", () => {
  const token = createManychatImageAckToken("request-1", "123", "test-secret");
  assert.equal(verifyManychatImageAckToken("request-1", "123", token, "test-secret"), true);
  assert.equal(verifyManychatImageAckToken("request-2", "123", token, "test-secret"), false);
  assert.equal(verifyManychatImageAckToken("request-1", "456", token, "test-secret"), false);
  assert.equal(verifyManychatImageAckToken("request-1", "123", token, "wrong-secret"), false);
});

test("records one acknowledgement without asserting delivery and rejects forged or unknown requests", async t => {
  const previous = process.env.N8N_INTERNAL_API_KEY;
  const previousDb = global.prismaGlobal;
  process.env.N8N_INTERNAL_API_KEY = "test-secret";
  t.after(() => { if (previous === undefined) delete process.env.N8N_INTERNAL_API_KEY; else process.env.N8N_INTERNAL_API_KEY = previous; global.prismaGlobal = previousDb; });
  let exists = true, lookups = 0, writes = 0;
  global.prismaGlobal = {
    chatMessage: { findMany: async (args: { where: Record<string, unknown> }) => {
      lookups++; assert.equal(args.where.direction, "OUTBOUND"); assert.equal(args.where.messageType, "IMAGE");
      return exists ? [{ id: "message-1" }] : [];
    } },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.match(strings.join("?"), /COALESCE/);
      assert.equal(values[1], "message-1");
      assert.equal(JSON.parse(String(values[0])).manychatImageFlowAck.requestId, "request-1");
      return writes++ === 0 ? 1 : 0;
    },
  } as unknown as PrismaClient;
  const { POST } = await import("./route");
  const body = { requestId: "request-1", subscriberId: "123", token: createManychatImageAckToken("request-1", "123", "test-secret") };
  const request = (data: unknown) => new Request("http://localhost/api/webhook/manychat/image-ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  assert.equal((await POST(request({ ...body, token: "0".repeat(64) }))).status, 401);
  assert.equal(lookups, 0);
  assert.deepEqual(await (await POST(request(body))).json(), { ok: true, duplicate: false, flowProcessed: true, deliveryConfirmed: false });
  assert.deepEqual(await (await POST(request(body))).json(), { ok: true, duplicate: true, flowProcessed: true, deliveryConfirmed: false });
  exists = false;
  assert.equal((await POST(request(body))).status, 409);
});
