import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { ChatInputMessage } from "@/lib/chat-input-batch";

test("agrupa por conversación y descarta respuestas antiguas, tempranas o ya registradas", async t => {
  const previousKey = process.env.N8N_INTERNAL_API_KEY;
  const previousPrisma = global.prismaGlobal;
  process.env.N8N_INTERNAL_API_KEY = "test-only";
  t.after(() => {
    if (previousKey === undefined) delete process.env.N8N_INTERNAL_API_KEY;
    else process.env.N8N_INTERNAL_API_KEY = previousKey;
    global.prismaGlobal = previousPrisma;
  });
  type Row = ChatInputMessage & { conversationId: string; externalMessageId?: string; metadata?: Record<string, unknown> };
  const rows: Row[] = [];
  const start = Date.parse("2026-09-17T10:00:00Z");
  let now = start;
  let assignedUserId: string | null = null;
  t.mock.method(Date, "now", () => now);
  const add = (id: string, seconds: number, content: string, conversationId = "sim") => rows.push({ id, conversationId, content, createdAt: new Date(start + seconds * 1000), direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", mediaUrl: null, status: "delivered" });
  const ordered = (conversationId: string) => rows.filter(r => r.conversationId === conversationId).sort((a,b) => b.createdAt.getTime()-a.createdAt.getTime() || b.id.localeCompare(a.id));
  const tx = {
    $executeRaw: async () => 1,
    conversation: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ botEnabled: true, status: "AUTOMATICO", assignedUserId, contact: { externalId: where.id === "real" ? "51999999999" : `SIMULATOR:${where.id}` } }),
      update: async () => ({}),
    },
    chatMessage: {
      findUnique: async ({ where }: { where: { externalMessageId: string } }) => rows.find(r => r.externalMessageId === where.externalMessageId) ?? null,
      findFirst: async ({ where }: { where: { conversationId: string } }) => ordered(where.conversationId).find(r => r.direction === "OUTBOUND" && r.status === "sent") ?? null,
      findMany: async ({ where, take }: { where: { conversationId?: string; createdAt?: { gte: Date }; externalMessageId?: { in: string[] } }; take?: number }) => {
        if (where.externalMessageId) return rows.filter(r => where.externalMessageId!.in.includes(r.externalMessageId ?? "")).sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime());
        return ordered(where.conversationId!).filter(r => !where.createdAt || r.createdAt >= where.createdAt.gte).slice(0, take);
      },
      createMany: async ({ data }: { data: Row[] }) => {
        const fresh = data.filter(row => !rows.some(r => r.externalMessageId === row.externalMessageId));
        rows.push(...fresh.map((r, index) => ({ ...r, id: `out-${rows.length + index}` })));
        return { count: fresh.length };
      },
    },
  };
  global.prismaGlobal = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
  const { POST: input } = await import("./route");
  const { POST: output } = await import("../simulator-batch/route");
  const request = (body: unknown, key = "test-only") => new Request("http://localhost/api/internal/chat/test", { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": key }, body: JSON.stringify(body) });
  const read = (triggerMessageId: string, conversationId = "sim") => input(request({ triggerMessageId, conversationId })).then(r => r.json());
  const reply = (triggerMessageId: string) => output(request({ conversationId: "sim", triggerMessageId, requestId: `bc:${triggerMessageId}`, messages: [{ type: "TEXT", content: "Te comparto el catálogo de proyectores." }] })).then(r => r.json());

  assert.equal((await input(request({ conversationId: "sim", triggerMessageId: "a" }, "wrong"))).status, 401);
  assert.equal((await input(request({ conversationId: "real", triggerMessageId: "a" }))).status, 403);
  assert.equal((await input(request({}))).status, 400);
  add("a", 0, "hola");
  add("other", 1, "mensaje de otro cliente", "other-sim");
  now = start + 11000;
  assert.equal((await read("a")).batch.status, "WAITING");
  assert.equal((await reply("a")).reason, "WAITING");
  add("b", 11, "busco catálogo");
  now = start + 12000;
  assert.equal((await read("a")).batch.status, "SUPERSEDED");
  assert.equal((await reply("a")).reason, "SUPERSEDED");
  now = start + 23000;
  const ready = (await read("b")).batch;
  assert.equal(ready.content, "hola\nbusco catálogo");
  assert.deepEqual(ready.messageIds, ["a", "b"]);

  // A message arrives while the earlier catalog/AI response is being prepared.
  add("c", 24, "de proyectores");
  now = start + 25000;
  assert.equal((await reply("b")).reason, "SUPERSEDED");
  assert.equal(rows.filter(r => r.direction === "OUTBOUND").length, 0);
  now = start + 36000;
  assert.equal((await read("c")).batch.content, "hola\nbusco catálogo\nde proyectores");
  const sent = await reply("c");
  assert.equal(sent.messages.length, 1);
  assert.deepEqual(sent.messages[0].metadata.sourceMessageIds, ["a", "b", "c"]);
  assert.equal((await reply("c")).duplicate, true);
  assert.notEqual((await read("c")).batch.status, "READY");

  add("d", 40, "y ahora parlantes");
  now = start + 52000;
  assert.equal((await read("d")).batch.content, "y ahora parlantes");
  assignedUserId = "advisor";
  assert.equal((await read("d")).batch.status, "HUMAN_OWNS_CONVERSATION");
  assert.equal((await reply("d")).skipped, true);
});
