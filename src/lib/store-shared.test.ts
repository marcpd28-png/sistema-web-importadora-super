import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductSearchWhere,
  getProductSearchTerms,
  getProductSearchTokenGroups,
  mapSuggestionResults,
} from "@/lib/store-shared";

type SuggestionCandidate = Parameters<typeof mapSuggestionResults>[0][number];

function candidate(overrides: Partial<SuggestionCandidate>): SuggestionCandidate {
  return {
    id: "product-1",
    slug: "product-1",
    code: "SKU-1",
    name: "Producto base",
    brand: null,
    category: null,
    externalCode: null,
    externalId: null,
    updatedAt: new Date("2026-07-06T10:00:00.000Z"),
    ...overrides,
  };
}

test("construye el filtro compartido de búsqueda parcial", () => {
  const where = buildProductSearchWhere("jbl");
  const serializedWhere = JSON.stringify(where);

  assert.match(serializedWhere, /"name"/);
  assert.match(serializedWhere, /"code"/);
  assert.match(serializedWhere, /"brand"/);
  assert.match(serializedWhere, /"category"/);
  assert.match(serializedWhere, /"externalCode"/);
  assert.match(serializedWhere, /"externalId"/);
  assert.match(serializedWhere, /"slug"/);
  assert.match(serializedWhere, /"contains":"jbl"/);
  assert.match(serializedWhere, /"mode":"insensitive"/);
});

test("ordena sugerencias por coincidencias parciales case-insensitive", () => {
  const results = mapSuggestionResults(
    [
      candidate({
        id: "unrelated",
        code: "ABC-1",
        name: "Producto sin coincidencia",
        updatedAt: new Date("2026-07-07T10:00:00.000Z"),
      }),
      candidate({
        id: "speaker",
        code: "O958-NEGRO",
        name: "(O958-NEGRO) PARLANTE JBL XTREME 5 ORIGINAL 130w",
        category: "PARLANTES",
      }),
      candidate({
        id: "headphone",
        code: "O952-BLACK",
        name: "(O952-BLACK) AUDIFONO BT JBL TUNE 530 BLACK",
        category: "AURICULARES",
      }),
    ],
    "jbl",
  );

  assert.deepEqual(
    results.map((item) => item.code),
    ["O958-NEGRO", "O952-BLACK"],
  );
});

test("acepta categoria plural para consulta singular", () => {
  const results = mapSuggestionResults(
    [
      candidate({
        id: "speaker",
        code: "T16-BLACK",
        name: "(T16) MINI PARLANTE TRANSFORMERS TF-Y16",
        category: "PARLANTES",
      }),
    ],
    "parlante",
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].code, "T16-BLACK");
});

test("genera variantes singular/plural sin depender de palabras fijas", () => {
  assert.ok(getProductSearchTerms("alexas").includes("alexa"));
  assert.ok(getProductSearchTerms("proyectores").includes("proyector"));
  assert.deepEqual(getProductSearchTokenGroups("proyectores jbl"), [
    ["proyectores", "proyector", "proyectore"],
    ["jbl"],
  ]);
});

test("ordena sugerencias cuando la consulta viene en plural y el producto en singular", () => {
  const results = mapSuggestionResults(
    [
      candidate({
        id: "alexa",
        code: "ALEXA-1",
        name: "Parlante inteligente Alexa Echo Dot",
        category: "ASISTENTES DE VOZ",
      }),
      candidate({
        id: "projector",
        code: "PROY-1",
        name: "Proyector LED portatil",
        category: "VIDEO",
      }),
    ],
    "proyectores",
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].code, "PROY-1");
});
