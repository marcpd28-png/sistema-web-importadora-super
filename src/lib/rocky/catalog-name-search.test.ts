import test from "node:test";
import assert from "node:assert/strict";
import { RockyAIOrchestrator } from "./orchestrator";
import { memorySchema, type ProductFact, type LLMProvider } from "./contracts";

const product = (code: string, name: string): ProductFact => ({ id: code, code, name, brand: null, category: null, unitPrice: 45, wholesalePrice: null, wholesaleMinQty: 3, stockUnits: 7, description: null, technicalSpecs: null });
const inventory = [product("T100", "TETERA ELECTRICA"), product("L100", "LAMPARA LUNAR RECARGABLE"), product("P100", "PARLANTE BLUETOOTH"), product("A100", "AUDIFONOS INALAMBRICOS"), product("S100", "SOPORTE PARA LAPTOP")];
const noModel: LLMProvider = { model: "unavailable", plan: async () => { throw Error("Unavailable"); }, embed: async () => [], health: async () => ({ ready: false, models: [] }) };

for (const [text, code] of [["tetera electrica", "T100"], ["lámpara lunar", "L100"], ["parlante bluetooth", "P100"], ["audífonos inalámbricos", "A100"], ["soporte para laptop", "S100"], ["audifnos inalambricos", "A100"], ["parlante bluetoth", "P100"]]) {
  test(`nombre del catálogo inicia búsqueda sin verbos ni modelo: ${text}`, async () => {
    const queries: string[] = [];
    const engine = new RockyAIOrchestrator({ search: async query => { queries.push(query); return inventory; }, product: async () => null, knowledge: async () => [] }, noModel);
    const result = await engine.chat({ text, memory: memorySchema.parse({ productCodes: ["OLD99"], query: "otro producto" }) });
    assert.equal(result.intent, "PRODUCT_SEARCH");
    assert.equal(result.model, "rules-and-tools");
    assert.deepEqual(result.products.map(p => p.code), [code]);
    assert.deepEqual(result.memory.productCodes, [code]);
    assert.equal(queries.length, 1);
    assert.deepEqual(result.toolsRequested, ["searchProducts"]);
    assert.ok(result.confidenceEvidence.includes("CATALOG_MATCHED_INTENT"));
  });
}

test("no convierte resultados ajenos ni texto sin coincidencias en un producto", async () => {
  const engine = new RockyAIOrchestrator({ search: async () => inventory, product: async () => null, knowledge: async () => [] });
  for (const text of ["buenas vibras", "algo diferente", "lampara ultravioleta", "robot aspirador"]) {
    const result = await engine.chat({ text });
    assert.equal(result.intent, "UNKNOWN");
    assert.deepEqual(result.products, []);
    assert.deepEqual(result.memory.productCodes, []);
  }
});

test("no busca en el catálogo para saludos, referencias vacías, reclamos o solicitudes humanas", async () => {
  let searches = 0;
  const engine = new RockyAIOrchestrator({ search: async () => { searches++; return inventory; }, product: async () => null, knowledge: async () => [] });
  for (const text of ["hola", "gracias", "precio", "quiero hablar con asesor", "reclamo de mi tetera", "mi pedido"]) await engine.chat({ text });
  assert.equal(searches, 0);
});

test("fallo del catálogo no inventa productos ni bloquea la derivación", async () => {
  const result = await new RockyAIOrchestrator({ search: async () => { throw Error("database unavailable"); }, product: async () => null, knowledge: async () => [] }, noModel).chat({ text: "tetera electrica" });
  assert.deepEqual(result.products, []);
  assert.ok(result.toolCalls.some(call => !call.ok));
  assert.doesNotMatch(result.reply, /database unavailable/);
});

test("mensajes separados conservan producto, marca y potencia; otro producto inicia otra búsqueda", async () => {
  const chargers = [product("C100", "CARGADOR SAMSUNG 25W NEGRO"), product("C200", "CARGADOR SAMSUNG 45W BLANCO"), product("C300", "CARGADOR XIAOMI 25W NEGRO"), product("A200", "AUDIFONO SAMSUNG NEGRO"), ...inventory];
  const engine = new RockyAIOrchestrator({ search: async () => chargers, product: async () => null, knowledge: async () => [] }, noModel);
  let result = await engine.chat({ text: "cargador" });
  result = await engine.chat({ text: "Samsung", memory: result.memory });
  assert.equal(result.memory.query, "cargador samsung");
  assert.deepEqual(result.products.map(p => p.code).sort(), ["C100", "C200"]);
  result = await engine.chat({ text: "25 W", memory: result.memory });
  assert.equal(result.memory.query, "cargador samsung 25 w");
  assert.deepEqual(result.products.map(p => p.code), ["C100"]);
  result = await engine.chat({ text: "negro", memory: result.memory });
  assert.deepEqual(result.products.map(p => p.code), ["C100"]);
  assert.ok(result.confidenceEvidence.includes("CATALOG_QUERY_REFINED"));
  result = await engine.chat({ text: "tetera electrica", memory: result.memory });
  assert.equal(result.memory.query, "tetera electrica");
  assert.deepEqual(result.products.map(p => p.code), ["T100"]);
});

test("un fragmento sin coincidencia no sustituye la restricción por productos ajenos", async () => {
  const chargers = [product("C100", "CARGADOR SAMSUNG 25W")];
  const engine = new RockyAIOrchestrator({ search: async () => chargers, product: async () => null, knowledge: async () => [] }, noModel);
  const first = await engine.chat({ text: "cargador" });
  const result = await engine.chat({ text: "500 W", memory: first.memory });
  assert.equal(result.memory.query, "cargador 500 w");
  assert.deepEqual(result.products, []);
});
