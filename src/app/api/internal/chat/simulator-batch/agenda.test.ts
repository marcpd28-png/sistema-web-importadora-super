import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { emptyAgenda, planRequests, type RequestAgenda } from "@/lib/bc-request-agenda";

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
  const originalUpdatedAt = new Date("2026-09-18T00:00:00Z");
  let updatedAt = originalUpdatedAt;
  let salesUpdate: { selectedProductCode: string | null; stage: string } | null = null;
  const inbound = { id: "m1", content: "precio A1", direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", mediaUrl: null, createdAt: new Date(Date.now() - 15000) };
  const tx = {
    $executeRaw: async () => 1,
    conversation: { findUnique: async () => ({ botEnabled: true, assignedUserId: human ? "agent" : null, status: "AUTOMATICO", contact: { externalId: "SIMULATOR:agenda-test" } }), update: async () => ({}) },
    conversationRequestAgenda: {
      findUnique: async () => row,
      upsert: async ({ create, update }: { create: { revision: number; state: RequestAgenda }; update: { state: RequestAgenda } }) => { row = row ? { revision: row.revision + 1, state: update.state } : create; return row; },
    },
    product: { findMany: async () => [{ id: "p1", updatedAt, stockUnits: stock, unitPrice: 20, wholesalePrice: null, wholesaleMinQty: 6 }] },
    conversationSalesState: {
      findUnique: async () => ({ stage: "AWAITING_PURCHASE_CONFIRMATION" }),
      upsert: async ({ update }: { update: NonNullable<typeof salesUpdate> }) => { salesUpdate = update; return update; },
    },
    chatMessage: {
      findUnique: async () => duplicate ? { id: "reply" } : null,
      findFirst: async () => null,
      findMany: async ({ where }: { where: { externalMessageId?: unknown } }) => where.externalMessageId ? [] : [inbound, ...(superseded ? [{ ...inbound, id: "m2", createdAt: new Date() }] : [])],
      createMany: async () => { published++; return { count: 1 }; },
    },
  };
  global.prismaGlobal = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
  const { POST } = await import("./route");
  const send = async (revision = 0, extra = {}) => {
    const response = await POST(new Request("http://localhost/api/internal/chat/simulator-batch", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": "agenda-test" }, body: JSON.stringify({ conversationId: "sim", triggerMessageId: "m1", requestId: "bc:m1", messages: [{ type: "TEXT", content: "Precio confirmado" }], agenda: { expectedRevision: revision, state: emptyAgenda() }, inventory: [{ id: "p1", updatedAt: originalUpdatedAt.toISOString(), stockUnits: 10, unitPrice: "20", wholesalePrice: null, wholesaleMinQty: 6 }], ...extra }) }));
    assert.equal(response.status, 200); return response.json();
  };
  superseded = true;
  assert.equal((await send()).reason, "SUPERSEDED");
  assert.equal(row, null); assert.equal(published, 0);
  superseded = false; stock = 5;
  assert.equal((await send()).reason, "INVENTORY_CHANGED");
  assert.equal(row, null); assert.equal(published, 0);
  stock = 10;
  updatedAt = new Date("2026-09-18T00:01:00Z");
  assert.equal((await send()).reason, "INVENTORY_CHANGED", "photo or metadata edits invalidate prepared replies");
  updatedAt = originalUpdatedAt;
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
  human = false;
  const unavailable = planRequests(emptyAgenda(), [{ id: "m1", content: "parlante JBL" }]).agenda;
  assert.equal(unavailable.topics[0].selectedCode, null);
  assert.equal((await send(1, { agenda: { expectedRevision: 1, state: unavailable }, selection: { code: null, quantity: null } })).ok, true);
  assert.equal((salesUpdate as { selectedProductCode: string | null } | null)?.selectedProductCode, null);
  assert.equal((salesUpdate as { stage: string } | null)?.stage, "AWAITING_PRODUCT_QUERY");
});
