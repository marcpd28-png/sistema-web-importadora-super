import assert from "node:assert/strict";
import test from "node:test";
import { agendaSchema, emptyAgenda, planRequests, requestedQuantity } from "./bc-request-agenda";
import { answerProductRequest, splitAnswerText } from "./bc-request-answers";
import { createCatalogIndex } from "./catalog-selection";
import type { CommercialProduct } from "./commercial-catalog";
import { literalProductCodes } from "./commercial-query";

const product = (code: string, name: string, override = {}) => ({ id: code, code, name, brand: "JBL", category: "AURICULARES", isVisible: true, imageUrl: "/uploads/products/photo.jpg", stockUnits: 20, unitPrice: 90, wholesalePrice: 75, wholesaleMinQty: 6, boxPrice: null, unitsPerBox: null, unitLabel: "unidad", updatedAt: new Date("2026-09-17"), digitalProfile: { status: "PUBLICADA", descriptionShort: "Ficha aprobada" }, specifications: [], ...override }) as unknown as CommercialProduct;
const products = [product("A1", "AUDIFONO JBL TUNE NEGRO"), product("A2", "AUDIFONO JBL TUNE BLANCO"), product("A3", "AUDIFONO JBL DIADEMA NEGRO"), product("A4", "AUDIFONO JBL NEGRO", { unitPrice: 130 }), product("P1", "PROYECTOR HY300", { brand: null, category: "PROYECTORES" }), product("P2", "PROYECTOR HY300 PRO", { brand: null, category: "PROYECTORES" })];
const index = createCatalogIndex(products);

test("cinco mensajes distinguen una, tres, cuatro o cinco consultas en su orden", () => {
  const scenarios = [
    { messages: ["precio", "de audífonos", "JBL", "negros", "seis unidades"], kinds: ["PRICE"] },
    { messages: ["precio A1", "seis unidades", "stock P1", "aceptan yape", "gracias"], kinds: ["PRICE", "STOCK", "PAYMENT"] },
    { messages: ["precio A1", "seis unidades", "stock P1", "aceptan yape", "horario"], kinds: ["PRICE", "STOCK", "PAYMENT", "STORE"] },
    { messages: ["precio A1", "stock P1", "aceptan yape", "horario", "envíos a Arequipa"], kinds: ["PRICE", "STOCK", "PAYMENT", "STORE", "SHIPPING"] },
  ];
  for (const scenario of scenarios) {
    const { agenda } = planRequests(emptyAgenda(), scenario.messages.map((content, i) => ({ id: `m${i}`, content })), index);
    assert.deepEqual(agenda.requests.map(job => job.kind), scenario.kinds, scenario.messages.join(" / "));
    if (scenario.kinds.length < 5) assert.equal(agenda.requests[0].quantity, 6);
  }
});

test("consultas de productos y negocio en un mensaje mantienen su orden y tema", () => {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "m1", content: "precio A1 y stock P1 y aceptan yape" }], index);
  assert.deepEqual(agenda.requests.map(job => job.kind), ["PRICE", "STOCK", "PAYMENT"]);
  assert.deepEqual(agenda.requests.map(job => agenda.topics.find(topic => topic.id === job.topicId)?.query ?? null), ["A1", "P1", null]);
  assert.deepEqual(planRequests(emptyAgenda(), [{ id: "m2", content: "A1 qué garantía y qué potencia tiene" }], index).agenda.requests[0].fields, ["garantia", "potencia"]);
});

test("el saludo y tres catálogos seguidos conservan cada familia y la marca JBL", () => {
  const rows = [
    product("J1", "PARLANTE JBL CHARGE", { category: "PARLANTES" }),
    product("S1", "PARLANTE SONY", { brand: "SONY", category: "PARLANTES" }),
    product("T1", "TELEVISOR SAMSUNG", { brand: "SAMSUNG", category: "TELEVISORES" }),
    product("X1", "TV BOX ANDROID", { brand: null, category: "TELEVISORES" }),
    product("X2", "SOPORTE PARA TV", { brand: null, category: "TELEVISORES" }),
    product("D1", "DRONE DJI", { brand: "DJI", category: "DRONES" }),
  ];
  const catalog = createCatalogIndex(rows);
  const messages = ["hola", "catalogo de parlantes jbl", "catalogo de teles", "catalogo de drones tambien"]
    .map((content, i) => ({ id: `m${i}`, content }));
  const { agenda } = planRequests(emptyAgenda(), messages, catalog);
  assert.equal(agenda.requests.length, 3);
  assert(agenda.requests.every(job => job.kind === "CATALOG"));
  assert.deepEqual(agenda.requests.map(job => catalog.select(agenda.topics.find(topic => topic.id === job.topicId)!.query).products.map(row => row.code)), [["J1"], ["T1"], ["D1"]]);
  assert.deepEqual(agenda.requests.map(job => job.sourceMessageIds), [["m1"], ["m2"], ["m3"]]);
  assert.deepEqual(catalog.select("catálogo de tele Samsung").products.map(row => row.code), ["T1"]);
});

test("search intersects color, budget and exclusions; numeric model never becomes Pro", () => {
  assert.deepEqual(index.select("audífonos JBL negros hasta 100 soles que no sean de diadema").products.map(p => p.code), ["A1"]);
  assert.deepEqual(index.select("proyector HY300").products.map(p => p.code), ["P1"]);
  assert.deepEqual(index.select("proyector HY300 PRO").products.map(p => p.code), ["P2"]);
  assert.deepEqual(index.select("audífonos JBL entre 100 y 150 soles").products.map(p => p.code), ["A4"]);
  assert.deepEqual(index.select("audífonos JBL sin negros").products.map(p => p.code), ["A2"]);
});

test("punctuation and suffixes distinguish exact ERP identifiers", () => {
  const identity = createCatalogIndex([product("BT454", "UNO"), product("BT454.", "DOS"), product("PC388", "HUB"), product("PC388-SQ", "COOLER"), product("O526- BLACK", "AUDIFONO")]);
  for (const code of ["BT454", "BT454.", "PC388", "PC388-SQ", "O526- BLACK"]) assert.deepEqual(identity.select(`código ${code}`).products.map(p => p.code), [code]);
  assert.equal(identity.select("código PC388-UNKNOWN").products.length, 0);
});

test("six scattered messages retain each request and scope quantities to headphones", () => {
  const { agenda } = planRequests(emptyAgenda(), ["Pásame catálogo de audífonos JBL", "Solo negros", "También quiero información del HY300", "¿Ese trae Android?", "¿Cuánto salen seis audífonos?", "¿Hacen envíos a Arequipa?"].map((content, i) => ({ id: `m${i}`, content })));
  assert.equal(agenda.requests.length, 5);
  const catalog = agenda.requests.find(r => r.kind === "CATALOG")!;
  const price = agenda.requests.find(r => r.kind === "PRICE")!;
  const information = agenda.requests.filter(r => r.kind === "INFORMATION");
  assert.match(agenda.topics.find(t => t.id === catalog.topicId)!.query, /JBL.*negros/i);
  assert.equal(price.topicId, catalog.topicId);
  assert.equal(price.quantity, 6);
  assert.equal(information[0].topicId, information[1].topicId);
  assert.notEqual(price.topicId, information[0].topicId);
  assert.deepEqual(information[1].fields, ["sistema"]);
  assert(agendaSchema.safeParse(agenda).success);
});

test("a correction updates only the active topic and survives serialization/restart", () => {
  const first = planRequests(emptyAgenda(), [{ id: "a", content: "catálogo audífonos JBL negros" }]).agenda;
  first.requests[0].status = "ANSWERED";
  const restored = agendaSchema.parse(JSON.parse(JSON.stringify(first)));
  const next = planRequests(restored, [{ id: "b", content: "mejor blancos" }]);
  assert.match(next.agenda.topics[0].query, /blancos/);
  assert.doesNotMatch(next.agenda.topics[0].query, /negros/);
  assert.equal(next.agenda.requests[0].status, "PENDING");
  assert.deepEqual(next.agenda.requests[0].sourceMessageIds, ["a", "b"]);
});

test("multiple attributes are answered independently; missing warranty remains explicit", () => {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "a", content: "HY300: ¿cuánto dura la batería, qué potencia tiene y qué garantía?" }]);
  const job = agenda.requests.find(r => r.kind === "INFORMATION")!;
  const answer = answerProductRequest(job, agenda.topics[0], [product("P1", "PROYECTOR HY300", { specifications: [{ name: "Autonomía", value: "2 horas" }, { name: "Potencia RMS", value: "20 W" }] })]);
  assert.match(answer.content, /Autonomía: 2 horas/);
  assert.match(answer.content, /Potencia RMS: 20 W/);
  assert.match(answer.content, /Garantía: no tengo ese dato confirmado/);
  assert.equal(answer.status, "NEEDS_CLARIFICATION");
});

test("draft specifications never become confirmed facts", () => {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "a", content: "información HY300 potencia" }]);
  const answer = answerProductRequest(agenda.requests[0], agenda.topics[0], [product("P1", "HY300", { digitalProfile: { status: "BORRADOR" }, specifications: [{ name: "Potencia", value: "9999 W" }] })]);
  assert.doesNotMatch(answer.content, /9999/);
  assert.equal(answer.status, "NEEDS_CLARIFICATION");
});

test("quote applies the existing wholesale rule and checks requested quantity against live stock", () => {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "a", content: "precio A1 por seis unidades" }]);
  const answer = answerProductRequest(agenda.requests[0], agenda.topics[0], [products[0]]);
  assert.match(answer.content, /75\.00[\s\S]*450\.00/);
  assert.equal(answer.status, "ANSWERED");
  assert.equal(answerProductRequest(agenda.requests[0], agenda.topics[0], [{ ...products[0], stockUnits: 2 }]).status, "NEEDS_CLARIFICATION");
  assert.equal(requestedQuantity("HY300 256GB"), null);
});

test("a reply for shipping never clears a previously unresolved product question", () => {
  const first = planRequests(emptyAgenda(), [{ id: "a", content: "precio audífonos JBL por seis unidades" }]).agenda;
  first.requests[0].status = "NEEDS_CLARIFICATION";
  const next = planRequests(first, [{ id: "b", content: "¿Hacen envíos por Shalom?" }]);
  assert.equal(next.agenda.requests[0].status, "NEEDS_CLARIFICATION");
  assert.equal(next.agenda.requests[1].kind, "SHIPPING");
});

test("long approved specifications are split without losing content", () => {
  const content = "a".repeat(8000);
  const chunks = splitAnswerText(content);
  assert(chunks.every(chunk => chunk.length <= 3500));
  assert.equal(chunks.join(""), content);
});

test("mixed requests in one message keep catalog filters separate from business questions", () => {
  const result = planRequests(emptyAgenda(), [{ id: "m", content: "catálogo audífonos JBL y formas de pago y ¿hacen envíos por Shalom?" }]);
  assert.deepEqual(result.agenda.requests.map(job => job.kind), ["CATALOG", "PAYMENT", "SHIPPING"]);
  assert.match(result.agenda.topics[0].query, /audífonos JBL/);
  assert(result.agenda.requests[0].topicId);
  assert.equal(result.agenda.requests[1].topicId, null);
});

test("an explicit topic in a correction wins over the most recent unrelated product", () => {
  const first = planRequests(emptyAgenda(), [{ id: "a", content: "catálogo audífonos JBL negros hasta 100 soles" }, { id: "b", content: "información HY300" }]).agenda;
  const result = planRequests(first, [{ id: "c", content: "mejor blancos los audífonos" }]);
  assert.match(result.agenda.topics[0].query, /blancos/);
  assert.match(result.agenda.topics[0].query, /hasta 100 soles/);
  assert.equal(result.agenda.topics[1].query, "HY300");
});

test("typos and capacity spacing keep the same identity without relaxing model digits", () => {
  const found = createCatalogIndex([product("R1", "CELULAR REDMI NOTE 15 256GB", { brand: "XIAOMI" }), product("R2", "CELULAR REDMI NOTE 15 PRO 256GB", { brand: "XIAOMI" }), product("J1", "PARLANTE JBL CHARGE 6", { category: "PARLANTES" })]);
  assert.deepEqual(found.select("Readmi note 15 256 GB").products.map(item => item.code), ["R1"]);
  assert.deepEqual(found.select("parlante JBL chagre 6").products.map(item => item.code), ["J1"]);
  assert.equal(found.select("parlante JBL charge 7").products.length, 0);
});

test("an ordinal never guesses between two product lists", () => {
  const prior = planRequests(emptyAgenda(), [{ id: "a", content: "audífonos JBL" }, { id: "b", content: "parlantes SUPER" }]).agenda;
  prior.topics[0].shownCodes = ["A1", "A2"]; prior.topics[1].shownCodes = ["P1", "P2"];
  const next = planRequests(prior, [{ id: "c", content: "el segundo" }]);
  assert.equal(next.recognized, true);
  assert.equal(next.agenda.requests.at(-1)?.topicId, null);
  assert(next.agenda.topics.every(topic => topic.selectedCode === null));
});

test("quantities in a followup remain associated with the selected topic", () => {
  const first = planRequests(emptyAgenda(), [{ id: "a", content: "precio A1" }]).agenda;
  const next = planRequests(first, [{ id: "b", content: "seis unidades" }]);
  assert.equal(next.agenda.requests.at(-1)?.kind, "PRICE");
  assert.equal(next.agenda.requests.at(-1)?.topicId, first.topics[0].id);
  assert.equal(next.agenda.requests.at(-1)?.quantity, 6);
});

test("catalog lists preserve per-clause brands when passing through the agenda", () => {
  const rows = [product("J", "AUDIFONO JBL NEGRO"), product("S", "PARLANTE SUPER", { brand: "SUPER", category: "PARLANTES" }), product("X", "AUDIFONO SUPER", { brand: "SUPER" }), product("Y", "PARLANTE JBL", { category: "PARLANTES" })];
  const result = planRequests(emptyAgenda(), [{ id: "a", content: "catálogo audífonos JBL y parlantes SUPER" }]);
  assert.deepEqual(createCatalogIndex(rows).select(result.agenda.topics[0].query).products.map(p => p.code).sort(), ["J", "S"]);
});

test("a first product search with a color is not mistaken for a context correction", () => {
  const result = planRequests(emptyAgenda(), [{ id: "a", content: "audífonos JBL negros hasta 100 soles" }]);
  assert.equal(result.recognized, true);
  assert.equal(result.agenda.requests[0].kind, "SEARCH");
  assert(result.agenda.topics[0].query.includes("negros"));
});

test("battery capacity cannot answer a request for battery life", () => {
  const { agenda } = planRequests(emptyAgenda(), [{ id: "a", content: "A1 cuánto dura la batería" }]);
  const answer = answerProductRequest(agenda.requests[0], agenda.topics[0], [product("A1", "AUDIFONO", { specifications: [{ name: "Batería", value: "400 mAh" }] })]);
  assert.match(answer.content, /Autonomía: no tengo ese dato confirmado/);
  assert.equal(answer.status, "NEEDS_CLARIFICATION");
});

test("spaced suffixes do not also select the base SKU; separate requested codes remain separate", () => {
  assert.deepEqual(literalProductCodes("código N755 - SQ", ["N755", "N755 - SQ"]), ["N755 - SQ"]);
  assert.deepEqual(literalProductCodes("códigos N755 y N755 - SQ", ["N755", "N755 - SQ"]).sort(), ["N755", "N755 - SQ"]);
});

test("una foto y cuatro mensajes mantienen pago, precio por cantidad y envío en orden", () => {
  for (const code of ["A1", null]) {
    const plan = planRequests(emptyAgenda(), [
      { id: "p", content: "aceptan yape" },
      { id: "i", content: "", imageReference: { code, label: "la foto 1 de este grupo" } },
      { id: "q", content: "precio de este" },
      { id: "n", content: "seis unidades" },
      { id: "e", content: "envíos a Arequipa" },
    ], index);
    assert.deepEqual(plan.agenda.requests.map(job => job.kind), ["PAYMENT", "PRICE", "SHIPPING"]);
    const price = plan.agenda.requests[1];
    assert.equal(price.quantity, 6);
    assert.deepEqual(price.sourceMessageIds, ["i", "q", "n"]);
    const topic = plan.agenda.topics.find(item => item.id === price.topicId)!;
    assert.equal(topic.selectedCode, code);
    if (!code) {
      const answer = answerProductRequest(price, topic, products);
      assert.equal(answer.status, "NEEDS_CLARIFICATION");
      assert.match(answer.content, /la foto 1/);
      assert.doesNotMatch(answer.content, /90|75|stock/);
    }
  }
});

test("dos fotos en cinco mensajes conservan sus precios y referencias separados", () => {
  const plan = planRequests(emptyAgenda(), [
    { id: "i1", content: "", imageReference: { code: "A1", label: "la foto 1 de este grupo" } },
    { id: "q1", content: "precio de este" },
    { id: "i2", content: "", imageReference: { code: "P1", label: "la foto 2 de este grupo" } },
    { id: "q2", content: "precio de este" },
    { id: "p", content: "aceptan yape" },
  ], index);
  assert.deepEqual(plan.agenda.requests.map(job => job.kind), ["PRICE", "PRICE", "PAYMENT"]);
  assert.deepEqual(plan.agenda.requests.slice(0, 2).map(job => plan.agenda.topics.find(topic => topic.id === job.topicId)?.selectedCode), ["A1", "P1"]);
  assert.deepEqual(plan.agenda.requests.slice(0, 2).map(job => job.sourceMessageIds), [["i1", "q1"], ["i2", "q2"]]);
});
