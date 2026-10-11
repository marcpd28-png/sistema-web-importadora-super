import assert from "node:assert/strict";
import test from "node:test";
import { resolveCatalogScope } from "./catalog-request";
const brands = ["JBL", "Sony"];
test("resuelve general, categoría, marca y sinónimos", () => {
  assert.deepEqual(resolveCatalogScope("hola catálogo completo", brands), { kind: "general", key: "general", title: "CATÁLOGO GENERAL" });
  assert.deepEqual(resolveCatalogScope("catálogo de drones", brands), { kind: "category", key: "drones", category: "drones", title: "CATÁLOGO DE DRONES" });
  assert.deepEqual(resolveCatalogScope("catálogo de power bank", brands), { kind: "category", key: "power-banks", category: "power-banks", title: "CATÁLOGO DE POWER BANKS Y ENERGÍA" });
  assert.deepEqual(resolveCatalogScope("catálogo parlantes JBL", brands), { kind: "category-brand", key: "parlantes:jbl", category: "parlantes", brand: "JBL", title: "CATÁLOGO DE PARLANTES JBL" });
});

test("tolera typos de catálogo y de categoría sin convertir una petición ambigua en un catálogo", () => {
  assert.deepEqual(resolveCatalogScope("hola catálgoo dronse", brands), { kind: "category", key: "drones", category: "drones", title: "CATÁLOGO DE DRONES" });
  assert.deepEqual(resolveCatalogScope("catálogo de JBL", brands), { kind: "ambiguous", reason: "brand_without_category" });
  assert.deepEqual(resolveCatalogScope("catálogo de drones y televisores", brands), { kind: "ambiguous", reason: "category_ambiguous" });
  assert.deepEqual(resolveCatalogScope("catálogo de tostadoras", brands), { kind: "ambiguous", reason: "category_unknown" });
});
