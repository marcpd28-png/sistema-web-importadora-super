import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogIndex } from "../catalog-selection";
import { catalogSubject, productSubject, businessTopics } from "./query-language";
import { detectPlan } from "./planning";
import { memorySchema, type ProductFact } from "./contracts";
import { RockyAIOrchestrator } from "./orchestrator";
import { matchesRequestedModel } from "./model-match";

const inventory = [
  { code: "T100", name: "TETERA ELECTRICA", category: "COCINA", brand: null },
  { code: "TV100", name: "TELEVISOR XIAOMI 55 PULGADAS", category: "TELEVISORES", brand: "XIAOMI" },
  { code: "J100", name: "PARLANTE JBL", category: "PARLANTES", brand: "JBL" },
];
const index = createCatalogIndex(inventory);

// Anonymous utterances observed in the 24-hour audit; these are regression cases, not a blind accuracy benchmark.
for (const text of ["tendra catalogo", "hola solicito su catalogo", "catálogo xfavor", "catálogo actualizado", "envíeme su catálogo", "buen día, catálogo por favor", "buenas noches, disculpe por la hora. me brindas el catalogo por favor"]) {
  test(`catálogo general sin filtros de cortesía: ${text}`, () => {
    assert.equal(detectPlan(text).intent, "CATALOG_REQUEST");
    assert.equal(index.select(catalogSubject(text)).scoped, false);
  });
}

test("el catálogo filtrado conserva marca, tamaño y tipo", () => {
  const selection = index.select(catalogSubject("Me envía el catálogo actualizado de televisores Xiaomi 55 pulgadas por favor"));
  assert.deepEqual(selection.products.map(p => p.code), ["TV100"]);
  assert.equal(index.select(catalogSubject("Catálogo de parlantes JBL xfavor")).products[0].code, "J100");
});

test("precio sin referencia pide identificación y no consulta todo el inventario", async () => {
  const engine = new RockyAIOrchestrator({ search: async () => { throw new Error("No debe buscar sin producto"); }, product: async () => null, knowledge: async () => [] });
  for (const text of ["precio", "¿Cuál es el precio?", "precio de este producto"]) {
    const r = await engine.chat({ text });
    assert.deepEqual(r.toolsRequested, []);
    assert.deepEqual(r.products, []);
    assert.match(r.reply, /modelo|codigo|código/);
  }
});

test("una nueva consulta explícita sustituye el producto anterior, pero precio aislado lo conserva", () => {
  const memory = memorySchema.parse({ productCodes: ["J100"], query: "parlante JBL" });
  const next = detectPlan("Me brinda precios de los televisores porfavor", memory);
  assert.deepEqual(next.codes, []);
  assert.equal(next.query, "televisores");
  assert.deepEqual(detectPlan("precio", memory).codes, ["J100"]);
  assert.deepEqual(detectPlan("una foto", memory).codes, ["J100"]);
  assert.equal(productSubject("precio de este producto"), "");
});

test("S24 Ultra no ofrece cables aunque contengan el modelo solicitado", async () => {
  const cable: ProductFact = { id: "cable", code: "CA269", name: "CABLE SMG S24 ULTRA C A C", brand: "Samsung", category: "CABLES", unitPrice: 10, wholesalePrice: null, wholesaleMinQty: 3, stockUnits: 20, description: null, technicalSpecs: null };
  const engine = new RockyAIOrchestrator({ search: async () => [cable], product: async () => cable, knowledge: async () => [] });
  assert.deepEqual((await engine.chat({ text: "Buenas tardes quería saber cuánto está el Samsung S24 Ultra" })).products, []);
  assert.equal(matchesRequestedModel("cable Samsung S24 Ultra", cable), true);
  assert.equal(matchesRequestedModel("Samsung S24 Ultra", { code: "S100", name: "CELULAR SAMSUNG GALAXY S24 ULTRA" }), true);
});

test("dirección y horario son dos datos; una dirección del cliente no es consulta de tienda", () => {
  assert.deepEqual(businessTopics("DIRECCION y HORARIO"), { hours: true, address: true });
  assert.equal(businessTopics("¿Dónde se encuentran?").address, true);
  assert.equal(detectPlan("Más o menos cuánto saldría el delivery hasta mi ubicación").intent, "DELIVERY_QUERY");
  assert.equal(businessTopics("Dirección: mi agencia de entrega").address, false);
  assert.equal(businessTopics("En dónde están las cámaras de auto?").address, false);
});

test("conserva todos los códigos de un pedido compuesto y reconoce solicitud urgente", () => {
  assert.deepEqual(detectPlan("Compro P985, P898 y P442", memorySchema.parse({ productCodes: ["P985"] })).codes, ["P985", "P898", "P442"]);
  assert.equal(detectPlan("LLAMAR URGENTE").intent, "HUMAN_REQUEST");
});
