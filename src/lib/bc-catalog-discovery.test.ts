import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogIndex, type CatalogCandidate } from "./catalog-selection";
import { emptyAgenda, planRequests } from "./bc-request-agenda";

const rows: CatalogCandidate[] = [
  { code: "K1", name: "CABLE PARA CELULAR", brand: null, category: "ACCESORIOS PARA CELULARES", specifications: [{ name: "Marca", value: "KZ" }] },
  { code: "K2", name: "AUDIFONO KZ NEGRO", brand: null, category: "AURICULARES", unitPrice: 70 },
  { code: "H1", name: "AUDIFONO HOCO BLANCO", brand: "HOCO", category: "AURICULARES", unitPrice: 80 },
  { code: "B1", name: "MAQUINA BOMA", brand: null, category: "ACCESORIOS DE CUIDADO PERSONAL", specifications: [{ name: "Marca", value: "BOMA" }] },
  { code: "S1", name: "CONTROL REMOTO", brand: null, category: "ENTRETENIMIENTO Y MULTIMEDIA", specifications: [{ name: "Marca", value: "SUPER / Importaciones Super" }] },
  { code: "X1", name: "CABLE BASEUS SUPER SI", brand: "BASEUS", category: "ACCESORIOS PARA CELULARES" },
];
const index = createCatalogIndex(rows);

function searchViaAgenda(content: string) {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "input", content }]);
  assert.equal(agenda.topics.length, 1, content);
  return index.select(agenda.topics[0].query).products.map(product => product.code).sort();
}

test("natural category and brand questions preserve the actual inventory scope", () => {
  for (const [query, expected] of [
    ["Estoy buscando productos de ACCESORIOS DE CUIDADO PERSONAL. ¿Qué tienen disponibles?", ["B1"]],
    ["Estoy buscando productos de la marca BOMA. ¿Qué tienen disponibles?", ["B1"]],
    ["Busco ACCESORIOS PARA CELULARES de la marca KZ. ¿Qué modelos tienen disponibles?", ["K1"]],
    ["¿Tienes accesorios para celulares de marca KZ?", ["K1"]],
    ["accesorios de cuidado personal", ["B1"]],
    ["¿Qué auriculares HOCO tienen disponibles?", ["H1"]],
    ["Pásame el catálogo de accesorios para celulares marca KZ", ["K1"]],
  ] as const) assert.deepEqual(searchViaAgenda(query), expected, query);
});

test("verified brand attributes and own-brand aliases are searchable without changing inventory", () => {
  const snapshot = structuredClone(rows);
  for (const brand of ["SUPER", "Importaciones Super", "SUPER / Importaciones Super"]) {
    assert.deepEqual(searchViaAgenda(`Busco ENTRETENIMIENTO Y MULTIMEDIA de marca ${brand}. ¿Qué modelos tienen disponibles?`), ["S1"]);
  }
  assert.equal(index.productBrand(rows[4]), "SUPER");
  assert.deepEqual(rows, snapshot);
  assert.deepEqual(index.select("marca SUPER").products.map(product => product.code), ["S1"]);
});

test("category, brand, color, price and unknown brands never relax silently", () => {
  assert.deepEqual(searchViaAgenda("Busco auriculares KZ negros hasta 75 soles. ¿Qué modelos tienen disponibles?"), ["K2"]);
  assert.deepEqual(searchViaAgenda("Busco auriculares KZ blancos hasta 75 soles"), []);
  assert.deepEqual(searchViaAgenda("Busco accesorios para celulares marca INEXISTENTE"), []);
  assert.deepEqual(searchViaAgenda("Busco auriculares BOMA"), []);
});

test("brand metadata has precedence over compatibility mentions in a product name", () => {
  const inventory = createCatalogIndex([
    { code: "X", name: "CARGADOR HOCO PARA SAMSUNG", brand: null, category: "CARGADORES", specifications: [{ name: "Marca", value: "HOCO" }] },
    { code: "Y", name: "CARGADOR SAMSUNG ORIGINAL", brand: "SAMSUNG", category: "CARGADORES" },
  ]);
  assert.deepEqual(inventory.select("cargadores Samsung").products.map(product => product.code), ["Y"]);
});

test("compound manufacturer and sub-brand metadata remains searchable by either declared name", () => {
  const inventory = createCatalogIndex([
    { code: "R", name: "AUDIFONO BUDS", brand: null, category: "AURICULARES", specifications: [{ name: "Marca", value: "Xiaomi / Redmi" }] },
  ], ["Xiaomi", "Redmi"]);
  for (const brand of ["Xiaomi", "Redmi", "Xiaomi / Redmi"]) {
    assert.deepEqual(inventory.select(`auriculares marca ${brand}`).products.map(product => product.code), ["R"]);
  }
});

test("sentence punctuation does not lose an exact model while real dotted SKUs remain distinct", () => {
  const inventory = createCatalogIndex([
    { code: "N2221", name: "PROYECTOR HY500 PRO", brand: null, category: "PROYECTORES" },
    { code: "BT454", name: "MODELO BASE", brand: null, category: null },
    { code: "BT454.", name: "OTRO MODELO", brand: null, category: null },
  ]);
  assert.deepEqual(inventory.select("Quiero información del producto código N2221.").products.map(product => product.code), ["N2221"]);
  for (const code of ["BT454", "BT454."]) {
    assert.deepEqual(inventory.select(`código ${code}`).products.map(product => product.code), [code]);
  }
  assert.deepEqual(inventory.select("código N2221-OTRO").products, []);
});

test("battery discovery excludes battery chargers while retaining portable power banks and cells", () => {
  const inventory = createCatalogIndex([
    { code: "CH", name: "CARGADOR DE BATERIA 5 EN 1", brand: null, category: "ACCESORIOS PARA AUTO" },
    { code: "PW", name: "CARGADOR PORTATIL 5000MAH", brand: null, category: "ACCESORIOS PARA CELULARES" },
    { code: "BT", name: "BATERIA RECARGABLE", brand: null, category: "BATERIAS" },
    { code: "AA", name: "PILA ALCALINA", brand: null, category: "ARTICULOS PARA EL HOGAR" },
  ]);
  assert.deepEqual(inventory.select("Estoy buscando productos de baterías. ¿Qué tienen disponibles?").products.map(product => product.code).sort(), ["AA", "BT", "PW"]);
  assert.deepEqual(inventory.select("cargadores de batería").products.map(product => product.code), ["CH"]);
});

test("projector discovery excludes projection screens and retains the actual device", () => {
  const inventory = createCatalogIndex([
    { code: "PR", name: "HAVIT PROYECTOR PJ209A PLUS", brand: "HAVIT", category: "ENTRETENIMIENTO Y MULTIMEDIA" },
    { code: "EC", name: 'ECRAN PARA PROYECTOR 100" HAVIT PA302', brand: "HAVIT", category: "ENTRETENIMIENTO Y MULTIMEDIA" },
    { code: "SC", name: "PANTALLA PARA PROYECTOR", brand: null, category: "PROYECTORES" },
  ]);
  assert.deepEqual(inventory.select("Estoy buscando productos de proyectores. ¿Qué tienen disponibles?").products.map(product => product.code), ["PR"]);
  assert.deepEqual(inventory.select("ecran HAVIT PA302").products.map(product => product.code), ["EC"]);
});
