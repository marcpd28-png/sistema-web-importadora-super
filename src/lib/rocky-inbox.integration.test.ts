import assert from "node:assert/strict";
import { beforeEach, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { processIncomingMessage } from "./messages-service";
import { RockyOutbox } from "./rocky-outbox";
import { RockyInbox } from "./rocky-inbox";
import { planRockyResponse, rockyInformationReply } from "./rocky-engine";
import { findCatalogProductIds, searchCatalogIdentity } from "./rocky-product-query";
import { answerShopAssistant } from "./shop-assistant";

const url = process.env.ROCKY_TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/rocky_phase2_integration" || process.env.DATABASE_URL !== url) {
  throw new Error("Both database variables must target disposable localhost rocky_phase2_integration");
}
const db = new PrismaClient({ datasourceUrl: url });
const recipient = "+15005550006";
let sends = 0;
const outbox = new RockyOutbox(db, async () => { sends++; return { messageId: randomUUID(), provider: "ycloud" }; }, () => {});

beforeEach(async () => {
  await db.chatContact.deleteMany();
  await db.product.deleteMany();
  await db.storeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: { botMasterSwitch: true } });
  sends = 0;
});
after(async () => { await db.$disconnect(); });

const receive = (content = "Hola", externalMessageId = randomUUID(), timestamp = new Date().toISOString()) => processIncomingMessage({ channel: "WHATSAPP", externalContactId: recipient, externalMessageId, phone: recipient, name: "Synthetic phase 3", metadata: { provider: "ycloud" }, content, type: "TEXT", timestamp }, { scheduleRocky: true });
const input = (conversationId: string) => db.rockyInboundTurn.findUniqueOrThrow({ where: { conversationId } });
const reply = (conversationId: string, content = "Respuesta") => outbox.enqueue({ conversationId, recipient, content, source: "synthetic-phase3" });
const due = async (worker: RockyInbox, id: string) => worker.tick((await input(id)).dueAt);
// Existing-conversation scenarios are evaluated after a previously delivered
// bot response. Remove only this fixture so assertions count new replies.
const establishedPlanner: typeof planRockyResponse = async (cid, mid, mids) => {
  const prior = await db.chatMessage.create({ data: { conversationId: cid, direction: "OUTBOUND", senderType: "BOT", content: "Previous welcome", status: "read", createdAt: new Date(Date.now() - 60_000) } });
  try { return await planRockyResponse(cid, mid, mids); }
  finally { await db.chatMessage.delete({ where: { id: prior.id } }); }
};

test("concurrent duplicate webhooks persist exactly one contact, chat, message and timer", async () => {
  const id = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => receive("Hola", id)));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal(await db.chatContact.count(), 1); assert.equal(await db.conversation.count(), 1);
  assert.equal(await db.chatMessage.count(), 1);
  assert.equal((await input(results[0].conversationId)).version, 1);
});

test("every new fragment moves the ten-second deadline; duplicates do not", async () => {
  const first = await receive(); const initial = await input(first.conversationId);
  const secondId = randomUUID(); await receive("Precio de televisores", secondId);
  const second = await input(first.conversationId);
  assert.equal(second.version, 2); assert.equal(second.messageIds.length, 2);
  assert.ok(second.dueAt.getTime() >= initial.dueAt.getTime());
  await receive("Precio de televisores", secondId);
  assert.equal((await input(first.conversationId)).dueAt.getTime(), second.dueAt.getTime());
  const worker = new RockyInbox(db, outbox, cid => reply(cid));
  assert.equal(await worker.tick(new Date(second.dueAt.getTime() - 1)), false);
  await worker.tick(second.dueAt);
  assert.equal(await db.rockyOutboundJob.count(), 1); assert.equal(sends, 0);
});

test("new concurrent fragments share one conversation and retain the complete batch", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => receive(`fragmento ${i}`)));
  assert.equal(new Set(results.map(r => r.conversationId)).size, 1);
  const turn = await input(results[0].conversationId);
  assert.equal(turn.version, 20); assert.equal(turn.messageIds.length, 20);
});

test("out-of-order provider timestamps cannot discard the most recently received fragment", async () => {
  const first = await receive();
  const second = await receive("Consulta", randomUUID(), new Date(Date.now() - 60_000).toISOString());
  const worker = new RockyInbox(db, outbox, cid => reply(cid));
  await due(worker, first.conversationId);
  assert.equal((await db.rockyOutboundJob.findFirst())?.triggerMessageId, second.messageId);
  await outbox.tick(); assert.equal(sends, 1);
});

test("restart during planning retries without publishing partial replies or sales state", async () => {
  const first = await receive(); let calls = 0;
  const plan = async (cid: string) => {
    calls++;
    await outbox.stageSalesStateWrite(tx => tx.conversationSalesState.create({ data: { conversationId: cid, stage: "AWAITING_PRODUCT_QUERY" } }));
    await reply(cid, "Primera");
    if (calls === 1) throw new Error("simulated crash");
    await reply(cid, "Segunda");
  };
  await due(new RockyInbox(db, outbox, plan), first.conversationId);
  assert.equal(await db.rockyOutboundJob.count(), 0); assert.equal(await db.conversationSalesState.count(), 0);
  await due(new RockyInbox(db, outbox, plan), first.conversationId);
  assert.equal(await db.rockyOutboundJob.count(), 2); assert.equal(await db.conversationSalesState.count(), 1);
  assert.equal((await input(first.conversationId)).state, "done");
  await outbox.tick(); await outbox.tick(); await outbox.tick(); assert.equal(sends, 2);
});

test("an abandoned running input is recovered after restart", async () => {
  const first = await receive();
  await db.rockyInboundTurn.update({ where: { conversationId: first.conversationId }, data: { state: "running", processingToken: "dead-worker", attempts: 1 } });
  await due(new RockyInbox(db, outbox, cid => reply(cid)), first.conversationId);
  assert.equal((await input(first.conversationId)).state, "done");
  assert.equal(await db.rockyOutboundJob.count(), 1);
});

test("a new fragment during planning fences off the entire old reply plan", async () => {
  const first = await receive();
  const worker = new RockyInbox(db, outbox, async cid => {
    await reply(cid, "Obsoleta");
    await receive("Consulta adicional");
  });
  await due(worker, first.conversationId);
  assert.equal(await db.rockyOutboundJob.count(), 0);
  const latest = await input(first.conversationId);
  assert.equal(latest.state, "pending"); assert.equal(latest.version, 2);
  await due(new RockyInbox(db, outbox, cid => reply(cid, "Completa")), first.conversationId);
  assert.equal((await db.chatMessage.findFirst({ where: { senderType: "BOT" } }))?.content, "Completa");
});

test("a lost claim token rolls back replies AND sales state at final publication", async () => {
  const first = await receive();
  await due(new RockyInbox(db, outbox, async cid => {
    await outbox.stageSalesStateWrite(tx => tx.conversationSalesState.create({ data: { conversationId: cid } }));
    await reply(cid);
    await db.rockyInboundTurn.update({ where: { conversationId: cid }, data: { processingToken: "replacement-worker" } });
  }), first.conversationId);
  assert.equal(await db.rockyOutboundJob.count(), 0); assert.equal(await db.conversationSalesState.count(), 0);
});

test("human intervention while planning discards the plan without overwriting ownership", async () => {
  const first = await receive();
  await due(new RockyInbox(db, outbox, async cid => {
    await reply(cid);
    await db.chatMessage.create({ data: { conversationId: cid, senderType: "AGENT", direction: "OUTBOUND", content: "Lo atiendo" } });
  }), first.conversationId);
  assert.equal(await db.rockyOutboundJob.count(), 0);
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).status, "ATENDIENDO");
});

test("global off/on does not revive an input received while the bot was disabled", async () => {
  await db.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const first = await receive();
  await db.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: true } });
  let calls = 0;
  const worker = new RockyInbox(db, outbox, async cid => { calls++; await reply(cid); });
  await due(worker, first.conversationId); assert.equal(calls, 0);
  await receive("Ahora sí"); await due(worker, first.conversationId); assert.equal(calls, 1);
});

test("three planning failures hand over once instead of an endless retry loop", async () => {
  const first = await receive(); let calls = 0;
  const worker = new RockyInbox(db, outbox, async () => { calls++; throw new Error("planner unavailable"); });
  await due(worker, first.conversationId); await due(worker, first.conversationId); await due(worker, first.conversationId);
  assert.equal(calls, 3); assert.equal((await input(first.conversationId)).state, "done");
  assert.equal((await db.rockyOutboundJob.findFirst())?.kind, "handoff");
  await outbox.tick(); assert.equal(sends, 1);
  await due(worker, first.conversationId); assert.equal(calls, 3);
});

test("expired backlog is handed to an advisor without sending an outdated reply", async () => {
  const first = await receive(); let calls = 0;
  await db.rockyInboundTurn.update({ where: { conversationId: first.conversationId }, data: { expiresAt: new Date(0) } });
  await due(new RockyInbox(db, outbox, async () => { calls++; }), first.conversationId);
  assert.equal(calls, 0); assert.equal(await db.rockyOutboundJob.count(), 0);
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).status, "REQUIERE_ASESOR");
});

test("two input workers cannot plan the same conversation concurrently", async () => {
  const first = await receive(); let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const active = new Promise<void>(resolve => { started = resolve; });
  const worker = new RockyInbox(db, outbox, async cid => { started(); await gate; await reply(cid); });
  const pending = due(worker, first.conversationId); await active;
  try { assert.equal(await due(new RockyInbox(db, outbox, cid => reply(cid)), first.conversationId), false); }
  finally { release(); }
  await pending; assert.equal(await db.rockyOutboundJob.count(), 1);
});

test("new input cancels unsent replies and retains the unanswered fragments", async () => {
  const first = await receive(); const worker = new RockyInbox(db, outbox, cid => reply(cid));
  await due(worker, first.conversationId);
  await receive("Precio de televisores");
  assert.equal((await db.rockyOutboundJob.findFirst())?.state, "cancelled");
  assert.equal((await input(first.conversationId)).messageIds.length, 2);
  await outbox.tick(); assert.equal(sends, 0);
});

test("a slow conversation does not block another customer's input", async () => {
  const first = await receive();
  const otherPhone = "+15005550007";
  const second = await processIncomingMessage({ channel: "WHATSAPP", externalContactId: otherPhone, externalMessageId: randomUUID(), phone: otherPhone, name: "Other synthetic customer", metadata: {}, content: "Hola", type: "TEXT", timestamp: new Date().toISOString() }, { scheduleRocky: true });
  let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const active = new Promise<void>(resolve => { started = resolve; });
  const pending = due(new RockyInbox(db, outbox, async cid => { started(); await gate; await reply(cid); }), first.conversationId);
  await active;
  try {
    const worker = new RockyInbox(db, outbox, cid => outbox.enqueue({ conversationId: cid, recipient: otherPhone, content: "Segunda conversación", source: "test" }));
    assert.equal(await due(worker, second.conversationId), true);
    assert.equal((await input(second.conversationId)).state, "done");
    assert.equal((await input(first.conversationId)).state, "running");
  } finally { release(); }
  await pending;
});

test("first greeting and catalog request receive only the new universal welcome", async () => {
  const first = await receive("Hola"); await receive("Me puede brindar su catálogo");
  await due(new RockyInbox(db, outbox, planRockyResponse), first.conversationId);
  const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /Bienvenido/);
  assert.match(replies[0].content, /https:\/\/mc.ht\/s\/rwQ7BMz/);
  assert.match(replies[0].content, /14 catálogos en PDF/);
  assert.match(replies[0].content, /incluidos domingos/);
  assert.doesNotMatch(replies[0].content, /9:00|Te derivé/);
});

test("established product-price requests hand off without product information", async () => {
  await db.product.create({ data: { code: "TEST-TV", slug: "phase3-test-tv", name: "TELEVISOR LED 32 PULGADAS", category: "televisor", unitPrice: 399, stockUnits: 5, imageUrl: "https://example.invalid/tv.jpg" } });
  const first = await receive("Hola"); await receive("Precio del televisor");
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /asesor/);
  assert.doesNotMatch(replies[0].content, /399|Precio unitario/);
});

test("repeated greeting fragments produce one welcome, not a handoff", async () => {
  const first = await receive("Ola"); await receive("Buen día");
  await due(new RockyInbox(db, outbox, planRockyResponse), first.conversationId);
  const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(replies.length, 1); assert.match(replies[0].content, /Bienvenido/);
});

for (const content of ["Precio del televisor", "imagen recibido", "cualquier cosa", "solicito asesor"]) {
  test(`first message receives only welcome after debounce: ${content}`, async () => {
    const first = await receive(content);
    const worker = new RockyInbox(db, outbox, planRockyResponse);
    assert.equal(await worker.tick(new Date((await input(first.conversationId)).dueAt.getTime() - 1)), false);
    assert.equal(await db.chatMessage.count({ where: { senderType: "BOT" } }), 0);
    await due(worker, first.conversationId);
    const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
    assert.equal(replies.length, 1);
    assert.match(replies[0].content, /TODOS NUESTROS PRODUCTOS Y CATÁLOGOS/);
    assert.match(replies[0].content, /¿Es para Lima o provincia/);
    assert.match(replies[0].content, /¿Deseas comprar por unidad o por mayor/);
    await due(worker, first.conversationId);
    assert.equal(await db.chatMessage.count({ where: { senderType: "BOT" } }), 1);
  });
}

test("welcome is not repeated on the next customer greeting", async () => {
  const first = await receive("Hola");
  const worker = new RockyInbox(db, outbox, planRockyResponse);
  await due(worker, first.conversationId);
  await outbox.tick();
  await receive("Hola de nuevo");
  await due(worker, first.conversationId);
  assert.equal(await db.chatMessage.count({ where: { senderType: "BOT", content: { contains: "14 catálogos en PDF" } } }), 1);
});

test("database retrieval preserves numeric models, stock, price and device identity", async () => {
  const rows = [
    ["PHONE15", "CELULAR IPHONE 15", 5, 999], ["PHONE14", "CELULAR IPHONE 14", 5, 899],
    ["CASE15", "FUNDA IPHONE 15", 100, 19], ["ZERO15", "IPHONE 15", 0, 999],
    ["FREE15", "IPHONE 15", 5, 0], ["ICE", "MÁQUINA DE HIELO", 5, 399],
    ["HAIR", "MÁQUINA CORTADORA DE CABELLO", 5, 29],
  ] as const;
  for (const [code, name, stockUnits, unitPrice] of rows) await db.product.create({ data: { code, slug: code.toLowerCase(), name, stockUnits, unitPrice } });
  const ids = await findCatalogProductIds("iphone 15 precio");
  assert.deepEqual((await db.product.findMany({ where: { id: { in: ids } } })).map(p => p.code), ["PHONE15"]);
  const identity = await searchCatalogIdentity("iphone 15 precio");
  assert.deepEqual((await db.product.findMany({ where: { id: { in: identity.unavailableIds } }, orderBy: { code: "asc" } })).map(p => p.code), ["FREE15", "ZERO15"]);
  const ice = await findCatalogProductIds("maquinade hielo");
  assert.deepEqual((await db.product.findMany({ where: { id: { in: ice } } })).map(p => p.code), ["ICE"]);
});

test("general spelling repair reaches actual product replies without changing dimensions", async () => {
  await db.product.create({ data: { code: "BLENDER", slug: "blender", name: "LICUADORA 2 LITROS", stockUnits: 3, unitPrice: 89 } });
  const reply = await answerShopAssistant({ message: "Todavía tienen a la venta licudora" });
  assert.deepEqual(reply.products?.map(product => product.code), ["BLENDER"]);
  await db.product.create({ data: { code: "TABLET", slug: "tablet", name: 'TABLET 10" 32GB', stockUnits: 3, unitPrice: 89 } });
  assert.deepEqual(await findCatalogProductIds("tablet de 32 pulgadas"), []);
});

test("product enquiries never call a model even with interpretation enabled", async () => {
  const oldFetch = globalThis.fetch;
  const enabled = process.env.ROCKY_QUERY_INTERPRETATION_ENABLED;
  process.env.ROCKY_QUERY_INTERPRETATION_ENABLED = "true";
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Network forbidden"); };
  try {
    const first = await receive("aparato para mezclar frutas");
    await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
    assert.equal(calls, 0);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).status, "REQUIERE_ASESOR");
  } finally {
    globalThis.fetch = oldFetch;
    if (enabled === undefined) delete process.env.ROCKY_QUERY_INTERPRETATION_ENABLED; else process.env.ROCKY_QUERY_INTERPRETATION_ENABLED = enabled;
  }
});

test("matching a category never discards a requested brand or screen size", async () => {
  const category = await db.category.upsert({ where: { slug: "phase4-televisor" }, create: { name: "Televisor", slug: "phase4-televisor" }, update: {} });
  for (const [code, name] of [["TV32", "TELEVISOR SAMSUNG 32"], ["TV43", "TELEVISOR SAMSUNG 43"], ["LG43", "TELEVISOR LG 43"]]) {
    await db.product.create({ data: { code, slug: code.toLowerCase(), name, categoryId: category.id, unitPrice: 399, stockUnits: 5 } });
  }
  const reply = await answerShopAssistant({ message: "precio televisor samsung 43" });
  assert.deepEqual(reply.products?.map(p => p.code), ["TV43"]);
});

test("informal TV enquiry goes to an advisor, never an automated quote", async () => {
  await db.product.create({ data: { code: "TV", slug: "tv", name: "TELEVISOR 32", unitPrice: 399, stockUnits: 5 } });
  const first = await receive("muy buen día habrá tv");
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /asesor/);
  assert.doesNotMatch(replies[0].content, /399|Precio unitario/);
});

test("a miss sends only a controlled advisor handoff, never a fabricated search link", async () => {
  const first = await receive("iphone 15 precio");
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(replies.length, 1); assert.match(replies[0].content, /asesor/);
  assert.doesNotMatch(replies[0].content, /no encontr|no pude|https?:/);
});

test("a pending delivery question cannot swallow a location or price question", async () => {
  const first = await receive("Donde estan ubicados");
  await db.conversationSalesState.create({ data: { conversationId: first.conversationId, stage: "AWAITING_DELIVERY_DETAILS", deliveryData: { awaitingLimaAddress: true } } });
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(replies.length, 1); assert.match(replies[0].content, /Abancay/);
  const state = await db.conversationSalesState.findUniqueOrThrow({ where: { conversationId: first.conversationId } });
  assert.equal(state.stage, "AWAITING_DELIVERY_DETAILS");
  assert.equal((state.deliveryData as Record<string, unknown>).limaAddress, undefined);
});

test("quantity follow-up with old sales memory no longer calculates a quote", async () => {
  await db.product.create({ data: { code: "TEST-QUOTE", slug: "test-quote", name: "Televisor", unitPrice: 100, wholesalePrice: 90, wholesaleMinQty: 3, stockUnits: 10 } });
  const first = await receive("3 unidades");
  await db.conversationSalesState.create({ data: { conversationId: first.conversationId, stage: "AWAITING_QUANTITY", selectedProductCode: "TEST-QUOTE", unitPrice: 1 } });
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  const state = await db.conversationSalesState.findUniqueOrThrow({ where: { conversationId: first.conversationId } });
  assert.equal(state.total, null); assert.equal(Number(state.unitPrice), 1);
  assert.ok((await db.chatMessage.findMany({ where: { senderType: "BOT" } })).every(reply => !reply.content.includes("270.00")));
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).status, "REQUIERE_ASESOR");
});

test("unavailable quantity hands off instead of quoting stale stock", async () => {
  await db.product.create({ data: { code: "LOW", slug: "low", name: "Televisor", unitPrice: 100, stockUnits: 1 } });
  const first = await receive("3 unidades");
  await db.conversationSalesState.create({ data: { conversationId: first.conversationId, stage: "AWAITING_QUANTITY", selectedProductCode: "LOW", unitPrice: 100 } });
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).status, "REQUIERE_ASESOR");
  assert.equal(await db.chatMessage.count({ where: { senderType: "BOT" } }), 1);
});

test("a new product model and quantity never quote the previously selected model", async () => {
  await db.product.create({ data: { code: "OLD", slug: "old", name: "Televisor", unitPrice: 100, stockUnits: 10 } });
  const first = await receive("iphone 15, 3 unidades");
  await db.conversationSalesState.create({ data: { conversationId: first.conversationId, stage: "AWAITING_QUANTITY", selectedProductCode: "OLD", unitPrice: 100 } });
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  assert.ok((await db.chatMessage.findMany({ where: { senderType: "BOT" } })).every(reply => !reply.content.includes("300.00")));
});

test("simulator runs the same engine but can never create a provider job", async () => {
  const first = await processIncomingMessage({ channel: "WHATSAPP", content: "Ola", externalContactId: "SIMULATOR:phase7", externalMessageId: randomUUID(), phone: recipient, name: "Simulation", type: "TEXT", timestamp: new Date().toISOString(), metadata: {} });
  await outbox.runSimulation(first.conversationId, first.messageId, () => planRockyResponse(first.conversationId, first.messageId));
  assert.equal(await db.rockyOutboundJob.count(), 0); assert.equal(sends, 0);
  const messages = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(messages.length, 1); assert.equal(messages[0].status, "simulated");
  assert.match(messages[0].content, /Bienvenido/);
});

test("simulation sink rejects a real customer conversation", async () => {
  const first = await receive("Hola");
  await assert.rejects(outbox.runSimulation(first.conversationId, first.messageId, () => planRockyResponse(first.conversationId, first.messageId)));
  assert.equal(await db.chatMessage.count({ where: { senderType: "BOT" } }), 0);
});

test("general links stay automated without offering a product search", async () => {
  const first = await receive("envíame el link");
  await due(new RockyInbox(db, outbox, establishedPlanner), first.conversationId);
  const replies = await db.chatMessage.findMany({ where: { senderType: "BOT" } });
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /https:\/\/mc.ht\/s\/rwQ7BMz/);
  assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).status, "AUTOMATICO");
});

test("public assistant stays informational for products, quotes and previous codes", () => {
  for (const query of ["iphone 15 precio", "3 unidades", "N1434", "recomienda televisor", "stock tablet"]) {
    assert.match(rockyInformationReply(query), /asesor/);
    assert.doesNotMatch(rockyInformationReply(query), /S\/|Precio unitario|Disponibilidad:/);
  }
  assert.match(rockyInformationReply("catálogo televisores"), /mc.ht/);
  assert.match(rockyInformationReply("horarios"), /incluidos domingos/);
});
