import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesProductQuery, productQueryTerms, resolveCatalogQuery, oneSpellingEdit } from "./rocky-product-query";
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
  assert.equal(matchesProductQuery({ name: "TV BOX XIAOMI" }, "televisores"), false);
  assert.equal(matchesProductQuery({ name: "TV BOX XIAOMI" }, "tv box"), true);
  assert.equal(matchesProductQuery({ name: "COOLER PARA CELULAR" }, "celular"), false);
  assert.equal(matchesProductQuery({ name: "DADO IPHONE DE 20W" }, "celular"), false);
});
test("catalogue parsing preserves category and brand and does not intercept ordinary prose", () => {
  assert.equal(parseCatalogRequest("muy buen día habrá tv"), null);
  assert.equal(parseCatalogRequest("maquina cortadora de cabello"), null);
  assert.deepEqual(parseCatalogRequest("Tienen un catálogo de celular")?.terms, ["celular"]);
  assert.deepEqual(parseCatalogRequest("catálogo de productos televisores Samsung 43")?.terms, ["televisores", "samsung", "43"]);
  assert.equal(isGeneralCatalogRequest("catálogo de productos televisores"), false);
  assert.equal(isGeneralCatalogRequest("Buenas tardes soy Dimas de Arequipa me daría su catálogo de productos para escoger"), true);
});

test("speaker catalogs require speaker identity, not an accessory category", () => {
  assert.equal(matchesProductQuery({ name: "RADIO INTERCOMUNICADOR", category: "PARLANTES" }, "parlantes"), false);
  assert.equal(matchesProductQuery({ name: "TRIPODE PARA PARLANTE", category: "PARLANTES" }, "parlantes"), false);
  assert.equal(matchesProductQuery({ name: "TRIPODE PARA PARLANTE" }, "tripode parlante"), true);
  assert.equal(matchesProductQuery({ name: "PARLANTE CON MICROFONO KARAOKE" }, "parlantes"), true);
  assert.equal(matchesProductQuery({ name: "MICROFONO + PARLANTE KARAOKE" }, "parlantes"), true);
});

const identities = ["LICUADORA", "VENTILADOR", "IMPRESORA", "HERVIDOR", "MAQUINA DE HIELO", "MAQUINA CORTADORA DE CABELLO"].map((name, i) => ({
  id: String(i), code: `P${i}`, externalCode: null, name, brand: null, category: null,
  isVisible: true, stockUnits: 1, unitPrice: 10,
}));

test("catalog-derived correction works for arbitrary families without product-specific rules", () => {
  for (const [query, expected] of [["licudora", "licuadora"], ["ventiladro", "ventilador"], ["impresoraa", "impresora"], ["hervdor", "hervidor"]]) {
    assert.equal(resolveCatalogQuery(query, identities), expected);
  }
  assert.equal(resolveCatalogQuery("maquina de hielo", identities), "maquina hielo");
  assert.equal(matchesProductQuery(identities[5], resolveCatalogQuery("maquina de hielo", identities)), false);
});

test("uncertain spelling, short words, codes and brands cannot be guessed", () => {
  const rows = [...identities, { ...identities[0], name: "HERVIDAR", brand: "Hervdor" }];
  assert.equal(resolveCatalogQuery("hervider", rows), "hervider");
  assert.equal(resolveCatalogQuery("hervdor", rows), "hervdor");
  assert.equal(resolveCatalogQuery("P999 tv 32", rows), "p999 tv 32");
  assert.equal(resolveCatalogQuery("producto desconocido", rows), "desconocido");
  assert.equal(oneSpellingEdit("hielo", "pelo"), false);
});

test("availability phrasing is not product identity and measurement units remain bound", () => {
  assert.deepEqual(productQueryTerms("Todavía tiene a la venta la tablet de 32 pulgadas?"), ["tablet", "32", "pulgadas"]);
  assert.equal(matchesProductQuery({ name: 'TABLET ANDROID 32" 128GB' }, "tablet 32 pulgadas"), true);
  assert.equal(matchesProductQuery({ name: 'TABLET ANDROID 10" 32GB' }, "tablet 32 pulgadas"), false);
  assert.equal(matchesProductQuery({ name: 'TABLET ANDROID 32" 128GB' }, "tablet 32gb"), false);
  assert.equal(matchesProductQuery({ name: "TABLET ANDROID 32GB" }, "tablet 32 gb"), true);
});
