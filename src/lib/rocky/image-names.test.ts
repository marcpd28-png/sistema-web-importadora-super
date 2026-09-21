import test from "node:test";
import assert from "node:assert/strict";
import { identifyCatalogImageNames, matchCatalogImageName } from "./image-names";
import { RockyAIOrchestrator } from "./orchestrator";
import { memorySchema, type LLMProvider, type ProductFact } from "./contracts";
import type { ToolBackend } from "./tools";

const reads = (text: string, confidence = 94) => ["full-11", "full-6"].map(view => ({ text, confidence, view }));
test("short exact names work without a printed code, with evidence-based confidence", () => {
  const products = [{ code: "P1", name: "Lámpara lunar recargable" }];
  assert.deepEqual(identifyCatalogImageNames(reads("LAMPARA LUNAR RECARGABLE"), products), [{ code: "P1", complete: true, confidence: .94 }]);
  assert.equal(identifyCatalogImageNames(reads(products[0].name, 76), products)[0].confidence, .76);
  assert.deepEqual(matchCatalogImageName(reads("LAMPARA LUNAR"), products), []);
  assert.deepEqual(matchCatalogImageName(reads(products[0].name).slice(0, 1), products), []);
});
test("color, capacity and parenthesized specifications distinguish variants", () => {
  const products = [
    { code: "P1", name: "Memoria USB (64 GB) negra" },
    { code: "P2", name: "Memoria USB (128 GB) negra" },
    { code: "P3", name: "Memoria USB (64 GB) blanca" },
  ];
  assert.deepEqual(matchCatalogImageName(reads("MEMORIA USB 64 GB NEGRA"), products), ["P1"]);
  assert.deepEqual(matchCatalogImageName(reads("MEMORIA USB"), products), []);
  assert.deepEqual(matchCatalogImageName(reads("MEMORIA USB 128GB"), [{ code: "P4", name: "(64GB) Memoria USB" }]), []);
});
test("missing variant details cannot produce a confirmed name match", () => {
  const products = [{ code: "AU30-BLANCO", name: "(AU30) AUDIFONO ALAMBRICO AK6 ARES BLANCO" }];
  const result = identifyCatalogImageNames(reads("AUDIFONOS AK6 ARES"), products);
  assert.equal(result[0].complete, false);
  assert.ok(result[0].confidence < .85);
  assert.deepEqual(matchCatalogImageName(reads("AUDIFONO ALAMBRICO AK6 ARES NEGRO"), products), []);
});
test("duplicate catalog names stay ambiguous and low confidence reads are rejected", () => {
  const products = [{ code: "P1", name: "Lampara lunar" }, { code: "P2", name: "Lampara lunar" }];
  assert.deepEqual(matchCatalogImageName(reads("Lampara lunar"), products), ["P1", "P2"]);
  assert.deepEqual(matchCatalogImageName(reads("Lampara lunar", 69), products), []);
  assert.deepEqual(matchCatalogImageName(reads("Lampara lunar", NaN), products), []);
});

const product: ProductFact = { id: "P1", code: "P1", name: "Lámpara lunar recargable", brand: "Super", category: "Luces", unitPrice: 35, wholesalePrice: null, wholesaleMinQty: 3, stockUnits: 12, description: null, technicalSpecs: null };
const backend: ToolBackend = { search: async () => [product], product: async code => code === product.code ? product : null, knowledge: async () => [] };
test("image name reaches search for price and stock while keeping the requested intent", async () => {
  for (const [text, intent] of [["¿Cuánto cuesta?", "PRICE_QUERY"], ["¿Hay stock?", "STOCK_QUERY"]]) {
    let query = "";
    const provider: LLMProvider = { model: "test-vision", embed: async () => [], health: async () => ({ ready: true, models: ["test-vision"] }), plan: async () => ({ plan: { intent: "PRODUCT_SEARCH", query: product.name, codes: [], budget: null, quantity: 1, needs: [] }, tokens: { input: 1, output: 1 } }) };
    const result = await new RockyAIOrchestrator({ ...backend, search: async value => { query = value; return [product]; } }, provider).chat({ text, image: "test-image" });
    assert.equal(query, product.name);
    assert.equal(result.intent, intent);
    assert.match(result.reply, /35\.00/);
    assert.match(result.reply, /12 unidades/);
  }
});
test("resolved photo product supports direct price and stock queries without inference", async () => {
  for (const text of ["¿Cuánto cuesta?", "¿Hay stock?"]) {
    const result = await new RockyAIOrchestrator(backend).chat({ text, resolvedProductCode: "P1" });
    assert.deepEqual(result.products.map(p => p.code), ["P1"]);
    assert.ok(result.toolsRequested.includes("getProductByCode"));
  }
});
test("image name planning respects human requests", async () => {
  const provider = { model: "test", plan: async () => { throw new Error("must not run"); } } as unknown as LLMProvider;
  const result = await new RockyAIOrchestrator(backend, provider).chat({ text: "Quiero hablar con un asesor", image: "test", memory: memorySchema.parse({}) });
  assert.equal(result.requiresHuman, true);
  assert.equal(result.intent, "HUMAN_REQUEST");
});
