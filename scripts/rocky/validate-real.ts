/** Local, append-only validation against the existing rocky_test database. No outbound delivery. */
import { loadEnvConfig } from "@next/env";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { PrismaClient, type Product } from "@prisma/client";

async function main() {
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const sourceUrl = process.env.DATABASE_URL!;
  assert.equal(new URL(sourceUrl).hostname, "127.0.0.1");
  const container = JSON.parse(execFileSync("docker", ["inspect", "rocky-test-db"], { encoding: "utf8" }))[0];
  const env = Object.fromEntries(container.Config.Env.map((s: string) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]));
  const target = new URL("postgresql://127.0.0.1:5437/rocky_test");
  target.username = env.POSTGRES_USER || "postgres"; target.password = env.POSTGRES_PASSWORD;
  process.env.DATABASE_URL = target.toString();
  // Suppress browser notifications only in this process; credentials/files remain untouched.
  delete process.env.PUSHER_APP_ID;
  process.env.ROCKY_AUTO_ENABLED = "false";
  const source = new PrismaClient({ datasourceUrl: sourceUrl, log: [] });
  const db = new PrismaClient({ datasourceUrl: target.toString(), log: [] });
  global.prismaGlobal = db;
  const output = "docs/rocky/activation-real-20260926";
  await mkdir(output, { recursive: true });
  const evidence: Record<string, unknown> = { measuredAt: new Date().toISOString(), database: { source: "127.0.0.1:5432/importadora (read-only)", target: "127.0.0.1:5437/rocky_test", appendOnly: true }, flags: { llm: process.env.ROCKY_LLM_ENABLED, vector: process.env.ROCKY_RAG_VECTOR_ENABLED, auto: process.env.ROCKY_AUTO_ENABLED } };
  try {
    await db.$queryRaw`SELECT 1`;
    const products = await source.product.findMany({ where: { isVisible: true, category: "Tecnología" }, take: 3, orderBy: { code: "asc" }, select: { code: true, name: true, slug: true, description: true, technicalSpecs: true, unitPrice: true, stockUnits: true, brand: true, category: true } });
    assert.equal(products.length, 3);
    const copies: Product[] = [];
    for (const p of products) copies.push(await db.product.upsert({ where: { code: p.code }, create: p, update: {} }));
    evidence.products = products;
    const { OllamaLocalProvider } = await import("../../src/lib/rocky/provider");
    const { PostgresKnowledge } = await import("../../src/lib/rocky/rag");
    const { runRocky } = await import("../../src/lib/rocky/service");
    const { responseDifference } = await import("../../src/lib/rocky/learning");
    const provider = new OllamaLocalProvider();
    const rag = new PostgresKnowledge(provider, db);
    evidence.health = await provider.health();
    const calls: unknown[] = [];
    const realPlan = OllamaLocalProvider.prototype.plan;
    const realEmbed = OllamaLocalProvider.prototype.embed;
    OllamaLocalProvider.prototype.plan = async function(messages) {
      const start = performance.now();
      try { const result = await realPlan.call(this, messages); calls.push({ phase: "llm", model: this.model, ms: performance.now() - start, tokens: result.tokens, ok: true }); return result; }
      catch (error) { calls.push({ phase: "llm", model: this.model, ms: performance.now() - start, ok: false, error: error instanceof Error ? error.message : "UNKNOWN" }); throw error; }
    };
    OllamaLocalProvider.prototype.embed = async function(texts) {
      const start = performance.now();
      try { const result = await realEmbed.call(this, texts); calls.push({ phase: "embedding", model: this.embeddingModel, ms: performance.now() - start, dimension: result[0]?.length, ok: true }); return result; }
      catch (error) { calls.push({ phase: "embedding", model: this.embeddingModel, ms: performance.now() - start, ok: false, error: error instanceof Error ? error.message : "UNKNOWN" }); throw error; }
    };
    evidence.providerCalls = calls;
    for (const [phase, path, body] of [
      ["directInference", "chat", { model: provider.model, messages: [{ role: "user", content: "Responde únicamente: ROKY_OK" }], stream: false, think: false, keep_alive: 0, options: { num_ctx: 8192, num_predict: 30, num_thread: 2, temperature: 0 } }],
      ["directEmbedding", "embed", { model: provider.embeddingModel, input: "Proyector HY300 con Bluetooth y WiFi", keep_alive: "10s" }],
    ] as const) {
      const start = performance.now();
      try {
        const response = await fetch(`http://127.0.0.1:11434/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
        const result = await response.json();
        evidence[phase] = { ok: response.ok, model: result.model, response: result.message?.content, dimensions: result.embeddings?.[0]?.length, inputTokens: result.prompt_eval_count, outputTokens: result.eval_count, loadDurationNs: result.load_duration, error: result.error, ms: performance.now() - start };
      } catch (error) { evidence[phase] = { error: error instanceof Error ? error.message : "UNKNOWN", ms: performance.now() - start }; }
    }
    const stamp = Date.now().toString();
    const indexing = [];
    for (const p of copies) {
      const start = performance.now();
      try { indexing.push({ code: p.code, result: await rag.index({ sourceType: "PRODUCT", sourceId: `real-${stamp}-${p.code}`, productId: p.id, title: p.name, text: [p.code, p.name, p.description, p.technicalSpecs].filter(Boolean).join("\n"), version: stamp, approved: true }), ms: performance.now() - start }); }
      catch (error) { indexing.push({ code: p.code, error: error instanceof Error ? error.name + ":" + error.message : "UNKNOWN" }); }
    }
    evidence.indexing = indexing;
    async function conversation(label: string) {
      const contact = await db.chatContact.create({ data: { name: `Roky real validation ${label}`, externalId: `SIMULATOR:real-${stamp}-${label}`, channel: "WHATSAPP" } });
      return db.conversation.create({ data: { contactId: contact.id } });
    }
    const turns: unknown[] = [];
    async function turn(conversationId: string, text: string) {
      const before = await db.rockySession.findUnique({ where: { conversationId } });
      const message = await db.chatMessage.create({ data: { conversationId, senderType: "CUSTOMER", direction: "INBOUND", content: text } });
      const start = performance.now();
      const value = await runRocky({ conversationId, triggerMessageId: message.id, simulate: true });
      const after = await db.rockySession.findUnique({ where: { conversationId } });
      turns.push({ conversationId, text, memoryBefore: before?.memory, memoryAfter: after?.memory, totalMs: performance.now() - start, result: value.result });
      return value.result;
    }
    evidence.turns = turns;
    const chat = await conversation("main");
    for (const text of ["hola", `estoy buscando el ${copies[0].code}`, "cuánto cuesta?", "tiene bluetooth?", "hay stock?", `cuál es la diferencia con ${copies[1].code}?`, "quiero comprarlo"]) {
      try { await turn(chat.id, text); } catch (error) { turns.push({ text, error: error instanceof Error ? error.message : "UNKNOWN" }); }
    }
    const memoryChat = await conversation("memory");
    await turn(memoryChat.id, `precio ${copies[0].code}`);
    await db.$disconnect(); // Reconnect and let service reconstruct context from PostgreSQL.
    const recalled = await turn(memoryChat.id, "cuánto cuesta?");
    evidence.memory = { persistedAndReconnected: recalled.memory.productCodes.includes(copies[0].code), code: copies[0].code, result: recalled };
    const query = `${copies[0].name} bluetooth`.slice(0, 120);
    const ragStart = performance.now();
    evidence.rag = { query, productId: copies[0].id, topK: 5, model: provider.embeddingModel, hits: await rag.search({ query, productId: copies[0].id, limit: 5 }), ms: performance.now() - ragStart };
    evidence.vectorOnly = await rag.search({ query, productId: copies[0].id, limit: 5, mode: "vector" });
    const humanResponse = recalled.reply + " Confirmado por el asesor de validación local.";
    const feedback = await db.rockyFeedback.create({ data: { runId: recalled.rockyRequestId, humanResponse, status: "EDITED", reviewerId: "local-real-validation" } });
    evidence.feedback = { modelResponse: recalled.interaction?.modelResponse, finalResponse: recalled.reply, ...responseDifference(recalled.reply, humanResponse), persisted: await db.rockyFeedback.findUnique({ where: { id: feedback.id } }), scope: "Real database persistence; HTTP admin authentication not exercised" };
    const handoffChat = await conversation("handoff");
    const handoff = await turn(handoffChat.id, "quiero hablar con una persona");
    evidence.handoff = { result: handoff, persisted: await db.conversation.findUnique({ where: { id: handoffChat.id }, select: { status: true, botEnabled: true } }) };
    const concurrent = await Promise.all(copies.map((_, i) => conversation(`parallel-${i}`)));
    await Promise.all(concurrent.map((c, i) => turn(c.id, `precio ${copies[i].code}`)));
    const start = performance.now();
    const results = await Promise.all(concurrent.map(c => turn(c.id, "cuánto cuesta?")));
    evidence.concurrency = { count: 3, ms: performance.now() - start, isolated: results.every((r, i) => r.memory.productCodes.length === 1 && r.memory.productCodes[0] === copies[i].code), results };
    const modelChat = await conversation("model");
    const modelTurn = await turn(modelChat.id, "Me orientas por favor");
    evidence.modelTurn = modelTurn;
    const corrected = modelTurn.reply + " ¿Buscas audífonos o un parlante?";
    const modelFeedback = await db.rockyFeedback.create({ data: { runId: modelTurn.rockyRequestId, humanResponse: corrected, status: "EDITED", reviewerId: "local-real-validation" } });
    const persistedRun = await db.rockyRun.findUniqueOrThrow({ where: { id: modelTurn.rockyRequestId } });
    evidence.modelFeedback = { modelResponse: modelTurn.interaction?.modelResponse, finalResponse: modelTurn.reply, ...responseDifference(modelTurn.reply, corrected), persistedRun: persistedRun.result, persistedFeedback: await db.rockyFeedback.findUnique({ where: { id: modelFeedback.id } }) };
    const missingChat = await conversation("missing");
    evidence.missingProduct = await turn(missingChat.id, "cuánto cuesta el ZZ99999999?");
    const { memorySchema } = await import("../../src/lib/rocky/contracts");
    const { detectPlan } = await import("../../src/lib/rocky/planning");
    const { evaluateConfidence } = await import("../../src/lib/rocky/confidence");
    const micro: Record<string, number> = {};
    let clock = performance.now();
    const restored = await db.rockySession.findUnique({ where: { conversationId: memoryChat.id } });
    const mem = memorySchema.parse(restored?.memory); micro.memoryReadAndParseMs = performance.now() - clock;
    clock = performance.now(); const plan = detectPlan("cuánto cuesta?", mem); micro.intentMs = performance.now() - clock;
    clock = performance.now(); evaluateConfidence({ intent: plan.intent, exact: true, products: recalled.products.length, sources: recalled.sources, calls: recalled.toolCalls, requiresHuman: false, ambiguous: false }); micro.confidenceMs = performance.now() - clock;
    evidence.componentProbe = { measuredMs: micro, note: "Separate executions, not a breakdown of a prior turn. Tool times are in each result.toolCalls; embeddings/LLM include cold/cache effects." };
  } finally {
    await writeFile(`${output}/runtime-evidence.json`, JSON.stringify(evidence, null, 2));
    await source.$disconnect(); await db.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.name + ": " + error.message.replace(/postgresql:\/\/\S+/g, "[REDACTED]") : "VALIDATION_ERROR"); process.exitCode = 1; });
