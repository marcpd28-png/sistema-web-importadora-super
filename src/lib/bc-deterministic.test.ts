import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogIndex } from "./catalog-selection";
import { createCommercialCatalog, type CommercialProduct } from "./commercial-catalog";
import { emptyAgenda, planRequests } from "./bc-request-agenda";
import { answerCatalogSelection, answerProductRequest } from "./bc-request-answers";
import { parseCommercialQuery } from "./commercial-query";

const item = (code: string, name: string, brand: string, category: string, unitPrice: number, extra = {}) => ({ id: code, code, name, brand, category, unitPrice, isVisible: true, stockUnits: 12, imageUrl: "/uploads/product.jpg", media: [], specifications: [], updatedAt: new Date("2026-09-18"), ...extra }) as unknown as CommercialProduct;
const products = [
  item("C1", "CARGADOR SUPER 30W NEGRO", "SUPER", "CARGADORES", 50),
  item("C2", "CARGADOR SUPER 120W BLANCO", "SUPER", "CARGADORES", 95),
  item("C3", "CARGADOR SUPER 30W MORADO", "SUPER", "CARGADORES", 120),
  item("A1", "AUDIFONO JBL BLUETOOTH NEGRO", "JBL", "AURICULARES", 70),
  item("A2", "ADAPTADOR BLUETOOTH PARA AUDIFONOS JBL", "JBL", "ACCESORIOS", 20),
  item("F1", "FUENTE DE PODER SUPER 12V", "SUPER", "ENERGIA", 80),
  item("F2", "FUENTE DE PODER SUPER 24V", "SUPER", "ENERGIA", 200),
  item("T1", "TELEVISOR SAMSUNG 50 PULGADAS", "SAMSUNG", "TELEVISORES", 800),
  item("T2", "TV BOX ANDROID", "SUPER", "MULTIMEDIA", 100),
  item("W1", "SMART WATCH SILVER", "SUPER", "SMART WATCH", 100),
];
const index = createCatalogIndex(products);
const codes = (query: string) => index.select(query).products.map(product => product.code).sort();

test("independent wording changes preserve subjects without accepting unknown qualifiers", () => {
  for (const prefix of ["Necesitaríamos revisar", "¿Me podrías facilitar", "Quisiera conseguir", "Hola, busco"]) {
    for (const suffix of ["antes de cerrar mi compra", "cuando puedan", "para comparar opciones", "gracias"]) {
      assert.deepEqual(codes(`${prefix} catálogo de cargadores SUPER ${suffix}`), ["C1", "C2", "C3"]);
    }
  }
  for (const query of ["cargadores SUPER INEXISTENTE", "cargadores marca DESCONOCIDA", "shaver SUPER", "catálogo shaver"]) assert.deepEqual(codes(query), [], query);
});

test("family identity excludes accessories and TV boxes", () => {
  assert.deepEqual(codes("audífonos JBL Bluetooth"), ["A1"]);
  assert.deepEqual(codes("catálogo TV"), ["T1"]);
  assert.deepEqual(codes("catálogo TV BOX"), ["T2"]);
  assert.deepEqual(codes("adaptador Bluetooth JBL"), ["A2"]);
});

test("shared and per-family constraints keep their different scopes", () => {
  assert.deepEqual(codes("cargadores y fuentes de poder, todos hasta 90 soles"), ["C1", "F1"]);
  assert.deepEqual(codes("cargadores y audífonos, todos negros"), ["A1", "C1"]);
  assert.deepEqual(codes("cargadores y audífonos, ambos morados"), ["C3"]);
  assert.deepEqual(codes("cargadores hasta 60 soles y fuentes de poder hasta 100 soles"), ["C1", "F1"]);
  assert.deepEqual(codes("cargadores blancos y audífonos negros"), ["A1", "C2"]);
});

test("power, voltage, capacity and money remain distinct and cannot drop an unknown unit", () => {
  assert.equal(parseCommercialQuery("cargadores hasta 100W").constraints.maxPrice, null);
  assert.deepEqual(codes("cargadores hasta 100 W hasta 100 soles"), ["C1"]);
  assert.deepEqual(codes("fuentes de poder 12 V"), ["F1"]);
  assert.deepEqual(codes("fuentes de poder desde 20V"), ["F2"]);
  assert.deepEqual(codes("cargadores hasta 40cm"), []);
  assert.equal(parseCommercialQuery("hasta 1000 mAh").constraints.maxPrice, null);
  assert.equal(parseCommercialQuery("hasta S/ 100.50, gracias").constraints.maxPrice, 100.5);
});

test("a burst produces one scoped catalog and retains all source messages", () => {
  for (const messages of [["quiero catálogo", "de cargadores", "y de fuentes de poder"], ["quiero catálogo", "cargadores", "fuentes de poder", "SUPER"]]) {
    const plan = planRequests(emptyAgenda(), messages.map((content, i) => ({ id: `m${i}`, content })), index);
    assert.deepEqual(plan.agenda.requests.map(job => job.kind), ["CATALOG"]);
    assert.deepEqual(plan.agenda.requests[0].sourceMessageIds, messages.map((_, i) => `m${i}`));
    assert.deepEqual(codes(plan.agenda.topics[0].query), ["C1", "C2", "C3", "F1", "F2"]);
  }
});

test("product, payment and shipping questions coexist with independent evidence scopes", () => {
  const plan = planRequests(emptyAgenda(), [{ id: "m", content: "El cargador SUPER de 30W cuánto sale y se puede pagar con Yape y saber cuánto cuesta el envío" }]);
  assert.deepEqual(plan.agenda.requests.map(job => job.kind), ["PRICE", "PAYMENT", "SHIPPING"]);
  assert(plan.agenda.requests[0].topicId);
  assert.equal(plan.agenda.requests[1].topicId, null);
  assert.deepEqual(codes(plan.agenda.topics[0].query), ["C1", "C3"]);
});

test("unavailable identity is preserved before filtering availability", () => {
  const snapshot = createCommercialCatalog([item("Z", "CARGADOR NOVATEK", "NOVATEK", "CARGADORES", 50, { stockUnits: 0 })]);
  assert.equal(snapshot.search("catálogo NOVATEK").products.length, 0);
  const found = snapshot.search("catálogo NOVATEK", false);
  assert.equal(found.products.length, 1);
  assert.match(answerCatalogSelection(found, []).content, /sin stock/);
  const missingPhoto = createCommercialCatalog([item("Z", "CARGADOR NOVATEK", "NOVATEK", "CARGADORES", 50, { imageUrl: null })]);
  assert.match(answerCatalogSelection(missingPhoto.search("NOVATEK", false), []).content, /no tienen una foto/);
  assert.match(answerCatalogSelection(index.select("shaver"), []).content, /No pude identificar con certeza/);
});

test("every requested family gets options, even if the first has many results", () => {
  const many = [...Array.from({ length: 14 }, (_, i) => item(`CC${i}`, `CARGADOR SUPER MODELO ${i}`, "SUPER", "CARGADORES", 50)), products[3]];
  const snapshot = createCommercialCatalog(many);
  const plan = planRequests(emptyAgenda(), [{ id: "m", content: "busco cargadores y audífonos" }]);
  const selection = snapshot.search(plan.agenda.topics[0].query, false);
  const answer = answerProductRequest(plan.agenda.requests[0], plan.agenda.topics[0], selection.products, { scopes: selection.scopes });
  assert(answer.evidence.includes("Product:A1:2026-09-18T00:00:00.000Z"));
  assert.match(answer.content, /AUDIFONO JBL/);
  assert(plan.agenda.topics[0].shownCodes.includes("A1"));
  const ambiguous = planRequests(plan.agenda, [{ id: "n", content: "el segundo" }]);
  assert.equal(ambiguous.agenda.requests.at(-1)?.topicId, null);
  const specific = planRequests(plan.agenda, [{ id: "n", content: "el segundo de cargadores" }]);
  assert.equal(specific.agenda.topics[0].selectedCode, plan.agenda.topics[0].shownGroups![0].codes[1]);
});

test("a quantity fragment refines the only quote in its burst", () => {
  const result = planRequests(emptyAgenda(), [{ id: "a", content: "precio C1" }, { id: "b", content: "dos unidades" }]);
  assert.equal(result.agenda.requests.length, 1);
  assert.equal(result.agenda.requests[0].quantity, 2);
  assert.deepEqual(result.agenda.requests[0].sourceMessageIds, ["a", "b"]);
});
