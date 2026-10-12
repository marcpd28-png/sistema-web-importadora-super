import assert from "node:assert/strict";
import test from "node:test";
import { buildMetaCatalogDescription, buildMetaCatalogFeed } from "@/lib/meta-catalog-feed";

const product = {
  code: "P1001",
  slug: "parlante-sensor-bt-rgb",
  name: "Mini parlante Bluetooth RGB",
  description: "Parlante con Bluetooth y luces RGB.",
  technicalSpecs: "Potencia: 5 W.",
  brand: "Super",
  category: "Parlantes",
  unitPrice: 30,
  wholesalePrice: 24,
  stockUnits: 8,
  localImageUrl: "/uploads/products/p1001.webp",
  imageUrl: null,
  media: [],
};

test("uses confirmed wholesale data and never adds customer warnings", () => {
  const description = buildMetaCatalogDescription(product);

  assert.match(description, /Precio por mayor desde 3 unidades: S\/ 24\.00/);
  assert.doesNotMatch(description, /confirma tu compra|verifica la compatibilidad|revisa cuidadosamente/i);
});

test("creates an XML item with price, image, product link and factual fallback description", () => {
  const feed = buildMetaCatalogFeed([{ ...product, description: null, technicalSpecs: null }]);

  assert.match(feed, /<g:id>P1001<\/g:id>/);
  assert.match(feed, /<g:price>30\.00 PEN<\/g:price>/);
  assert.match(feed, /<g:image_link>https:\/\/tiendavirtualsuper\.com\/uploads\/products\/p1001\.webp<\/g:image_link>/);
  assert.match(feed, /Mini parlante Bluetooth RGB \(SKU P1001\)\./);
});

test("does not emit products without stock or a real image", () => {
  const feed = buildMetaCatalogFeed([
    { ...product, code: "NO-STOCK", stockUnits: 0 },
    { ...product, code: "NO-IMAGE", localImageUrl: null },
  ]);

  assert.doesNotMatch(feed, /<item>/);
});
