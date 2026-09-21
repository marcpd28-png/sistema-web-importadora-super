import { prisma } from "../../src/lib/prisma";
import { PostgresKnowledge } from "../../src/lib/rocky/rag";
import { OllamaLocalProvider } from "../../src/lib/rocky/provider";

async function main() {
  const rag = new PostgresKnowledge(new OllamaLocalProvider());
  const queries = ["arrancador", "booster", "aparato para prender el carro", "cargador Samsung", "LK618"];
  for (const query of queries) {
    const started = Date.now();
    const results = await rag.search({ query, mode: "hybrid", limit: 3 });
    console.log(JSON.stringify({ query, latencyMs: Date.now() - started, top: results.map(r => ({ source: r.sourceId, title: r.title, score: r.score })) }));
  }
  console.log(JSON.stringify({ documents: await prisma.knowledgeDocument.count(), vectors: await prisma.$queryRaw`SELECT count(*)::int AS count FROM knowledge_embeddings` }));
  await prisma.$disconnect();
}
main().catch(() => { console.error("RAG_EVALUATION_FAILED"); process.exitCode = 1; });
