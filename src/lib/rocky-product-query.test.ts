import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesProductQuery, productQueryTerms } from "./rocky-product-query";
import { isGeneralCatalogRequest, parseCatalogRequest } from "./catalog-pdf";

test("informal greetings do not become product constraints", () => {
  assert.deepEqual(productQueryTerms("muy buen día habrá TV"), ["tv"]);
  assert.deepEqual(productQueryTerms("Buenas tardes quisiera saber cuánto está el extensor de pantalla"), ["extensor", "pantalla"]);
});
test("TV, celular and category plurals resolve without losing model numbers", () => {
  assert.equal(matchesProductQuery({ name: "TELEVISOR SMART 43 PULGADAS" }, "tv 43"), true);
  assert.equal(matchesProductQuery({ name: "TELEVISOR SMART 32 PULGADAS" }, "tv 43"), false);
  assert.equal(matchesProductQuery({ name: "CELULARES SAMSUNG" }, "celular"), true);
  assert.equal(matchesProductQuery({ name: "iPhone 15 Pro" }, "iphone 15 precio"), true);
  assert.equal(matchesProductQuery({ name: "iPhone 14 Pro" }, "iphone 15 precio"), false);
  assert.equal(matchesProductQuery({ name: "iPhone 150" }, "iphone 15 precio"), false);
});
test("accessories and descriptive mentions cannot masquerade as devices", () => {
  assert.equal(matchesProductQuery({ name: "CONTROL PARA TELEVISOR" }, "tv"), false);
  assert.equal(matchesProductQuery({ name: "FUNDA IPHONE 15" }, "iphone 15"), false);
  assert.equal(matchesProductQuery({ name: "FUNDA IPHONE 15" }, "funda iphone 15"), true);
  assert.equal(matchesProductQuery({ name: "TECLADO BLUETOOTH" }, "audifonos bluetooth"), false);
  assert.equal(matchesProductQuery({ name: "AUDIFONO BLUETOOTH", category: "ACCESORIOS PARA CELULARES" }, "celulares"), false);
});
test("catalogue parsing preserves category and brand and does not intercept ordinary prose", () => {
  assert.equal(parseCatalogRequest("muy buen día habrá tv"), null);
  assert.equal(parseCatalogRequest("maquina cortadora de cabello"), null);
  assert.deepEqual(parseCatalogRequest("Tienen un catálogo de celular")?.terms, ["celular"]);
  assert.deepEqual(parseCatalogRequest("catálogo de productos televisores Samsung 43")?.terms, ["televisores", "samsung", "43"]);
  assert.equal(isGeneralCatalogRequest("catálogo de productos televisores"), false);
  assert.equal(isGeneralCatalogRequest("Buenas tardes soy Dimas de Arequipa me daría su catálogo de productos para escoger"), true);
});
