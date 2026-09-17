import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

test("el simulador guarda el saludo y la respuesta completa, sin duplicar ni responder a contactos reales", async (t) => {
  const previousKey = process.env.N8N_INTERNAL_API_KEY;
  const previousPrisma = global.prismaGlobal;
  process.env.N8N_INTERNAL_API_KEY = "test-only";
  t.after(() => {
    if (previousKey === undefined) delete process.env.N8N_INTERNAL_API_KEY;
    else process.env.N8N_INTERNAL_API_KEY = previousKey;
    global.prismaGlobal = previousPrisma;
  });
  type SavedMessage = {
    id: string; externalMessageId: string; content: string; mediaUrl: string | null; messageType: string;
    createdAt: Date; metadata: { batchSize: number; batchIndex: number };
  };
  const saved: SavedMessage[] = [];
  let externalId = "SIMULATOR:test";
  let botEnabled = true;
  let updates = 0;
  let now = new Date("2026-09-17T20:00:00-05:00").getTime();
  t.mock.method(Date, "now", () => now);
  const tx = {
    $executeRaw: async () => 1,
    conversation: {
      findUnique: async () => ({ botEnabled, assignedUserId: null, status: "AUTOMATICO", contact: { externalId } }),
      update: async () => { updates++; },
    },
    chatMessage: {
      findUnique: async ({ where }: { where: { externalMessageId: string } }) => saved.find(m => m.externalMessageId === where.externalMessageId) ?? null,
      createMany: async ({ data }: { data: SavedMessage[] }) => {
        const fresh = data.filter(m => !saved.some(existing => existing.externalMessageId === m.externalMessageId));
        saved.push(...fresh.map((m, index) => ({ ...m, id: `${saved.length + index}` })));
        return { count: fresh.length };
      },
      findMany: async ({ where }: { where: { externalMessageId: { in: string[] } } }) => saved.filter(m => where.externalMessageId.in.includes(m.externalMessageId)),
    },
  };
  global.prismaGlobal = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
  const { POST } = await import("./route");
  const send = (requestId: string, messages: unknown[], key = "test-only") => POST(new Request("http://localhost/api/internal/chat/simulator-batch", {
    method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": key },
    body: JSON.stringify({ conversationId: "sim", requestId, messages }),
  }));
  const catalog = [{ type: "DOCUMENT", content: "Te comparto el catálogo completo.", mediaUrl: "https://example.com/catalog.pdf" }];
  let response = await send("catalog:1", catalog);
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.messages[0].content, "¡Buenas noches! 😊 Te comparto el catálogo completo.");
  assert.equal(body.messages[0].mediaUrl, catalog[0].mediaUrl);
  assert.equal(body.messages[0].messageType, "DOCUMENT");

  // A retry in another time period keeps the already recorded reply.
  now = new Date("2026-09-18T08:00:00-05:00").getTime();
  response = await send("catalog:1", catalog);
  assert.equal((await response.json()).duplicate, true);
  assert.equal(saved.length, 1);
  assert.equal(updates, 1);

  response = await send("router:1", [
    { type: "TEXT", content: "Hola, estos son los celulares Xiaomi disponibles." },
    { type: "IMAGE", content: "Redmi — S/ 699", mediaUrl: "https://example.com/redmi.jpg" },
    { type: "VIDEO", content: "Detalle del Redmi", mediaUrl: "https://example.com/redmi.mp4" },
  ]);
  body = await response.json();
  assert.equal(body.messages[0].content, "¡Buenos días! 😊 estos son los celulares Xiaomi disponibles.");
  assert.equal(body.messages[1].content, "Redmi — S/ 699");
  assert.equal(body.messages[2].messageType, "VIDEO");
  assert.deepEqual(body.messages.map((m: SavedMessage) => m.metadata.batchIndex), [0, 1, 2]);
  assert(body.messages.every((m: SavedMessage) => m.metadata.batchSize === 3));

  response = await send("router:long", [{ type: "TEXT", content: "a".repeat(4000) }]);
  body = await response.json();
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].content, "¡Buenos días! 😊");
  assert.equal(body.messages[1].content, "a".repeat(4000));
  assert(body.messages.every((m: SavedMessage) => m.metadata.batchSize === 2));

  const before = saved.length;
  assert.equal((await send("unauthorized", catalog, "wrong")).status, 401);
  externalId = "51999999999";
  assert.equal((await send("real", catalog)).status, 403);
  externalId = "SIMULATOR:test";
  botEnabled = false;
  assert.equal((await (await send("disabled", catalog)).json()).skipped, true);
  assert.equal(saved.length, before);
});
