import assert from "node:assert/strict";
import test from "node:test";
import { answerRockyShopAssistant } from "./shop-assistant";
import type { ProductFact } from "./contracts";
import type { ToolBackend } from "./tools";
import { mapAssistantProduct } from "../shop-assistant";

const product: ProductFact = { id: "p1", code: "LK618", name: "Cargador LK618", brand: "Super", category: "Cargadores",
  unitPrice: 20, wholesalePrice: 15, wholesaleMinQty: 6, stockUnits: 40, description: null, technicalSpecs: null };
const backend: ToolBackend = {
  search: async () => [product], product: async code => code === product.code ? product : null, knowledge: async () => [],
  catalog: async () => ({ scope: "FILTERED", label: "cargadores", url: "https://tiendavirtualsuper.com/?q=cargadores", count: 1, reason: "WEB_CATALOG" }),
};
const deps = { backend, cards: async (ids: string[]) => ids.includes(product.id) ? [mapAssistantProduct({ ...product, slug: "cargador", boxPrice: null, unitsPerBox: null }, "S/")] : [] };

test("la tienda responde con Rocky y conserva tarjetas compatibles con el carrito", async () => {
  const greeting = await answerRockyShopAssistant({ message: "hola" }, undefined, deps);
  assert.match(greeting.reply.text, /Rocky/);
  assert.equal(greeting.reply.meta?.engine, "ROCKY");
  const first = await answerRockyShopAssistant({ message: "precio LK618" }, undefined, deps);
  assert.equal(first.reply.products?.[0].slug, "cargador");
  assert.equal(first.reply.products?.[0].unitPriceValue, 20);
  const follow = await answerRockyShopAssistant({ message: "quiero 12 unidades" }, first.memory, deps);
  assert.match(follow.reply.text, /15\.00/);
  assert.equal(follow.memory.quantity, 12);
  const purchase = await answerRockyShopAssistant({ message: "quiero comprarlo" }, follow.memory, deps);
  assert.match(purchase.reply.text, /Agregar/);
  assert.equal(purchase.reply.products?.[0].recommendedQuantity, 12);
});

test("el catálogo web conserva un enlace sin decir que adjuntó un PDF", async () => {
  const result = await answerRockyShopAssistant({ message: "catálogo de cargadores" }, undefined, deps);
  assert.equal(result.reply.quickActions?.[0].href, "https://tiendavirtualsuper.com/?q=cargadores");
  assert.doesNotMatch(result.reply.text, /PDF|adjunt|no pude/);
});

test("la cantidad del último mensaje prevalece y conserva el producto seleccionado", async () => {
  const first = await answerRockyShopAssistant({ message: "precio LK618" }, undefined, deps);
  for (const [message, quantity] of [["quiero comprar 3 unidades", 3], ["quiero 2", 2], ["dame dos", 2], ["quiero comprar 6 unidades", 6]] as const) {
    const result = await answerRockyShopAssistant({ message }, first.memory, deps);
    assert.equal(result.memory.quantity, quantity, message);
    assert.equal(result.reply.products?.[0].code, product.code, message);
    assert.equal(result.reply.products?.[0].recommendedQuantity, quantity, message);
  }
});

test("la tarjeta limita la cantidad al stock y una referencia distinta no compra el producto anterior", async () => {
  const first = await answerRockyShopAssistant({ message: "precio LK618" }, undefined, deps);
  const overStock = await answerRockyShopAssistant({ message: "quiero comprar 100 unidades" }, first.memory, deps);
  assert.equal(overStock.reply.products?.[0].recommendedQuantity, product.stockUnits);
  const different = await answerRockyShopAssistant({ message: "quiero comprar 2 AB999" }, first.memory, deps);
  assert.equal(different.reply.products?.length, 0);
});

test("el asesor se ofrece como enlace y no como derivación ya enviada", async () => {
  const result = await answerRockyShopAssistant({ message: "quiero hablar con un asesor" }, undefined, deps);
  assert.match(result.reply.text, /Pulsa/);
  assert.equal(result.reply.quickActions?.[0].label, "Hablar con un asesor");
  assert.doesNotMatch(result.reply.text, /registrada|te paso/);
});

test("un contexto de producto oculto no produce tarjetas ni precios", async () => {
  const result = await answerRockyShopAssistant({ message: "precio", productContextCode: "HIDDEN" }, undefined,
    { ...deps, backend: { ...backend, search: async () => [], product: async () => null }, cards: async () => [] });
  assert.equal(result.reply.products?.length, 0);
  assert.doesNotMatch(result.reply.text, /20\.00|15\.00/);
});
