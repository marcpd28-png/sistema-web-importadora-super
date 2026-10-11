import assert from "node:assert/strict";
import test from "node:test";

import { catalogParts } from "./catalog-pdf";
import { catalogPartCaption, catalogRetryAt, catalogSnapshotHash, createCatalogSnapshot, selectCatalogProducts } from "./catalog-generation";
import { resolveCatalogScope } from "./catalog-request";

const scope = resolveCatalogScope("catálogo de celulares")!;
if (scope.kind !== "category") throw new Error("test fixture must resolve a category");
const now = new Date("2026-10-11T10:00:00.000Z");
const products = [
  { id: "phone", name: "CELULAR MODELO X", code: "PHONE-1", brand: "Acme", category: "Telefonía", imageUrl: null, localImageUrl: null, sourceImageUrl: null, media: [], updatedAt: now, unitPrice: 199, wholesalePrice: null, wholesaleMinQty: 3 },
  { id: "ring", name: "ARO LED MAGNÉTICO PARA CELULAR", code: "N2207", brand: "Acme", category: "Accesorios", imageUrl: null, localImageUrl: null, sourceImageUrl: null, media: [], updatedAt: now, unitPrice: 29, wholesalePrice: null, wholesaleMinQty: 3 },
];

test("el selector usa la categoría visual canónica, no una palabra suelta ni la categoría ERP", () => {
  assert.equal(scope.kind, "category");
  const selected = selectCatalogProducts(products, scope);
  assert.deepEqual(selected.map(product => product.code), ["PHONE-1"]);
});

test("tipo y marca conservan un filtro exacto aunque la fuente deje la marca en el nombre", () => {
  const brandedScope = resolveCatalogScope("catálogo de parlantes JBL", ["JBL"]);
  if (!brandedScope || brandedScope.kind !== "category-brand") throw new Error("test fixture must resolve category and brand");
  const audio = [
    { id: "jbl", name: "PARLANTE JBL GO 4", code: "JBL-1", brand: null, category: null, imageUrl: null, localImageUrl: null, sourceImageUrl: null, media: [], updatedAt: now, unitPrice: 199, wholesalePrice: null, wholesaleMinQty: 3 },
    { id: "sony", name: "PARLANTE SONY MINI", code: "SONY-1", brand: null, category: null, imageUrl: null, localImageUrl: null, sourceImageUrl: null, media: [], updatedAt: now, unitPrice: 199, wholesalePrice: null, wholesaleMinQty: 3 },
  ];
  assert.deepEqual(selectCatalogProducts(audio, brandedScope).map(product => product.code), ["JBL-1"]);
});

test("el snapshot conserva nombres/SKU y productos sin foto; no los omite", () => {
  const selected = selectCatalogProducts(products, scope);
  const snapshot = createCatalogSnapshot(selected, scope, now);
  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.products[0].name, "CELULAR MODELO X");
  assert.equal(snapshot.products[0].code, "PHONE-1");
  assert.deepEqual(snapshot.products[0].imageUrls, []);
  assert.equal(catalogSnapshotHash(snapshot), catalogSnapshotHash(snapshot));
});

test("un catálogo grande se parte de forma estable sin truncarlo", () => {
  const parts = catalogParts(Array.from({ length: 65 }, (_, index) => index));
  assert.deepEqual(parts.map(part => part.length), [32, 32, 1]);
  assert.deepEqual(parts.flat(), Array.from({ length: 65 }, (_, index) => index));
});

test("el adaptador conserva el número de parte y los reintentos tienen espera acotada", () => {
  assert.match(catalogPartCaption("CATÁLOGO GENERAL", 2, 3, 32), /parte 2 de 3 \(32 productos\)/);
  assert.equal(catalogRetryAt(now, 1).toISOString(), "2026-10-11T10:00:10.000Z");
  assert.equal(catalogRetryAt(now, 3).toISOString(), "2026-10-11T10:05:00.000Z");
});
