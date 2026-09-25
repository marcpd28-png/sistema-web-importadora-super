import test from "node:test";
import assert from "node:assert/strict";
import { memorySchema, type ProductFact, type KnowledgeHit } from "./contracts";
import { RockyAIOrchestrator } from "./orchestrator";
import { catalogSubject } from "./query-language";
import { detectPlan } from "./planning";
import { matchesRequestedModel } from "./model-match";

const products: ProductFact[] = [
  { id: "A", code: "LK618", name: "Arrancador LK618", unitPrice: 100, stockUnits: 12, wholesalePrice: 90, wholesaleMinQty: 3, brand: null, category: null, description: null, technicalSpecs: null },
  { id: "B", code: "LK620", name: "Arrancador LK620", unitPrice: 140, stockUnits: 8, wholesalePrice: null, wholesaleMinQty: 3, brand: null, category: null, description: null, technicalSpecs: null },
];
const fact = (type: string, text: string): KnowledgeHit => ({ id: type, sourceId: type, sourceType: type, title: type, text, score: 1, productId: null });
const backend = { search: async () => products, product: async (code: string) => products.find(p => p.code === code) || null, knowledge: async () => [], business: async () => [fact("BUSINESS", "Dirección de prueba: Calle de Prueba 123.")] };
for (const text of ["Me puede mandar catálogo", "Podrías brindarme tu catálogo", "Me comparte su catálogo", "M3 pasa el catálogo", "Me compart3s tu catálogo por favor", "Buenos días. Por favor, me facilita su catálogo. Muchas gracias.", "Hola vengo de TikTok me puede mandar catálogo", "Catálogo para hacer compras por mayor"]) {
  test(`courtesy does not become a catalog filter: ${text}`, () => assert.equal(catalogSubject(text), ""));
}
test("catalog keeps explicit type, brand and model", () => {
  assert.equal(catalogSubject("Me puede mandar catálogo de proyectores M3"), "proyectores m3");
  assert.equal(catalogSubject("Me comparte catálogo de televisores Xiaomi 55 pulgadas"), "televisores xiaomi 55 pulgadas");
});
for (const text of ["Precio en caja porfavor", "Buenas cual es el precio de la caja de 100", "Estos que precio por 100", "Y precio porfavor", "Si tienen stock de esto ?", "Quiero 3", "Quiero más detalles sobre eso", "Me podrá mandar foto de la caja??"]) {
  test(`ambiguous message asks for product without arbitrary search: ${text}`, async () => {
    const result = await new RockyAIOrchestrator(backend).chat({ text });
    assert.deepEqual(result.products, []);
    assert.deepEqual(result.toolsRequested, []);
    assert.match(result.reply, /producto|código/);
  });
}
test("price follows the selected product; another option requires clarification", async () => {
  const engine = new RockyAIOrchestrator(backend);
  const first = await engine.chat({ text: "precio LK618" });
  const second = await engine.chat({ text: "y precio porfavor", memory: first.memory });
  assert.deepEqual(second.products.map(p => p.code), ["LK618"]);
  assert.match(second.reply, /100\.00/);
  const another = await engine.chat({ text: "precio del otro", memory: second.memory });
  assert.deepEqual(another.products, []);
});
test("a list is not a selection; ordinals work inside a price question", async () => {
  const memory = memorySchema.parse({ shownCodes: ["LK618", "LK620"], query: "arrancador" });
  const engine = new RockyAIOrchestrator(backend);
  assert.deepEqual((await engine.chat({ text: "precio de ese", memory })).products, []);
  const selected = await engine.chat({ text: "precio del segundo", memory });
  assert.deepEqual(selected.products.map(p => p.code), ["LK620"]);
  assert.deepEqual((await engine.chat({ text: "precio del tercero", memory })).products, []);
});
test("two phone models do not return a laptop stand with a similar model code", async () => {
  const bad = { ...products[0], id: "stand", code: "PC421", name: "SOPORTE PARA LAPTOP HA-A17" };
  const result = await new RockyAIOrchestrator({ ...backend, product: async () => bad }).chat({ text: "Samsung galaxy A17 5g Samsung galaxy A56 5g precio por favor" });
  assert.deepEqual(result.products, []);
});
test("portable chargers, phones and cables keep their product type", () => {
  assert.equal(matchesRequestedModel("cargadores portátiles", { name: "CARGADOR SAMSUNG 45W", code: "O902" }), false);
  assert.equal(matchesRequestedModel("celulares", { name: "TABLET BLACK SHARK CON CHIP", code: "O983" }), false);
  assert.equal(matchesRequestedModel("cable tipo C", { name: "AUDIFONO CON CABLE TIPO C", code: "AU256" }), false);
  assert.equal(matchesRequestedModel("cable para celular", { name: "CABLE TIPO C", code: "CA12" }), true);
});
test("price, address and missing delivery information all appear in one reply", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "Precio del LK618, dirección y delivery a Piura" });
  assert.match(result.reply, /100\.00/);
  assert.match(result.reply, /Calle de Prueba 123/);
  assert.match(result.reply, /Envío: Necesito que un asesor/);
  assert.equal(result.requiresHuman, true);
  assert.equal(result.reasonCode, "PARTIAL_INFORMATION_REQUIRES_REVIEW");
  assert.deepEqual(result.memory.productCodes, ["LK618"]);
  assert.doesNotMatch(result.reply, /Quieres comprarlo/);
});
test("each policy uses its own approved source; no duplicate address in payment", async () => {
  const result = await new RockyAIOrchestrator({ ...backend, knowledge: async (_q: string, _id?: string, type?: string) => [fact(type!, `Información aprobada de ${type}.`)] }).chat({ text: "Precio LK618, dirección, pago y garantía" });
  assert.match(result.reply, /100\.00/);
  assert.match(result.reply, /Pago: Información aprobada de PAYMENT/);
  assert.match(result.reply, /Garantía: Información aprobada de WARRANTY/);
  assert.equal(result.requiresHuman, false);
});
test("human request retains priority over multiple informational questions", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "quiero un asesor por precio, dirección y envío" });
  assert.equal(result.intent, "HUMAN_REQUEST");
  assert.deepEqual(result.products, []);
});
test("business greeting preserves the selected product without a repeated introduction", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "hola", memory: memorySchema.parse({ productCodes: ["LK618"] }) });
  assert.deepEqual(result.memory.productCodes, ["LK618"]);
  assert.doesNotMatch(result.reply, /Soy Rocky|Qué producto buscas/);
});
test("photo references cannot override a warranty question", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "garantía", resolvedProductCodes: ["LK618", "LK620"] });
  assert.equal(result.intent, "WARRANTY_QUERY");
  assert.equal(result.requiresHuman, true);
});
test("a changed product replaces the selected reference", () => {
  assert.deepEqual(detectPlan("precio LK620", memorySchema.parse({ productCodes: ["LK618"], query: "LK618" })).codes, ["LK620"]);
});
test("product information and address are both answered", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "Me brinda información del LK618 y su dirección" });
  assert.match(result.reply, /LK618/);
  assert.match(result.reply, /Calle de Prueba 123/);
});
test("catalog access problem does not create a product filter", async () => {
  let requested = "";
  const result = await new RockyAIOrchestrator({ ...backend, catalog: async query => { requested = query; return { scope: "FULL", label: "catálogo completo", url: "https://example.com/catalogo", count: 2 }; } }).chat({ text: "No puedo abrir el catálogo" });
  assert.equal(requested, "catálogo completo");
  assert.match(result.reply, /example\.com\/catalogo/);
  assert.match(result.reply, /error al abrirlo/);
});
test("box price is not fabricated from a single unit price", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "precio de la caja de 100", memory: memorySchema.parse({ productCodes: ["LK618"], query: "LK618" }) });
  assert.match(result.reply, /precio mostrado es por unidad/);
  assert.match(result.reply, /confirmar la presentación/);
  assert.equal(result.requiresHuman, true);
});
