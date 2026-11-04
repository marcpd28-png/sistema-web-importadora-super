import assert from "node:assert/strict";
import test from "node:test";
import { createSuperBotReplyHandler, type SuperBotTelemetry } from "./super-bot-internal-reply";
import { createSuperBotEventStore, createSuperBotRateLimiter, type SuperBotInternalLogEvent } from "./super-bot-security";
import type { ShopAssistantReply } from "./shop-assistant-types";

type Telemetry = SuperBotTelemetry;

const SECRET = "s".repeat(32);
const reply: ShopAssistantReply = {
  text: "Respuesta verificada",
  products: [{ id: "product-1", slug: "producto", code: "BT-1", name: "Producto", unitPrice: "S/ 10.00", unitPriceValue: 10, wholesalePrice: null, wholesalePriceValue: null, wholesaleMinQty: 1, unitsPerBox: null, availabilityLabel: "Disponible", stockUnits: 20, imageUrl: null, outboundImageUrl: null, imageAlt: null, description: null, brand: null, category: null }],
  meta: { intent: "product-search", usedOllama: false },
};

const noOpTelemetry: Telemetry = {
  reserve: async () => ({ kind: "untracked", id: null }),
  responded: async () => undefined,
  paused: async () => undefined,
  failed: async () => undefined,
};

function request(payload: unknown, key = SECRET) {
  return new Request("https://example.test/api/internal/super-bot/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-super-bot-key": key },
    body: JSON.stringify(payload),
  });
}

function handler(options: {
  answer?: () => Promise<ShopAssistantReply>;
  automation?: "enabled" | "paused" | "unavailable";
  getAutomationState?: () => Promise<"enabled" | "paused" | "unavailable">;
  rateLimiter?: ReturnType<typeof createSuperBotRateLimiter>;
  eventStore?: ReturnType<typeof createSuperBotEventStore>;
  logs?: SuperBotInternalLogEvent[];
  capturedInput?: Record<string, unknown>;
  telemetry?: Telemetry;
} = {}) {
  return createSuperBotReplyHandler({
    getConfiguredKey: () => SECRET,
    getAutomationState: options.getAutomationState ?? (async () => options.automation ?? "enabled"),
    answer: async (input) => {
      if (options.capturedInput) Object.assign(options.capturedInput, input);
      return options.answer ? options.answer() : reply;
    },
    rateLimiter: options.rateLimiter ?? createSuperBotRateLimiter({ perClientLimit: 20, globalLimit: 20 }),
    eventStore: options.eventStore ?? createSuperBotEventStore(),
    clientKey: () => "test-client",
    log: (event) => options.logs?.push(event),
    telemetry: options.telemetry ?? noOpTelemetry,
  });
}

test("misconfigured internal auth fails closed", async () => {
  const post = createSuperBotReplyHandler({ getConfiguredKey: () => null, log: () => undefined });
  const response = await post(request({ message: "hola" }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Service unavailable", automated: false });
});

test("a chunked oversized body is rejected before JSON parsing", async () => {
  const post = handler();
  const oversized = new Request("https://example.test/api/internal/super-bot/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-super-bot-key": SECRET },
    // A string Request does not require Content-Length, so this exercises the
    // bounded body stream rather than only the advisory header check.
    body: JSON.stringify({ message: "x".repeat(129 * 1024) }),
  });

  assert.equal(oversized.headers.get("content-length"), null);
  const response = await post(oversized);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Request payload too large" });
});

test("an event identifier requires its stable provider scope", async () => {
  const post = handler();
  const response = await post(request({ message: "hola", eventId: "partial-event", channel: "messenger" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request payload" });
});

test("a paused or unavailable switch never invokes the commercial responder", async () => {
  let calls = 0;
  const paused = handler({ automation: "paused", answer: async () => { calls++; return reply; } });
  const pausedResponse = await paused(request({ message: "hola", eventId: "pause-1", channel: "messenger", conversationId: "conversation-pause-1" }));
  assert.equal(pausedResponse.status, 409);
  assert.deepEqual(await pausedResponse.json(), { error: "Automation is paused", automated: false });

  const unavailable = handler({ automation: "unavailable", answer: async () => { calls++; return reply; } });
  const unavailableResponse = await unavailable(request({ message: "hola", eventId: "pause-2", channel: "messenger", conversationId: "conversation-pause-2" }));
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), { error: "Automation unavailable", automated: false });
  assert.equal(calls, 0);
});

test("durable telemetry returns a completed response without generating a second reply", async () => {
  let calls = 0;
  const post = handler({
    answer: async () => { calls += 1; return reply; },
    telemetry: {
      reserve: async () => ({ kind: "completed", id: "event-row", reply }),
      responded: async () => undefined,
      paused: async () => undefined,
      failed: async () => undefined,
    },
  });

  const response = await post(request({ message: "busco BT-1", eventId: "persisted-event", channel: "messenger", conversationId: "conversation-persisted" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply });
  assert.equal(calls, 0);
});

test("a global pause wins over a previously completed retry", async () => {
  let calls = 0;
  const post = handler({
    automation: "paused",
    answer: async () => { calls += 1; return reply; },
    telemetry: {
      reserve: async () => ({ kind: "completed", id: "event-row", reply }),
      responded: async () => undefined,
      paused: async () => undefined,
      failed: async () => undefined,
    },
  });

  const response = await post(request({
    message: "busco BT-1",
    eventId: "completed-but-paused",
    channel: "messenger",
    conversationId: "conversation-completed",
  }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Automation is paused", automated: false });
  assert.equal(calls, 0);
});

test("a pause applied during a catalog lookup prevents delivery", async () => {
  const states: Array<"enabled" | "paused"> = ["enabled", "paused"];
  const pauses: string[] = [];
  const post = handler({
    getAutomationState: async () => states.shift() ?? "paused",
    telemetry: {
      reserve: async () => ({ kind: "new", id: "event-row" }),
      responded: async () => undefined,
      paused: async (id) => { if (id) pauses.push(id); },
      failed: async () => undefined,
    },
  });

  const response = await post(request({
    message: "busco BT-1",
    eventId: "pause-during-reply",
    channel: "messenger",
    conversationId: "conversation-delivery",
  }));
  assert.equal(response.status, 409);
  assert.deepEqual(pauses, ["event-row"]);
});

test("a worker that lost its durable lease never receives a deliverable reply", async () => {
  const post = handler({
    telemetry: {
      reserve: async () => ({ kind: "new", id: "event-row", leaseVersion: 7 }),
      responded: async () => false,
      paused: async () => undefined,
      failed: async () => undefined,
    },
  });

  const response = await post(request({
    message: "busco BT-1",
    eventId: "lost-lease-event",
    channel: "messenger",
    conversationId: "conversation-lost-lease",
  }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("retry-after"), "1");
  assert.deepEqual(await response.json(), { error: "Event is already processing", automated: false });
});

test("a duplicate being processed by another worker asks the adapter to retry without answering twice", async () => {
  let calls = 0;
  const post = handler({
    answer: async () => { calls += 1; return reply; },
    telemetry: {
      reserve: async () => ({ kind: "processing", id: "event-row" }),
      responded: async () => undefined,
      paused: async () => undefined,
      failed: async () => undefined,
    },
  });

  const response = await post(request({ message: "busco BT-1", eventId: "in-flight-event", channel: "messenger", conversationId: "conversation-in-flight" }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("retry-after"), "1");
  assert.deepEqual(await response.json(), { error: "Event is already processing", automated: false });
  assert.equal(calls, 0);
});

test("a global pause is stored as an operational event", async () => {
  const pauses: Array<{ id: string | null; latencyMs: number }> = [];
  const post = handler({
    automation: "paused",
    telemetry: {
      reserve: async () => ({ kind: "new", id: "event-row" }),
      responded: async () => undefined,
      paused: async (id, latencyMs) => { pauses.push({ id, latencyMs }); },
      failed: async () => undefined,
    },
  });

  const response = await post(request({ message: "hola", eventId: "paused-event", channel: "messenger", conversationId: "conversation-paused" }));
  assert.equal(response.status, 409);
  assert.deepEqual(pauses.map((item) => item.id), ["event-row"]);
});

test("an event identifier makes repeated delivery idempotent and rejects conflicting content", async () => {
  let calls = 0;
  const post = handler({ answer: async () => { calls++; return reply; } });
  const payload = {
    message: "busco BT-1",
    eventId: "provider-event-1",
    channel: "messenger",
    conversationId: "conversation-1",
    attachmentCount: 1,
    hasAttachments: true,
  };

  const [first, second] = await Promise.all([post(request(payload)), post(request(payload))]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), { reply });
  assert.deepEqual(await second.json(), { reply });
  assert.equal(calls, 1);

  const conflict = await post(request({ ...payload, message: "otro producto" }));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "Conflicting event payload", automated: false });
  assert.equal(calls, 1);

  const anotherConversation = await post(request({ ...payload, conversationId: "conversation-2" }));
  assert.equal(anotherConversation.status, 200);
  assert.equal(calls, 2);
});

test("omitted transport defaults do not turn a provider retry into a new reply", async () => {
  let calls = 0;
  const post = handler({ answer: async () => { calls += 1; return reply; } });
  const base = {
    message: "busco BT-1",
    eventId: "canonical-defaults",
    channel: "messenger" as const,
    conversationId: "conversation-canonical",
  };

  const first = await post(request(base));
  const retry = await post(request({ ...base, hasAttachments: false, attachmentCount: 0 }));
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(calls, 1);
});

test("the endpoint limits authenticated callers and emits no customer content in structured logs", async () => {
  const logs: SuperBotInternalLogEvent[] = [];
  const post = handler({
    logs,
    rateLimiter: createSuperBotRateLimiter({ perClientLimit: 1, globalLimit: 10 }),
  });
  const sensitiveMessage = "mi número privado es 999111222";
  const accepted = await post(request({ message: sensitiveMessage, eventId: "safe-event-1", channel: "messenger", conversationId: "private-conversation" }));
  assert.equal(accepted.status, 200);
  const limited = await post(request({ message: "otra consulta", eventId: "safe-event-2", channel: "messenger", conversationId: "private-conversation-2" }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes(sensitiveMessage), false);
  assert.equal(serialized.includes("safe-event-1"), false);
  assert.equal(serialized.includes("private-conversation"), false);
  assert.equal(logs[0]?.outcome, "served");
  assert.equal(logs[1]?.outcome, "rate_limited");
});

test("transport metadata is optional and never reaches the commercial decision engine", async () => {
  const capturedInput: Record<string, unknown> = {};
  const post = handler({ capturedInput });
  const response = await post(request({
    message: "hola",
    eventId: "metadata-1",
    channel: "messenger",
    conversationId: "123",
    attachmentCount: 2,
    hasAttachments: true,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(capturedInput, {
    message: "hola",
    productContextCode: undefined,
    contextCategorySlug: undefined,
    recentMessages: undefined,
    hasAttachments: true,
  });
});

test("an attachment-only event is accepted and marked for safe human review", async () => {
  const capturedInput: Record<string, unknown> = {};
  const post = handler({ capturedInput });

  const response = await post(request({
    message: "",
    eventId: "image-event-1",
    channel: "messenger",
    conversationId: "conversation-image",
    attachmentCount: 1,
    hasAttachments: true,
  }));

  assert.equal(response.status, 200);
  assert.equal(capturedInput.message, "");
  assert.equal(capturedInput.hasAttachments, true);
});
