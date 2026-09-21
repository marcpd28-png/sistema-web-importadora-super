import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/prisma";
import { PostgresKnowledge } from "../../src/lib/rocky/rag";
import { runRocky } from "../../src/lib/rocky/service";
import type { LLMProvider } from "../../src/lib/rocky/contracts";
import { createToolBackend } from "../../src/lib/rocky/backend";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/rocky_test" || url.port !== "5437") throw new Error("ISOLATED_DATABASE_REQUIRED");
  process.env.ROCKY_LLM_ENABLED = "false"; process.env.ROCKY_RAG_VECTOR_ENABLED = "false";
  await prisma.$executeRawUnsafe(readFileSync("scripts/rocky/enable-pgvector.sql", "utf8").replace(/BEGIN;|COMMIT;|SET LOCAL lock_timeout = '3s';/g, "").split("CREATE TABLE")[0]);
  const embedding = [1, ...Array(1023).fill(0)];
  const fake = { embed: async (texts: string[]) => texts.map(() => embedding) } as LLMProvider;
  const rag = new PostgresKnowledge(fake);
  const suffix = Date.now().toString();
  const code = `RK${suffix.slice(-6)}`;
  const product = await prisma.product.create({ data: { code, slug: `rocky-${suffix}`, name: "Arrancador batería XYZ123", unitPrice: 49, stockUnits: 8, brand: "RockyTest", category: "Arrancadores" } });
  const contact = await prisma.chatContact.create({ data: { name: "Rocky isolated test", externalId: `SIMULATOR:rocky-${suffix}`, channel: "WHATSAPP" } });
  const conversation = await prisma.conversation.create({ data: { contactId: contact.id } });
  const document = { sourceType: "PRODUCT", sourceId: code, productId: product.id, title: "Arrancador batería", text: "Arrancador booster para batería del carro.", version: "1", approved: true, brand: "RockyTest", category: "Arrancadores" };
  try {
    const backend = createToolBackend(rag);
    assert.equal((await backend.product("XYZ123"))?.code, code);
    const ambiguous = await prisma.product.create({ data: { code: `${code}B`, slug: `rocky-${suffix}-b`, name: "Otro equipo XYZ123", unitPrice: 70 } });
    try { assert.equal(await backend.product("XYZ123"), null); }
    finally { await prisma.product.delete({ where: { id: ambiguous.id } }); }
    const indexed = await rag.index(document); assert.equal(indexed.unchanged, false);
    assert.equal((await rag.index(document)).unchanged, true);
    for (const mode of ["exact", "lexical", "vector", "hybrid"]) {
      const hits = await rag.search({ query: mode === "exact" ? code : "arrancador", mode, productId: product.id, brand: "RockyTest", category: "Arrancadores" });
      assert.equal(hits[0]?.sourceId, code); console.log(JSON.stringify({ test: "rag", mode, results: hits.map(h => ({ sourceId: h.sourceId, score: h.score })) }));
    }
    assert.equal((await rag.search({ query: "arrancador", brand: "WrongBrand" })).length, 0);
    await prisma.product.update({ where: { id: product.id }, data: { isVisible: false } });
    assert.equal((await rag.search({ query: "arrancador", productId: product.id })).length, 0);
    await prisma.product.update({ where: { id: product.id }, data: { isVisible: true } });
    const message = await prisma.chatMessage.create({ data: { conversationId: conversation.id, senderType: "CUSTOMER", direction: "INBOUND", content: `Stock ${code}` } });
    const first = await runRocky({ conversationId: conversation.id, triggerMessageId: message.id, simulate: true });
    assert.equal(first.result.products[0]?.stockUnits, 8);
    assert.equal((await runRocky({ conversationId: conversation.id, triggerMessageId: message.id, simulate: true })).duplicate, true);
    assert.equal(await prisma.chatMessage.count({ where: { conversationId: conversation.id, direction: "OUTBOUND" } }), 1);
    await prisma.conversation.update({ where: { id: conversation.id }, data: { botEnabled: false } });
    const next = await prisma.chatMessage.create({ data: { conversationId: conversation.id, senderType: "CUSTOMER", direction: "INBOUND", content: "Hola" } });
    const manual = await runRocky({ conversationId: conversation.id, triggerMessageId: next.id, simulate: true });
    assert.equal(manual.result.finalAction, "SUGGEST");
    assert.equal(await prisma.chatMessage.count({ where: { conversationId: conversation.id, direction: "OUTBOUND" } }), 1);
    await prisma.rockyFeedback.create({ data: { runId: first.result.rockyRequestId, humanResponse: "Corrección de prueba", reviewerId: "isolated-test" } });
    assert.equal(await prisma.rockyFeedback.count({ where: { runId: first.result.rockyRequestId } }), 1);
    console.log("PASS: RAG exact/lexical/vector/hybrid, filters, incremental, hidden products, simulator, idempotency, manual, feedback");
  } finally {
    await rag.remove("PRODUCT", code); await prisma.chatContact.delete({ where: { id: contact.id } }); await prisma.product.delete({ where: { id: product.id } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
