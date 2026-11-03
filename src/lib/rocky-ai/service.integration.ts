import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { RockyAiCatalogWorker } from "./catalog-worker";
import { approveDraft, configureConversation, dispatchDraft, emergencyStop, generateDraft, pauseForHuman, saveSettings, settings, workerTick } from "./service";
import { officialPaymentImagePath, targetKey } from "./policy";
import { buildPublicUrl } from "../site-url";
import { receiveTelegramEvent } from "../telegram-events";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.pathname !== "/rocky_ai_test" || process.env.ROCKY_AI_TEST_DATABASE_URL !== process.env.DATABASE_URL) {
  throw new Error("Integration tests require an explicitly disposable localhost rocky_ai_test database");
}
const originalFetch = global.fetch;
let sends = 0, calls = 0, failDelivery = false;
let ycloudPayloads: Record<string, unknown>[] = [];
let telegramPayloads: Record<string, unknown>[] = [];
let telegramControlPayloads: Record<string, unknown>[] = [];
let openAiPayloads: Record<string, unknown>[] = [];
let openAiDecision: Record<string, unknown>;
let messengerMock: ((url: string, init?: RequestInit) => Response | Promise<Response>) | null = null;
let duringGeneration: (() => Promise<void>) | null = null;
let duringTelegramControl: (() => Promise<void>) | null = null;
const greeting = { intent: "greeting", productIds: [], quantity: 1, priceMode: null, policyKey: "none", reason: "routine", catalog: null };
const clarification = { intent: "clarify", productIds: [], quantity: 1, priceMode: null, policyKey: "none", reason: "ambiguous", catalog: null };
const catalogDecision = { intent: "catalog", productIds: [], quantity: 1, priceMode: null, policyKey: "none", reason: "routine", catalog: {
  state: "ready", scopeKey: "parlantes:jbl", title: "CATÁLOGO DE PARLANTES JBL", productCount: 1, message: null,
} };
const catalogSnapshot = {
  version: 1, scopeKey: "parlantes:jbl", title: "CATÁLOGO DE PARLANTES JBL", capturedAt: new Date().toISOString(), products: [{
    id: "p1", name: "Parlante JBL", code: "JBL-1", brand: "JBL", category: "parlantes", imageUrls: ["/uploads/products/jbl.jpg"],
    updatedAt: new Date().toISOString(), unitPrice: "100", wholesalePrice: null, wholesaleMinQty: 3,
  }],
};
beforeEach(async () => {
  await prisma.rockyAiDraft.deleteMany();
  await prisma.rockyAiConversation.deleteMany();
  await prisma.rockyAiUsage.deleteMany();
  await prisma.rockyAiAudit.deleteMany();
  await prisma.telegramInboxEvent.deleteMany();
  await prisma.chatContact.deleteMany();
  await prisma.rockyAiSettings.deleteMany();
  await prisma.storeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: { botMasterSwitch: true } });
  await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: { enabled: true, dailyTokens: 1000000 } });
  process.env.OPENAI_API_KEY = "synthetic-not-real";
  process.env.YCLOUD_API_KEY = "synthetic-not-real";
  process.env.YCLOUD_WHATSAPP_FROM = "+15005550006";
  process.env.TELEGRAM_BRIDGE_URL = "http://telegram-bridge-rocky-ai.test";
  process.env.TELEGRAM_BRIDGE_SECRET = "t".repeat(40);
  process.env.TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE = "true";
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "false";
  process.env.MESSENGER_SUPER_BOT_ALLOW_STORE_UNMANAGED = "false";
  process.env.SOCIAL_INBOX_API_URL = "http://social-inbox-rocky-ai.test";
  delete process.env.SOCIAL_INBOX_API_TOKEN;
  delete process.env.MESSENGER_CONTROL_TOKEN;
  sends = 0; calls = 0; failDelivery = false; duringGeneration = null; duringTelegramControl = null; ycloudPayloads = []; telegramPayloads = []; telegramControlPayloads = []; openAiPayloads = []; openAiDecision = greeting; messengerMock = null;
  global.fetch = async (input, init) => {
    const url = String(input);
    if (messengerMock && (url.startsWith("http://social-inbox-rocky-ai.test/") || url.startsWith("http://127.0.0.1:19120/"))) return messengerMock(url, init);
    if (url === "https://api.openai.com/v1/responses") {
      calls++;
      openAiPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (duringGeneration) { const hook = duringGeneration; duringGeneration = null; await hook(); }
      return Response.json({ status: "completed", usage: { input_tokens: 50, output_tokens: 30 },
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(openAiDecision) }] }] });
    }
    if (url === "https://api.ycloud.com/v2/whatsapp/messages") {
      ycloudPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      sends++; if (failDelivery) throw new Error("ambiguous network timeout");
      return Response.json({ id: `provider-${randomUUID()}` });
    }
    if (url === "http://telegram-bridge-rocky-ai.test/inbox/status") {
      return Response.json({ connected: true, capabilities: { superBotSendV1: true, superBotControlV1: true } });
    }
    if (url === "http://telegram-bridge-rocky-ai.test/inbox/control") {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      telegramControlPayloads.push(payload);
      if (duringTelegramControl) { const hook = duringTelegramControl; duringTelegramControl = null; await hook(); }
      return Response.json({ revision: 7, sender: "BOT", protocol: "super-bot-v1" });
    }
    if (url === "http://telegram-bridge-rocky-ai.test/inbox/send") {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      telegramPayloads.push(payload);
      return Response.json({ messageId: 701, revision: 8, sender: "BOT", protocol: "super-bot-v1" });
    }
    throw new Error(`Network denied by test: ${url.split("?")[0]}`);
  };
});
after(async () => { global.fetch = originalFetch; await prisma.$disconnect(); });
async function fixture(mode: "AUTO" | "HYBRID" | "COPILOT" = "COPILOT") {
  const contact = await prisma.chatContact.create({ data: { name: "Cliente de prueba", channel: "WHATSAPP", phone: "+15005550006", externalId: randomUUID() } });
  const c = await prisma.conversation.create({ data: { contactId: contact.id, channel: "WHATSAPP" } });
  await prisma.chatMessage.create({ data: { conversationId: c.id, direction: "INBOUND", senderType: "CUSTOMER", content: "Hola",
    createdAt: new Date(Date.now() - 30000) } });
  await configureConversation("whatsapp", c.id, mode, mode === "COPILOT", "test-admin");
  return { id: targetKey("whatsapp", c.id), externalId: c.id };
}
async function inbound(externalId: string, content = "Hola de nuevo") {
  await prisma.chatMessage.create({ data: { conversationId: externalId, direction: "INBOUND", senderType: "CUSTOMER", content, createdAt: new Date(Date.now() - 1000) } });
}
function telegramInbound(content = "Hola") {
  return {
    eventId: randomUUID(), kind: "message" as const, connectionId: "telegram-test", chatId: "12345", messageId: Math.floor(Math.random() * 1_000_000) + 1,
    sender: "CUSTOMER" as const, type: "TEXT" as const, content, name: "Cliente Telegram", timestamp: Math.floor((Date.now() - 15_000) / 1000),
  };
}

function installMessengerMock(options: {
  botEnabled?: boolean;
  owner?: "meta" | "store" | "other" | "unknown";
  mode?: "manual" | "bot" | "meta" | "unmanaged";
  assignedUserId?: string | null;
  inboundAt?: string;
  outboundAfterInbound?: boolean;
} = {}) {
  const conversationId = "9001";
  const inboxId = "messenger-contact-inbox";
  const outboundInboxId = "messenger-inbox";
  let botEnabled = options.botEnabled ?? true;
  let owner = options.owner ?? "meta";
  let mode: "manual" | "bot" | "meta" | "unmanaged" = options.mode ?? (owner === "meta" ? "meta" : "manual");
  let assignedUserId = options.assignedUserId ?? null;
  const inboundAt = options.inboundAt ?? new Date(Date.now() - 15_000).toISOString();
  const messages: Record<string, unknown>[] = [{
    id: "messenger-inbound-1", text: "Necesito ayuda con un producto", createdAt: inboundAt,
    contactInboxId: inboxId, messageType: "incoming", deletedAt: null, sendError: null, senderType: "user", sourceId: "messenger-inbound-1",
  }];
  if (options.outboundAfterInbound) {
    messages.push({ id: "messenger-adviser-1", text: "Un asesor ya respondió.", createdAt: new Date(Date.now() - 1_000).toISOString(),
      contactInboxId: inboxId, messageType: "outgoing", deletedAt: null, sendError: null, senderType: "agent", sourceId: "messenger-adviser-1" });
  }
  const controllerActions: Record<string, unknown>[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const conversation = () => ({
    id: conversationId, botEnabled, contact: { fullName: "Cliente Messenger" },
    ...(assignedUserId ? { assignedUserId } : {}),
    contactInboxes: [{ id: inboxId, inboxId: outboundInboxId, channel: "messenger", lastIncomingMessageAt: inboundAt, inbox: { name: "Messenger" } }],
  });
  messengerMock = async (url, init) => {
    const target = new URL(url);
    if (target.origin === "http://127.0.0.1:19120") {
      if ((init?.method || "GET") === "POST") {
        const input = JSON.parse(String(init?.body ?? "")) as Record<string, unknown>;
        controllerActions.push(input);
        if (input.action !== "manual") return Response.json({ error: "unexpected action" }, { status: 400 });
        owner = "store";
        mode = "manual";
        botEnabled = false;
        // Meta's ownership notification is an outgoing provider event, not an
        // adviser response. The adapter must omit it from AI history.
        messages.push({ id: `meta-handover-${controllerActions.length}`, text: "You took over this chat from your AI agent.", createdAt: new Date().toISOString(),
          contactInboxId: inboxId, messageType: "outgoing", deletedAt: null, sendError: null, senderType: "api", sourceId: `meta-handover-${controllerActions.length}` });
      }
      return Response.json({ owner, botEnabled, mode, resumeAt: null, resumeTarget: null, error: null, metaAiAvailable: true, ownerVerified: true });
    }
    if (target.pathname === `/v1/conversations/${conversationId}`) return Response.json({ data: conversation() });
    if (target.pathname === "/v1/conversations") return Response.json({ data: [conversation()], nextCursor: null });
    if (target.pathname === `/v1/conversations/${conversationId}/disable-bot`) {
      botEnabled = false;
      return Response.json({ success: true });
    }
    if (target.pathname === `/v1/conversations/${conversationId}/messages`) {
      if ((init?.method || "GET") === "POST") {
        const payload = JSON.parse(String(init?.body ?? "")) as Record<string, unknown>;
        deliveries.push(payload);
        messages.push({ id: `messenger-outbound-${deliveries.length}`, text: payload.text, createdAt: new Date().toISOString(),
          contactInboxId: inboxId, messageType: "outgoing", deletedAt: null, sendError: null, senderType: "api", sourceId: `super-bot-${deliveries.length}` });
        return Response.json({ id: `messenger-outbound-${deliveries.length}`, text: payload.text, createdAt: new Date().toISOString(), contactInboxId: inboxId, messageType: "outgoing", deletedAt: null, sendError: null });
      }
      return Response.json({ data: messages, nextCursor: null });
    }
    throw new Error(`Unexpected Messenger test URL: ${url}`);
  };
  return {
    conversationId, inboundAt, controllerActions, deliveries,
    get botEnabled() { return botEnabled; },
    assignHuman(id = "advisor-after-claim") { assignedUserId = id; },
  };
}
test("Copilot persists a draft without sending; concurrent approvals and dispatch send only once", async () => {
  const c = await fixture(); const d = await generateDraft(c.id, "test-admin", true);
  assert.ok(d); assert.equal(d.state, "DRAFT"); assert.equal(sends, 0);
  assert.match(d.text, /Soy Super Bot, el asistente virtual de Importaciones Super/);
  await Promise.allSettled([approveDraft(d.id, d.text, "admin"), approveDraft(d.id, d.text, "admin")]);
  await Promise.all([dispatchDraft(d.id), dispatchDraft(d.id)]);
  assert.equal(sends, 1); assert.equal((await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: d.id } })).state, "SUBMITTED");
});
test("approved payment responses send the official notice as a single image", async () => {
  const c = await fixture();
  const d = (await generateDraft(c.id, "test-admin", true))!;
  const paymentDecision = { intent: "policy", productIds: [], quantity: 1, priceMode: null, policyKey: "payment", reason: "routine", catalog: null };
  const caption = "Te comparto nuestras cuentas oficiales. Envía tu comprobante; un asesor lo valida antes del despacho.";
  await prisma.rockyAiDraft.update({ where: { id: d.id }, data: { decision: paymentDecision, evidence: [], text: caption } });
  await approveDraft(d.id, caption, "admin");
  await dispatchDraft(d.id);
  assert.equal(sends, 1);
  assert.deepEqual(ycloudPayloads[0].image, { link: buildPublicUrl(officialPaymentImagePath), caption });
  const sent = await prisma.chatMessage.findUniqueOrThrow({ where: { id: `ai:${d.id}` } });
  assert.equal(sent.messageType, "IMAGE");
  assert.equal(sent.mediaUrl, buildPublicUrl(officialPaymentImagePath));
});
test("catalog PDF waits for the acknowledged draft before rendering and delivering", async () => {
  const c = await fixture();
  const d = (await generateDraft(c.id, "test-admin", true))!;
  await prisma.rockyAiDraft.update({ where: { id: d.id }, data: { decision: catalogDecision, evidence: [], text: "Estoy preparando el catálogo." } });
  await prisma.rockyAiCatalogJob.create({ data: {
    draftId: d.id, conversationId: c.id, triggerId: d.triggerId, controlRevision: d.controlRevision, settingsRevision: d.settingsRevision,
    scopeKey: "parlantes:jbl", title: "CATÁLOGO DE PARLANTES JBL", snapshot: catalogSnapshot, snapshotHash: "a".repeat(32), state: "WAITING_ACK",
  } });
  const worker = new RockyAiCatalogWorker(prisma, async () => [{
    absoluteUrl: "https://tiendavirtualsuper.com/uploads/catalogs/catalogo-jbl.pdf", relativeUrl: "/uploads/catalogs/catalogo-jbl.pdf",
    filename: "catalogo-jbl.pdf", partNumber: 1, partCount: 1, productCount: 1, missingImageCount: 0, byteLength: 100,
  }]);
  await worker.tick();
  assert.equal((await prisma.rockyAiCatalogJob.findUniqueOrThrow({ where: { draftId: d.id } })).state, "WAITING_ACK");
  await approveDraft(d.id, "Estoy preparando el catálogo.", "admin");
  await dispatchDraft(d.id);
  assert.equal((await prisma.rockyAiCatalogJob.findUniqueOrThrow({ where: { draftId: d.id } })).state, "QUEUED");
  await worker.tick();
  assert.equal((await prisma.rockyAiCatalogJob.findUniqueOrThrow({ where: { draftId: d.id } })).state, "READY");
  await worker.tick();
  const submittedJob = await prisma.rockyAiCatalogJob.findUniqueOrThrow({ where: { draftId: d.id } });
  assert.equal(submittedJob.state, "SUBMITTED");
  const submittedDelivery = await prisma.rockyAiCatalogDelivery.findUniqueOrThrow({ where: { jobId_partNumber: { jobId: submittedJob.id, partNumber: 1 } } });
  assert.equal(submittedDelivery.state, "SUBMITTED");
  assert.equal(sends, 2);
});
test("an interrupted catalog document is marked uncertain and never retried", async () => {
  const c = await fixture();
  const d = (await generateDraft(c.id, "test-admin", true))!;
  await prisma.rockyAiDraft.update({ where: { id: d.id }, data: { state: "SUBMITTED", approvedBy: "admin", decision: catalogDecision, evidence: [] } });
  const job = await prisma.rockyAiCatalogJob.create({ data: {
    draftId: d.id, conversationId: c.id, triggerId: d.triggerId, controlRevision: d.controlRevision, settingsRevision: d.settingsRevision,
    scopeKey: "parlantes:jbl", title: "CATÁLOGO DE PARLANTES JBL", snapshot: catalogSnapshot, snapshotHash: "b".repeat(32),
    state: "DELIVERING", result: { version: 1 }, processingToken: "stale", leaseExpiresAt: new Date(Date.now() - 1_000),
  } });
  await prisma.rockyAiCatalogDelivery.create({ data: {
    jobId: job.id, partNumber: 1, documentUrl: "https://tiendavirtualsuper.com/uploads/catalogs/catalogo-jbl.pdf",
    relativeUrl: "/uploads/catalogs/catalogo-jbl.pdf", filename: "catalogo-jbl.pdf", byteLength: 100, productCount: 1, state: "SENDING",
  } });
  await new RockyAiCatalogWorker(prisma).tick();
  assert.equal((await prisma.rockyAiCatalogJob.findUniqueOrThrow({ where: { id: job.id } })).state, "UNCERTAIN");
  assert.equal(sends, 0);
});
test("a new inbound message atomically expires pending approvals", async () => {
  const c = await fixture(); const d = (await generateDraft(c.id, "test-admin", true))!;
  await inbound(c.externalId);
  assert.equal((await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: d.id } })).state, "EXPIRED");
  await assert.rejects(approveDraft(d.id, d.text, "admin"), /DRAFT_EXPIRED/);
  await dispatchDraft(d.id); assert.equal(sends, 0);
});
test("human takeover after approval invalidates the queue", async () => {
  const c = await fixture(); const d = (await generateDraft(c.id, "test-admin", true))!;
  await approveDraft(d.id, d.text, "admin");
  await pauseForHuman("whatsapp", c.externalId, "seller");
  await dispatchDraft(d.id); assert.equal(sends, 0);
});
test("new inbound during inference cannot publish a stale draft", async () => {
  const c = await fixture(); duringGeneration = () => inbound(c.externalId);
  await assert.rejects(generateDraft(c.id, "admin", true), /CONTEXT_CHANGED/);
  assert.equal(await prisma.rockyAiDraft.count(), 0);
});
test("emergency stop blocks approved messages and generation", async () => {
  const c = await fixture(); const d = (await generateDraft(c.id, "admin", true))!;
  await approveDraft(d.id, d.text, "admin"); await emergencyStop("admin"); await dispatchDraft(d.id);
  assert.equal(sends, 0);
  await assert.rejects(generateDraft(c.id, "admin", true), /DISABLED/);
});
test("ambiguous delivery remains uncertain and is never automatically retried", async () => {
  const c = await fixture(); const d = (await generateDraft(c.id, "admin", true))!;
  await approveDraft(d.id, d.text, "admin"); failDelivery = true;
  await dispatchDraft(d.id); await dispatchDraft(d.id);
  assert.equal(sends, 1);
  assert.equal((await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: d.id } })).state, "UNCERTAIN");
  assert.equal((await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id: c.id } })).humanControl, true);
});
test("automatic mode queues a fresh safe turn but never replies twice to the same inbound", async () => {
  const c = await fixture("AUTO"); await prisma.rockyAiConversation.update({ where: { id: c.id }, data: { lastTrigger: null } });
  const d = await generateDraft(c.id, "worker"); assert.ok(d); assert.equal(d.state, "QUEUED");
  assert.equal(await generateDraft(c.id, "worker"), null);
  await dispatchDraft(d.id); assert.equal(sends, 1);
});
test("Telegram AUTO is independent from paused WhatsApp and keeps bot ownership after reply", async () => {
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const initial = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    channelDefaults: { ...(initial.channelDefaults as Record<string, string>), telegram: "AUTO" },
  } });

  const received = await receiveTelegramEvent(telegramInbound());
  assert.ok(received.conversationId);
  const id = targetKey("telegram", received.conversationId!);
  const ai = await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id } });
  assert.equal(ai.mode, "AUTO");
  assert.equal(ai.humanControl, false);
  assert.equal(ai.lastTrigger, null);
  assert.deepEqual(telegramControlPayloads, [{
    connectionId: "telegram-test", chatId: "12345", expectedRevision: 0, botEnabled: false, sender: "BOT", protocol: "super-bot-v1",
  }]);
  await receiveTelegramEvent({
    eventId: randomUUID(), kind: "control", connectionId: "telegram-test", chatId: "12345",
    sender: "BOT", protocol: "super-bot-v1", timestamp: Math.floor(Date.now() / 1000),
    revision: 8, botEnabled: false,
  });

  const local = await prisma.conversation.findUniqueOrThrow({ where: { id: received.conversationId! } });
  assert.equal(local.botEnabled, false);
  assert.equal(local.status, "AUTOMATICO");
  assert.equal(local.assignedUserId, null);

  await workerTick();
  assert.equal(calls, 1);
  assert.equal(telegramPayloads.length, 1);
  assert.equal(telegramPayloads[0].connectionId, "telegram-test");
  assert.equal(telegramPayloads[0].chatId, "12345");
  assert.match(String(telegramPayloads[0].requestId), /^ai:/);
  assert.equal(telegramPayloads[0].sender, "BOT");
  assert.equal(telegramPayloads[0].protocol, "super-bot-v1");
  const draft = await prisma.rockyAiDraft.findFirstOrThrow({ where: { conversationId: id } });
  assert.equal(draft.state, "SUBMITTED");
  const afterReply = await prisma.conversation.findUniqueOrThrow({ where: { id: received.conversationId! } });
  assert.equal(afterReply.assignedUserId, null);
  assert.equal(afterReply.status, "AUTOMATICO");
  assert.equal(afterReply.botEnabled, false);
  assert.equal(await prisma.chatMessage.count({ where: { conversationId: received.conversationId!, senderType: "BOT" } }), 1);

  const localMessageId = String(telegramPayloads[0].requestId);
  await receiveTelegramEvent({
    eventId: randomUUID(), kind: "message", connectionId: "telegram-test", chatId: "12345", messageId: 702,
    sender: "BOT", type: "TEXT", content: "¿Qué producto buscas hoy?", timestamp: Math.floor(Date.now() / 1000), localMessageId,
  });
  assert.equal(await prisma.chatMessage.count({ where: { conversationId: received.conversationId!, senderType: "BOT" } }), 1);
  const echoed = await prisma.chatMessage.findUniqueOrThrow({ where: { id: localMessageId } });
  assert.equal(echoed.status, "sent");
  const afterEcho = await prisma.conversation.findUniqueOrThrow({ where: { id: received.conversationId! } });
  assert.equal(afterEcho.assignedUserId, null);
  assert.equal(afterEcho.status, "AUTOMATICO");
  assert.equal(afterEcho.botEnabled, false);
});
test("the worker recovers an existing Telegram chat from its post-enable inbound turn", async () => {
  const contact = await prisma.chatContact.create({ data: {
    name: "Cliente Telegram existente", channel: "TELEGRAM", externalId: `tg-existing-${randomUUID()}`,
  } });
  const createdAt = new Date(Date.now() - 60_000);
  const inboundAt = new Date(Date.now() - 2_000);
  const conversation = await prisma.conversation.create({ data: {
    contactId: contact.id, channel: "TELEGRAM", telegramConnectionId: "telegram-test", telegramChatId: "445566",
    createdAt, lastMessageAt: inboundAt, telegramLastInboundAt: inboundAt,
  } });
  await prisma.chatMessage.create({ data: {
    conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", content: "Hola", createdAt: inboundAt,
  } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true, defaultsSince: new Date(Date.now() - 10_000),
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), telegram: "AUTO" },
  } });
  await workerTick();
  const ai = await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id: targetKey("telegram", conversation.id) } });
  assert.equal(ai.mode, "AUTO");
  assert.equal(ai.humanControl, false);
});
test("an adviser takeover racing the Telegram BOT claim prevents Super Bot ownership and delivery", async () => {
  const adviser = await prisma.user.create({ data: {
    email: `adviser-${randomUUID()}@example.invalid`, name: "Asesor de prueba", passwordHash: "unused", role: "ASESOR",
  } });
  const contact = await prisma.chatContact.create({ data: {
    name: "Cliente Telegram", channel: "TELEGRAM", externalId: `tg-race-${randomUUID()}`,
  } });
  const conversation = await prisma.conversation.create({ data: {
    contactId: contact.id, channel: "TELEGRAM", telegramConnectionId: "telegram-test", telegramChatId: "778899",
  } });
  const inboundAt = new Date(Date.now() - 5_000);
  await prisma.chatMessage.create({ data: {
    conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", content: "Hola", createdAt: inboundAt,
  } });
  await prisma.conversation.update({ where: { id: conversation.id }, data: {
    lastMessageAt: inboundAt, telegramLastInboundAt: inboundAt,
  } });
  duringTelegramControl = async () => {
    await prisma.conversation.update({ where: { id: conversation.id }, data: {
      botEnabled: false, status: "ATENDIENDO", assignedUserId: adviser.id,
    } });
  };
  await assert.rejects(configureConversation("telegram", conversation.id, "AUTO", false, "telegram_inbound"), /CONTROL_CHANGED/);
  const local = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
  assert.equal(local.assignedUserId, adviser.id);
  assert.equal(local.status, "ATENDIENDO");
  assert.equal(telegramPayloads.length, 0);
  const ai = await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id: targetKey("telegram", conversation.id) } });
  assert.equal(ai.mode, "OFF");
  assert.equal(ai.humanControl, true);
});
test("human requests become review drafts and pause autonomy without calling OpenAI", async () => {
  const c = await fixture("AUTO");
  await inbound(c.externalId, "Quiero un asesor");
  const d = await generateDraft(c.id, "admin", true);
  assert.equal(d?.state, "DRAFT"); assert.equal(calls, 0); assert.equal(sends, 0);
  assert.equal((await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id: c.id } })).humanControl, true);
});
test("missing OpenAI credentials permits control and settings but no inference", async () => {
  const c = await fixture(); delete process.env.OPENAI_API_KEY;
  await assert.rejects(generateDraft(c.id, "admin", true), /NOT_CONFIGURED/);
  await workerTick(); assert.equal(calls, 0); assert.equal(sends, 0);
});
test("daily budget is reserved transactionally before requesting OpenAI", async () => {
  const c = await fixture();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: { dailyRequests: 1 } });
  await generateDraft(c.id, "admin", true);
  await assert.rejects(generateDraft(c.id, "admin", true), /DAILY_LIMIT/);
  assert.equal(calls, 1);
});
test("manual messages imported outside the UI pause AI through the database guard", async () => {
  const c = await fixture("AUTO");
  const d = (await generateDraft(c.id, "admin", true))!;
  await approveDraft(d.id, d.text, "admin");
  await prisma.chatMessage.create({ data: { conversationId: c.externalId, direction: "OUTBOUND", senderType: "AGENT", content: "Te atiendo yo" } });
  await dispatchDraft(d.id); assert.equal(sends, 0);
  assert.equal((await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id: c.id } })).humanControl, true);
});
test("pausing legacy WhatsApp leaves Super Bot settings available for Telegram", async () => {
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await saveSettings({
    ...current,
    enabled: true,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), telegram: "AUTO" },
  }, "admin");
  const saved = await settings();
  assert.equal(saved.enabled, true);
  assert.equal((saved.channelDefaults as Record<string, string>).telegram, "AUTO");
});
test("the Telegram exception does not reactivate Messenger when the master switch is off", async () => {
  const config = await settings();
  const externalId = `messenger-${randomUUID()}`;
  const id = targetKey("messenger", externalId);
  await prisma.rockyAiConversation.create({ data: {
    id, channel: "messenger", externalId, mode: "AUTO", humanControl: false,
  } });
  const draft = await prisma.rockyAiDraft.create({ data: {
    conversationId: id, triggerId: "inbound-1", contextHash: "a".repeat(64),
    controlRevision: 0, settingsRevision: config.revision, channelRevision: 0,
    state: "QUEUED", text: "Hola", decision: greeting, evidence: [],
    expiresAt: new Date(Date.now() + 60_000),
  } });
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  await workerTick();
  const expired = await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: draft.id } });
  assert.equal(expired.state, "EXPIRED");
  assert.equal(expired.reason, "Automatización global detenida.");
  assert.equal(calls, 0);
});
test("Messenger AUTO is independently gated, uses gpt-6-sol, and leaves WhatsApp globally paused", async () => {
  const remote = installMessengerMock();
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    // Proves that Messenger does not inherit Rocky's historic lower default.
    model: "gpt-4.1-mini",
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), messenger: "AUTO" },
    channelActivationSince: { messenger: new Date(Date.now() - 30_000).toISOString() },
  } });

  await workerTick();

  const id = targetKey("messenger", remote.conversationId);
  const ai = await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id } });
  const draft = await prisma.rockyAiDraft.findFirstOrThrow({ where: { conversationId: id } });
  const usage = await prisma.rockyAiUsage.findFirstOrThrow({ where: { conversationId: id } });
  assert.equal(ai.mode, "AUTO");
  assert.equal(ai.humanControl, false);
  assert.equal(draft.state, "SUBMITTED");
  assert.equal(usage.model, "gpt-6-sol");
  assert.equal(openAiPayloads.length, 1);
  assert.equal(openAiPayloads[0].model, "gpt-6-sol");
  assert.equal(remote.deliveries.length, 1);
  assert.equal(remote.controllerActions.length, 1);
  assert.deepEqual(remote.controllerActions[0], { action: "manual", minutes: 0, actor: "rocky-ai" });
  assert.equal(remote.botEnabled, false);
  assert.equal((await prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).botMasterSwitch, false);
  assert.equal(sends, 0);
});
test("Messenger AUTO replies with neutral intake when the model cannot identify a product", async () => {
  const remote = installMessengerMock();
  openAiDecision = clarification;
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), messenger: "AUTO" },
    channelActivationSince: { messenger: new Date(Date.now() - 30_000).toISOString() },
  } });

  await workerTick();

  const draft = await prisma.rockyAiDraft.findFirstOrThrow({ where: { conversationId: targetKey("messenger", remote.conversationId) } });
  assert.equal(draft.state, "SUBMITTED");
  assert.equal(draft.reason, "product_clarification");
  assert.match(draft.text, /foto clara|nombre, código o modelo exacto/i);
  assert.equal(remote.deliveries.length, 1);
});
test("Messenger store/unmanaged control stays paused until its separate opt-in is set", async () => {
  const remote = installMessengerMock({ owner: "store", mode: "unmanaged" });
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), messenger: "AUTO" },
    channelActivationSince: { messenger: new Date(Date.now() - 30_000).toISOString() },
  } });

  await workerTick();

  assert.equal(remote.controllerActions.length, 0);
  assert.equal(remote.deliveries.length, 0);
  assert.equal(openAiPayloads.length, 0);
});
test("Messenger store/unmanaged control can answer only after its opt-in and a fresh customer inbound", async () => {
  const remote = installMessengerMock({ owner: "store", mode: "unmanaged" });
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.MESSENGER_SUPER_BOT_ALLOW_STORE_UNMANAGED = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), messenger: "AUTO" },
    channelActivationSince: { messenger: new Date(Date.now() - 30_000).toISOString() },
  } });

  await workerTick();

  const id = targetKey("messenger", remote.conversationId);
  assert.equal((await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id } })).mode, "AUTO");
  assert.equal(remote.controllerActions.length, 1);
  assert.deepEqual(remote.controllerActions[0], { action: "manual", minutes: 0, actor: "rocky-ai" });
  assert.equal(remote.deliveries.length, 1);
  assert.equal(openAiPayloads.length, 1);
  assert.equal((await prisma.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).botMasterSwitch, false);
});
test("Messenger store/unmanaged polling keeps the activation fence", async () => {
  const remote = installMessengerMock({
    owner: "store", mode: "unmanaged", inboundAt: new Date(Date.now() - 90_000).toISOString(),
  });
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.MESSENGER_SUPER_BOT_ALLOW_STORE_UNMANAGED = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), messenger: "AUTO" },
    channelActivationSince: { messenger: new Date(Date.now() - 30_000).toISOString() },
  } });

  await workerTick();

  assert.equal(await prisma.rockyAiConversation.count({ where: { channel: "messenger" } }), 0);
  assert.equal(remote.controllerActions.length, 0);
  assert.equal(remote.deliveries.length, 0);
});
test("Messenger store/unmanaged polling never interrupts a newer human outbound", async () => {
  const remote = installMessengerMock({ owner: "store", mode: "unmanaged", outboundAfterInbound: true });
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.MESSENGER_SUPER_BOT_ALLOW_STORE_UNMANAGED = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), messenger: "AUTO" },
    channelActivationSince: { messenger: new Date(Date.now() - 30_000).toISOString() },
  } });

  await workerTick();

  assert.equal(remote.controllerActions.length, 0);
  assert.equal(remote.deliveries.length, 0);
  assert.equal(openAiPayloads.length, 0);
});
test("Messenger polling never claims a ChatbotX conversation already held for a human", async () => {
  const remote = installMessengerMock({ botEnabled: false, owner: "store" });
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const current = await settings();
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: {
    enabled: true,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), messenger: "AUTO" },
    channelActivationSince: { messenger: new Date(Date.now() - 30_000).toISOString() },
  } });

  await workerTick();

  assert.equal(await prisma.rockyAiConversation.count({ where: { channel: "messenger" } }), 0);
  assert.equal(remote.controllerActions.length, 0);
  assert.equal(remote.deliveries.length, 0);
  assert.equal(openAiPayloads.length, 0);
});
test("a Messenger adviser assigned after the Super Bot claim invalidates a queued reply", async () => {
  const remote = installMessengerMock();
  process.env.MESSENGER_SUPER_BOT_COMPATIBLE = "true";
  process.env.SOCIAL_INBOX_API_TOKEN = "messenger-social-test";
  process.env.MESSENGER_CONTROL_TOKEN = "messenger-control-test";
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  await prisma.rockyAiSettings.update({ where: { id: 1 }, data: { enabled: true } });

  await configureConversation("messenger", remote.conversationId, "AUTO", false, "admin");
  const id = targetKey("messenger", remote.conversationId);
  await prisma.rockyAiConversation.update({ where: { id }, data: { lastTrigger: null } });
  const draft = await generateDraft(id, "worker");
  assert.equal(draft?.state, "QUEUED");

  remote.assignHuman();
  await dispatchDraft(draft!.id);

  const expired = await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: draft!.id } });
  assert.equal(expired.state, "EXPIRED");
  assert.equal(remote.deliveries.length, 0);
});
test("the catalog worker also keeps Messenger off when the master switch is off", async () => {
  const config = await settings();
  const externalId = `messenger-catalog-${randomUUID()}`;
  const id = targetKey("messenger", externalId);
  await prisma.rockyAiConversation.create({ data: {
    id, channel: "messenger", externalId, mode: "AUTO", humanControl: false,
  } });
  const draft = await prisma.rockyAiDraft.create({ data: {
    conversationId: id, triggerId: "inbound-1", contextHash: "b".repeat(64),
    controlRevision: 0, settingsRevision: config.revision, channelRevision: 0,
    state: "SUBMITTED", text: "Estoy preparando el catálogo.", decision: catalogDecision, evidence: [],
    expiresAt: new Date(Date.now() + 60_000),
  } });
  const job = await prisma.rockyAiCatalogJob.create({ data: {
    draftId: draft.id, conversationId: id, triggerId: draft.triggerId,
    controlRevision: 0, settingsRevision: config.revision, channelRevision: 0,
    scopeKey: "parlantes:jbl", title: "CATÁLOGO DE PARLANTES JBL", snapshot: catalogSnapshot,
    snapshotHash: "b".repeat(32), state: "QUEUED", dueAt: new Date(Date.now() - 1_000),
  } });
  await prisma.storeSettings.update({ where: { id: 1 }, data: { botMasterSwitch: false } });
  const worker = new RockyAiCatalogWorker(prisma, async () => { throw new Error("must not render"); });
  await worker.tick();
  const cancelled = await prisma.rockyAiCatalogJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(cancelled.reason, "global_automation_stopped");
});
test("a Telegram default revision does not expire a WhatsApp draft", async () => {
  const c = await fixture();
  const draft = (await generateDraft(c.id, "admin", true))!;
  const current = await settings();
  const beforeRevision = current.revision;
  await saveSettings({
    ...current,
    channelDefaults: { ...(current.channelDefaults as Record<string, string>), telegram: "AUTO" },
  }, "admin");
  const saved = await settings();
  assert.equal(saved.revision, beforeRevision);
  assert.equal((saved.channelRevisions as Record<string, number>).telegram, 1);
  assert.equal((await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: draft.id } })).state, "DRAFT");
});
test("configuration changes invalidate existing drafts", async () => {
  const c = await fixture(); const d = (await generateDraft(c.id, "admin", true))!;
  const s = await settings();
  await saveSettings({ ...s, dailyRequests: 150 }, "admin");
  await assert.rejects(approveDraft(d.id, d.text, "admin"), /DRAFT_EXPIRED/);
});
test("interrupted deliveries are recovered as uncertain without resending", async () => {
  const c = await fixture(); const d = (await generateDraft(c.id, "admin", true))!;
  await prisma.rockyAiDraft.update({ where: { id: d.id }, data: { state: "SENDING", updatedAt: new Date(Date.now() - 240000) } });
  delete process.env.OPENAI_API_KEY;
  await workerTick();
  assert.equal((await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: d.id } })).state, "UNCERTAIN");
  assert.equal((await prisma.rockyAiConversation.findUniqueOrThrow({ where: { id: c.id } })).humanControl, true);
  assert.equal(sends, 0);
});
test("a price change after approval prevents an outdated quotation from being sent", async () => {
  const c = await fixture(); const d = (await generateDraft(c.id, "admin", true))!;
  const product = await prisma.product.create({ data: { code: randomUUID(), slug: randomUUID(), name: "Prueba", unitPrice: 20, stockUnits: 10 } });
  const decision = { intent: "product", productIds: [product.id], quantity: 1, priceMode: null, policyKey: "none", reason: "routine", catalog: null };
  await prisma.rockyAiDraft.update({ where: { id: d.id }, data: { decision, evidence: [{ id: product.id, name: product.name, code: product.code, price: 20, stock: 10, wholesalePrice: null, wholesaleMinQty: 3 }] } });
  await approveDraft(d.id, "Prueba: S/ 20.00", "admin");
  await prisma.product.update({ where: { id: product.id }, data: { unitPrice: 25 } });
  await dispatchDraft(d.id);
  assert.equal((await prisma.rockyAiDraft.findUniqueOrThrow({ where: { id: d.id } })).state, "EXPIRED");
  assert.equal(sends, 0);
  await prisma.product.delete({ where: { id: product.id } });
});
