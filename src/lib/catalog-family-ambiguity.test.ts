import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogIndex } from "./catalog-selection";

const index = createCatalogIndex([
  { code: "L1", name: "LAMPARA LED", brand: "SUPER", category: "HOGAR" },
  { code: "C1", name: "CAMARA DE SEGURIDAD", brand: "SUPER", category: "CAMARA DE SEGURIDAD" },
  { code: "B1", name: "CARTERA DE CUERO", brand: "SUPER", category: "MODA" },
  { code: "P1", name: "PARLANTE BLUETOOTH", brand: "JBL", category: "PARLANTES" },
]);

test("ambiguous family typos never silently select cameras", () => {
  for (const query of ["lamara", "lamapra", "carera"]) {
    assert.ok(!index.select(query).products.some(p => p.code === "C1"), query);
  }
});

test("exact families, unique prefixes and scoped requests still resolve", () => {
  for (const [query, code] of [["lampara", "L1"], ["camara", "C1"], ["cartera", "B1"], ["parl JBL", "P1"], ["parlante JBL", "P1"]]) {
    assert.deepEqual(index.select(query).products.map(p => p.code), [code], query);
  }
  assert.deepEqual(index.select("codigo L1").products.map(p => p.code), ["L1"]);
});
