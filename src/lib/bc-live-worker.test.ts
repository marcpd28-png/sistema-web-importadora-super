import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { processBcLivePilot } from "./bc-live-worker";

test("worker visits contacts beyond the first page and isolates conversation failures", async t => {
  const config = { BC_LIVE_ENABLED: "true", BC_LIVE_SCOPE: "ALL", BC_LIVE_STARTED_AT: "2026-01-01T00:00:00Z", N8N_INTERNAL_API_KEY: "worker-test" };
  const before = new Map(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  t.after(() => { for (const [key, value] of before) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const seen = new Set<string>();
  const conversations = Array.from({ length: 30 }, (_, index) => ({
    id: String(index).padStart(3, "0"), contact: { externalId: `customer-${index}`, phoneNormalized: `5190000${String(index).padStart(4, "0")}` },
  }));
  const db = {
    storeSettings: { findUnique: async () => ({ botMasterSwitch: true }) },
    conversation: { findMany: async ({ where, take }: { where: { id?: { gt: string }; channel: string; assignedUserId: unknown; botEnabled: boolean }; take: number }) => {
      assert.equal(where.channel, "WHATSAPP"); assert.equal(where.assignedUserId, null); assert.equal(where.botEnabled, true);
      return conversations.filter(row => !where.id || row.id > where.id.gt).slice(0, take);
    } },
    $executeRaw: async (_sql: unknown, id: string) => { seen.add(id); if (id === "000") throw new Error("one failed conversation"); return 0; },
    chatMessage: { count: async () => 0, findFirst: async () => null },
  } as unknown as PrismaClient;
  await processBcLivePilot(db);
  assert.equal(seen.size, 25);
  await processBcLivePilot(db);
  assert.equal(seen.size, 30);
  seen.clear();
  await processBcLivePilot(db);
  assert.ok(seen.has("000"), "pagination wraps to the beginning");
  await processBcLivePilot(db);
});
