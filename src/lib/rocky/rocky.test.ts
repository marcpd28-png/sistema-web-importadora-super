import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { memorySchema, type LLMProvider, type ProductFact } from "./contracts";
import { detectPlan } from "./planning";
import { RockyAIOrchestrator } from "./orchestrator";
import { localOllamaUrl, singleInference } from "./provider";
import { chunkKnowledge, vectorLiteral } from "./rag";
import { ToolExecutor, WorkflowRegistry, type ToolBackend } from "./tools";
import { effectiveMode } from "./service";
import { internalAuthorized, limitedJson } from "./http";
import { productFromOwnUrl } from "./sales";
import { redactSensitiveText } from "./guardrails";
import { expandInitialVocabulary } from "./vocabulary";

const product = (code: string, price = 50): ProductFact => ({ id: code, code, name: `Cargador ${code}`, brand: "Samsung", category: "Cargadores", unitPrice: price, wholesalePrice: 40, wholesaleMinQty: 3, stockUnits: 23, description: null, technicalSpecs: "potencia: 25 W" });
const products = [product("LK618"), product("LK620", 70)];
const backend: ToolBackend = {
  search: async (_query, budget) => products.filter(p => budget == null || p.unitPrice <= budget),
  product: async code => products.find(p => p.code === code) || null,
  knowledge: async () => [{ id: "k1", sourceId: "policy-v1", sourceType: "WARRANTY", title: "Garantía aprobada", text: "La garantía requiere comprobante.", score: 0.8, productId: null }],
};
test("caso 1: Samsung, carga rápida, presupuesto y búsqueda", async () => {
  const text = "Quiero un cargador rápido para Samsung, máximo 60 soles.";
  const plan = detectPlan(text);
  assert.equal(plan.budget, 60); assert.deepEqual(plan.needs, ["Samsung", "carga rápida"]);
  const result = await new RockyAIOrchestrator(backend).chat({ text });
  assert.equal(result.intent, "PRODUCT_SEARCH"); assert.ok(result.toolsRequested.includes("searchProducts"));
  assert.ok(result.products.every(p => p.unitPrice <= 60)); assert.match(result.reply, /50\.00/);
});
test("caso 2: objeción conserva el producto y no inventa descuentos", async () => {
  const memory = memorySchema.parse({ productCodes: ["LK618"], query: "cargador", budget: 60 });
  const result = await new RockyAIOrchestrator(backend).chat({ text: "El que me enseñaste está muy caro.", memory });
  assert.equal(result.intent, "PRICE_OBJECTION"); assert.equal(result.skill, "objection-handling");
  assert.deepEqual(result.memory.productCodes, ["LK618"]); assert.ok(result.toolsRequested.includes("getPromotions")); assert.match(result.reply, /No tengo un descuento/);
});
test("caso 3: stock exacto desde backend", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "¿Tienen stock del LK618?" });
  assert.equal(result.intent, "STOCK_QUERY"); assert.ok(result.toolsRequested.includes("getStock")); assert.match(result.reply, /23 unidades/);
});
test("caso 4: compara ambos y pide uso", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "¿Cuál es mejor, LK618 o LK620?" });
  assert.equal(result.intent, "PRODUCT_COMPARISON"); assert.equal(result.products.length, 2); assert.match(result.reply, /¿Para qué uso/);
});
test("caso 5: mayorista conserva producto, consulta stock precio promociones", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "Quiero 20.", memory: memorySchema.parse({ productCodes: ["LK618"] }) });
  assert.equal(result.intent, "WHOLESALE_QUERY"); assert.equal(result.memory.quantity, 20);
  for (const name of ["getStock", "getPrice", "getPromotions"]) assert.ok(result.toolsRequested.includes(name));
  assert.match(result.reply, /40\.00 para 20/);
});
test("caso 6: humano prevalece sobre modelo", async () => {
  const evil = { model: "fake", plan: async () => { throw new Error("must not run"); } } as unknown as LLMProvider;
  const result = await new RockyAIOrchestrator(backend, evil).chat({ text: "Quiero hablar con una persona." });
  assert.equal(result.intent, "HUMAN_REQUEST"); assert.equal(result.requiresHuman, true); assert.ok(result.toolsRequested.includes("handoffToHuman"));
});
test("caso 7: garantía con fuente, sin dato deriva", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "¿Qué garantía tienen?" });
  assert.match(result.reply, /policy-v1/);
  const missing = await new RockyAIOrchestrator({ ...backend, knowledge: async () => [] }).chat({ text: "¿Qué garantía tienen?" });
  assert.equal(missing.requiresHuman, true); assert.equal(missing.reasonCode, "NO_APPROVED_KNOWLEDGE");
});
test("caso 8: fallback semántico obtiene producto pero precio se recarga", async () => {
  const result = await new RockyAIOrchestrator({ ...backend, search: async () => [], knowledge: async () => [{ id: "k", sourceId: "LK618", sourceType: "PRODUCT", text: "precio viejo 1 sol", productId: "LK618", title: "arrancador", score: 0.8 }] }).chat({ text: "Busco aparato para prender el carro" });
  assert.ok(result.toolsRequested.includes("searchKnowledge")); assert.match(result.reply, /50\.00/); assert.doesNotMatch(result.reply, /1 sol/);
});
test("no stock inventado si falla herramienta", async () => {
  const result = await new RockyAIOrchestrator({ ...backend, product: async () => { throw new Error("db password secret"); } }).chat({ text: "Stock LK618" });
  assert.equal(result.requiresHuman, true); assert.doesNotMatch(JSON.stringify(result), /password secret/);
});
test("no ejecutar herramientas o workflows no autorizados", async () => {
  const executor = new ToolExecutor(backend, ["getStock"]);
  await assert.rejects(() => executor.execute("createCheckout", {}), /NOT_AUTHORIZED/);
  await assert.rejects(() => executor.execute("getStock", { code: "LK618", sql: "DROP" }));
  const registry = new WorkflowRegistry(); await assert.rejects(() => registry.runWorkflow("editWorkflow", {}));
  registry.register("preview", z.object({ id: z.string() }).strict(), async payload => payload);
  assert.deepEqual(await registry.runWorkflow("preview", { id: "x" }), { id: "x" });
});
test("localhost obligatorio y una inferencia compartida", async () => {
  for (const url of ["http://0.0.0.0:11434", "https://evil.test", "http://localhost@evil.test", "http://localhost/x"]) assert.throws(() => localOllamaUrl(url));
  await singleInference(async () => { await assert.rejects(() => singleInference(async () => 1), /ROCKY_BUSY/); });
  assert.equal(await singleInference(async () => 2), 2);
});
test("control humano domina AUTO y COPILOT", () => {
  const base = { botEnabled: true, assignedUserId: null, status: "AUTOMATICO" };
  assert.equal(effectiveMode("AUTO", { ...base, assignedUserId: "agent" }), "MANUAL");
  assert.equal(effectiveMode("AUTO", { ...base, botEnabled: false }), "MANUAL");
  assert.equal(effectiveMode(undefined, base), "COPILOT");
});
test("RAG chunking y validación de dimensión", () => {
  assert.ok(chunkKnowledge("texto ".repeat(700)).every(c => c.length <= 1400));
  assert.throws(() => chunkKnowledge("abc", 100, 100));
  assert.throws(() => vectorLiteral([1, 2]));
  assert.throws(() => vectorLiteral(Array(1024).fill(NaN)));
});
test("autenticación fail closed y body acotado sin content-length", async () => {
  const old = process.env.N8N_INTERNAL_API_KEY; delete process.env.N8N_INTERNAL_API_KEY;
  assert.equal(internalAuthorized(new Request("http://localhost")), false);
  if (old !== undefined) process.env.N8N_INTERNAL_API_KEY = old;
  await assert.rejects(() => limitedJson(new Request("http://localhost", { method: "POST", body: "x".repeat(100) }), 10), /INPUT_TOO_LARGE/);
});
test("URLs externas no se descargan ni se usan como producto", () => {
  assert.equal(productFromOwnUrl("https://tiendavirtualsuper.com/producto/abc", "https://tiendavirtualsuper.com"), "abc");
  assert.equal(productFromOwnUrl("https://evil.test/producto/abc", "https://tiendavirtualsuper.com"), null);
});
test("sin selección implícita entre varios resultados", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "Busco cargador" });
  assert.deepEqual(result.memory.productCodes, []); assert.equal(result.memory.shownCodes.length, 2);
});
test("credenciales comunes no pasan al contexto", () => {
  assert.doesNotMatch(redactSensitiveText("password=secreto123 token: ultrasecreto"), /secreto123|ultrasecreto/);
});
test("salida LLM no inventa códigos ni presupuesto y no puede ejecutar acciones", async () => {
  const provider = { model: "fake", plan: async () => ({ plan: { intent: "PRODUCT_SEARCH", query: "cargador", codes: ["INVENTADO99"], budget: 1, quantity: 100, needs: [] }, tokens: { input: 1, output: 1 } }) } as unknown as LLMProvider;
  const result = await new RockyAIOrchestrator(backend, provider).chat({ text: "Busco cargador máximo 60 soles" });
  assert.equal(result.memory.budget, 60); assert.equal(result.memory.quantity, 1); assert.doesNotMatch(JSON.stringify(result), /INVENTADO99/);
});
test("vocabulario inicial proporcionado conserva otros calificadores", () => {
  assert.equal(expandInitialVocabulary("aparato para prender el carro"), "arrancador");
  assert.equal(expandInitialVocabulary("booster portátil"), "arrancador portatil");
});
test("stock por código no compite con una inferencia ni pierde precisión", async () => {
  let called = false;
  const provider = { model: "busy", plan: async () => { called = true; throw new Error("busy"); } } as unknown as LLMProvider;
  const result = await new RockyAIOrchestrator(backend, provider).chat({ text: "Stock LK618" });
  assert.equal(called, false); assert.equal(result.reasonCode, null); assert.equal(result.model, "rules-and-tools"); assert.match(result.reply, /23 unidades/);
});
test("precio mayorista cero conserva el precio unitario como BC", async () => {
  const noTier = { ...products[0], wholesalePrice: 0 };
  const result = await new RockyAIOrchestrator({ ...backend, product: async () => noTier }).chat({ text: "Quiero 20", memory: memorySchema.parse({ productCodes: ["LK618"] }) });
  assert.match(result.reply, /S\/ 50\.00/); assert.doesNotMatch(result.reply, /S\/ 0\.00/);
});

test("horarios consulta configuración actual sin modelo ni catálogo", async () => {
  let hour = "Lun a sáb 8:00 am - 7:00 pm";
  const live = { ...backend, search: async () => { throw new Error("PRODUCT_SEARCH_FOR_BUSINESS"); }, business: async () => [{ id: "store", sourceId: "StoreSettings:supportHours", sourceType: "BUSINESS", title: "Tienda", text: hour, score: 1, productId: null }] };
  const provider = { model: "must-not-run", plan: async () => { throw new Error("NO_MODEL"); } } as unknown as LLMProvider;
  for (const text of ["hora cuales son sus horarios de atencion", "HOLA DESEO SUS HORARIOS ATENCION", "¿A qué hora abren?", "hasta qué hora atienden", "dónde están"]) {
    const result = await new RockyAIOrchestrator(live, provider).chat({ text });
    assert.equal(result.intent, "BUSINESS_QUERY"); assert.equal(result.model, "rules-and-tools");
    assert.deepEqual(result.toolsRequested, ["getBusinessInfo"]); assert.equal(result.reply, hour);
    assert.equal(result.requiresHuman, false); assert.equal(result.sources[0].sourceId, "StoreSettings:supportHours");
  }
  hour = "Lunes a viernes 9 am a 6 pm";
  assert.equal((await new RockyAIOrchestrator(live).chat({ text: "horarios" })).reply, hour);
  const missing = await new RockyAIOrchestrator({ ...live, business: async () => [] }).chat({ text: "horarios" });
  assert.equal(missing.requiresHuman, true); assert.equal(missing.reasonCode, "BUSINESS_INFO_NOT_CONFIGURED");
  assert.doesNotMatch(missing.reply, /marca|modelo|código/);
  assert.notEqual(detectPlan("cuántas horas dura la batería LK618").intent, "BUSINESS_QUERY");
});
