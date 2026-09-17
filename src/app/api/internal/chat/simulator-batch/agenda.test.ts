import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { emptyAgenda, type RequestAgenda } from "@/lib/bc-request-agenda";

test("agenda and answers commit together only for the current batch, stock and revision", async t => {
  const previous = global.prismaGlobal;
  const key = process.env.N8N_INTERNAL_API_KEY;
  process.env.N8N_INTERNAL_API_KEY = "agenda-test";
  t.after(() => { global.prismaGlobal = previous; if (key === undefined) delete process.env.N8N_INTERNAL_API_KEY; else process.env.N8N_INTERNAL_API_KEY = key; });
  let row: { revision: number; state: RequestAgenda } | null = null;
  let published = 0;
  let stock = 10;
  let superseded = false;
  let duplicate = false;
  let human = false;
  const inbound = { id: "m1", content: "precio A1", direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", mediaUrl: null, createdAt: new Date(Date.now() - 15000) };
  const tx = {
    $executeRaw: async () => 1,
    conversation: { findUnique: async () => ({ botEnabled: true, assignedUserId: human ? "agent" : null, status: "AUTOMATICO", contact: { externalId: "SIMULATOR:agenda-test" } }), update: async () => ({}) },
    conversationRequestAgenda: {
      findUnique: async () => row,
      upsert: async ({ create, update }: { create: { revision: number; state: RequestAgenda }; update: { state: RequestAgenda } }) => { row = row ? { revision: row.revision + 1, state: update.state } : create; return row; },
    },
    product: { findMany: async () => [{ id: "p1", stockUnits: stock, unitPrice: 20, wholesalePrice: null, wholesaleMinQty: 6 }] },
    chatMessage: {
      findUnique: async () => duplicate ? { id: "reply" } : null,
      findFirst: async () => null,
      findMany: async ({ where }: { where: { externalMessageId?: unknown } }) => where.externalMessageId ? [] : [inbound, ...(superseded ? [{ ...inbound, id: "m2", createdAt: new Date() }] : [])],
      createMany: async () => { published++; return { count: 1 }; },
    },
  };
  global.prismaGlobal = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
  const { POST } = await import("./route");
  const send = async (revision = 0) => {
    const response = await POST(new Request("http://localhost/api/internal/chat/simulator-batch", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": "agenda-test" }, body: JSON.stringify({ conversationId: "sim", triggerMessageId: "m1", requestId: "bc:m1", messages: [{ type: "TEXT", content: "Precio confirmado" }], agenda: { expectedRevision: revision, state: emptyAgenda() }, inventory: [{ id: "p1", stockUnits: 10, unitPrice: "20", wholesalePrice: null, wholesaleMinQty: 6 }] }) }));
    assert.equal(response.status, 200); return response.json();
  };
  superseded = true;
  assert.equal((await send()).reason, "SUPERSEDED");
  assert.equal(row, null); assert.equal(published, 0);
  superseded = false; stock = 5;
  assert.equal((await send()).reason, "INVENTORY_CHANGED");
  assert.equal(row, null); assert.equal(published, 0);
  stock = 10;
  assert.equal((await send()).ok, true);
  assert.equal(published, 1);
  assert.equal((row as { revision: number } | null)?.revision, 1);
  assert.equal((await send()).reason, "AGENDA_CHANGED");
  assert.equal(published, 1);
  duplicate = true;
  assert.equal((await send()).duplicate, true);
  assert.equal(published, 1);
  duplicate = false; human = true;
  assert.equal((await send(1)).skipped, true);
  assert.equal(published, 1);
});
