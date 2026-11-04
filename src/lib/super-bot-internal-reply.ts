import { z } from "zod";
import { getSuperBotAutomationState, type SuperBotAutomationState } from "@/lib/super-bot-automation";
import { answerSuperBot } from "@/lib/super-bot";
import type { ShopAssistantReply } from "@/lib/shop-assistant-types";
import {
  markSuperBotEventFailed,
  markSuperBotEventPaused,
  markSuperBotEventResponded,
  reserveSuperBotEvent,
  type SuperBotEventReservation,
} from "@/lib/super-bot-telemetry";
import {
  SuperBotEventConflictError,
  fingerprintSuperBotEvent,
  getConfiguredSuperBotEventHashKey,
  getConfiguredSuperBotInternalApiKey,
  isSuperBotInternalRequestAuthorized,
  recordSuperBotInternalLog,
  superBotInternalEventStore,
  superBotInternalRateLimiter,
  superBotRateLimitClientKey,
  type SuperBotEventStore,
  type SuperBotInternalLogEvent,
  type SuperBotRateLimiter,
} from "@/lib/super-bot-security";

const MAX_BODY_BYTES = 128 * 1024;
const eventIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);

const inputSchema = z.object({
  message: z.string().trim().max(1_200).default(""),
  productContextCode: z.string().trim().max(64).nullish(),
  contextCategorySlug: z.string().trim().max(120).nullish(),
  recentMessages: z.array(z.object({
    role: z.enum(["assistant", "user"]),
    text: z.string().trim().max(4_000),
  })).max(6).optional(),
  // This comes only from a trusted channel adapter. The model may use it to
  // compose a single first-turn greeting, but it must never infer or change
  // the value from customer content.
  isFirstContact: z.boolean().optional(),
  // Transport fields are optional while adapters migrate. Only attachment
  // presence reaches Super Bot, solely to request a human review; it never
  // becomes a commercial fact or model instruction.
  eventId: eventIdSchema.optional(),
  channel: z.enum(["messenger", "telegram", "tiktok", "web"]).optional(),
  conversationId: z.string().trim().min(1).max(160).optional(),
  attachmentCount: z.number().int().min(0).max(10).optional(),
  hasAttachments: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.message || value.hasAttachments || (value.attachmentCount ?? 0) > 0) return;
  context.addIssue({ code: "custom", message: "A message or attachment is required." });
}).superRefine((value, context) => {
  // Provider IDs are only safely idempotent once their channel and
  // conversation scope are present. Reject partial migrations instead of
  // silently treating the same delivery as a different event.
  if (value.channel && !value.eventId) {
    context.addIssue({
      code: "custom",
      path: ["eventId"],
      message: "channel deliveries require eventId.",
    });
    return;
  }
  if (!value.eventId || (value.channel && value.conversationId)) return;
  context.addIssue({
    code: "custom",
    path: ["eventId"],
    message: "eventId requires channel and conversationId.",
  });
});

type SuperBotReplyInput = z.infer<typeof inputSchema>;
type CommercialInput = Pick<SuperBotReplyInput, "message" | "productContextCode" | "contextCategorySlug" | "recentMessages" | "isFirstContact"> & {
  hasAttachments: boolean;
};

export type SuperBotTelemetry = {
  reserve: (input: {
    externalEventId?: string | null;
    requestFingerprint?: string | null;
    channel?: string | null;
    conversationRef?: string | null;
  }) => Promise<SuperBotEventReservation>;
  responded: (id: string | null, reply: ShopAssistantReply, latencyMs: number, leaseVersion?: number | null) => Promise<void | boolean>;
  paused: (id: string | null, latencyMs: number, leaseVersion?: number | null) => Promise<void | boolean>;
  failed: (id: string | null, errorCode: string, latencyMs: number, leaseVersion?: number | null) => Promise<void | boolean>;
};

const durableSuperBotTelemetry: SuperBotTelemetry = {
  reserve: reserveSuperBotEvent,
  responded: markSuperBotEventResponded,
  paused: markSuperBotEventPaused,
  failed: markSuperBotEventFailed,
};

export type SuperBotReplyHandlerDependencies = {
  answer?: (input: CommercialInput) => Promise<ShopAssistantReply>;
  getAutomationState?: () => Promise<SuperBotAutomationState>;
  getConfiguredKey?: () => string | null;
  getEventHashKey?: () => string | null;
  eventStore?: SuperBotEventStore;
  rateLimiter?: SuperBotRateLimiter;
  clientKey?: (request: Request) => string;
  log?: (event: SuperBotInternalLogEvent) => void;
  telemetry?: SuperBotTelemetry;
  now?: () => number;
};

function response(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function contentLengthExceedsLimit(request: Request) {
  const value = request.headers.get("content-length");
  if (!value) return false;
  const length = Number(value);
  return Number.isFinite(length) && length > MAX_BODY_BYTES;
}

type RequestBodyResult =
  | { kind: "valid"; value: unknown }
  | { kind: "invalid" }
  | { kind: "too_large" };

/**
 * `content-length` is advisory: a chunked provider request can omit it or lie.
 * Bound the stream itself before parsing so an authenticated adapter cannot
 * make the route buffer an unbounded JSON body.
 */
async function readBoundedJsonBody(request: Request): Promise<RequestBodyResult> {
  if (contentLengthExceedsLimit(request)) return { kind: "too_large" };
  if (!request.body) return { kind: "invalid" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The response is already safely decided as too large.
        }
        return { kind: "too_large" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { kind: "valid", value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
}

function safeIntent(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : undefined;
}

function logEvent(
  log: (event: SuperBotInternalLogEvent) => void,
  startedAt: number,
  event: Omit<SuperBotInternalLogEvent, "event" | "latencyMs">,
  now: () => number,
) {
  log({ event: "super_bot.internal_reply", latencyMs: Math.max(0, now() - startedAt), ...event });
}

function asSuperBotInput(input: SuperBotReplyInput): CommercialInput {
  return {
    message: input.message,
    productContextCode: input.productContextCode,
    contextCategorySlug: input.contextCategorySlug,
    recentMessages: input.recentMessages,
    ...(typeof input.isFirstContact === "boolean" ? { isFirstContact: input.isFirstContact } : {}),
    hasAttachments: input.hasAttachments || (input.attachmentCount ?? 0) > 0,
  };
}

function canonicalEventPayload(input: SuperBotReplyInput) {
  return {
    message: input.message,
    productContextCode: input.productContextCode ?? null,
    contextCategorySlug: input.contextCategorySlug ?? null,
    recentMessages: input.recentMessages ?? [],
    isFirstContact: input.isFirstContact ?? false,
    hasAttachments: input.hasAttachments || (input.attachmentCount ?? 0) > 0,
  };
}

function eventStoreKey(input: SuperBotReplyInput, secret: string) {
  if (!input.eventId) return undefined;
  // Provider event IDs are not necessarily globally unique. Hashing their
  // scope also prevents retaining raw provider IDs in process memory or DB.
  return fingerprintSuperBotEvent({
    eventId: input.eventId,
    channel: input.channel ?? null,
    conversationId: input.conversationId ?? null,
  }, secret);
}

function conversationReference(input: SuperBotReplyInput, secret: string) {
  if (!input.conversationId) return undefined;
  return fingerprintSuperBotEvent({
    channel: input.channel ?? null,
    conversationId: input.conversationId,
  }, secret);
}

/**
 * Server-to-server responder with injectable guards so its safety properties
 * are unit-tested without calling a provider or database. Durable event slots
 * prevent a second process from generating a duplicate reply; the adapter
 * receives 202 and retries when another worker is still processing one.
 */
export function createSuperBotReplyHandler(dependencies: SuperBotReplyHandlerDependencies = {}) {
  const answer = dependencies.answer ?? answerSuperBot;
  const getAutomationState = dependencies.getAutomationState ?? getSuperBotAutomationState;
  const getConfiguredKey = dependencies.getConfiguredKey ?? getConfiguredSuperBotInternalApiKey;
  const getEventHashKey = dependencies.getEventHashKey ?? getConfiguredSuperBotEventHashKey;
  const eventStore = dependencies.eventStore ?? superBotInternalEventStore;
  const rateLimiter = dependencies.rateLimiter ?? superBotInternalRateLimiter;
  const clientKey = dependencies.clientKey ?? superBotRateLimitClientKey;
  const log = dependencies.log ?? recordSuperBotInternalLog;
  const telemetry = dependencies.telemetry ?? durableSuperBotTelemetry;
  const now = dependencies.now ?? Date.now;

  return async function post(request: Request) {
    const startedAt = now();
    const configuredKey = getConfiguredKey();
    if (!configuredKey) {
      logEvent(log, startedAt, { outcome: "configured_error", status: 503, hasEventId: false }, now);
      return response({ error: "Service unavailable", automated: false }, 503);
    }

    if (!isSuperBotInternalRequestAuthorized(request.headers.get("x-super-bot-key"), configuredKey)) {
      return response({ error: "Unauthorized" }, 401);
    }
    // A separate stable HMAC key preserves idempotency across service-key
    // rotation. Falling back keeps existing deployments compatible until it
    // is provisioned.
    const eventHashKey = getEventHashKey() ?? configuredKey;

    const rateLimit = rateLimiter.check(clientKey(request), now());
    if (!rateLimit.allowed) {
      logEvent(log, startedAt, { outcome: "rate_limited", status: 429, hasEventId: false }, now);
      return response(
        { error: "Too many requests", automated: false },
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    const requestBody = await readBoundedJsonBody(request);
    if (requestBody.kind === "too_large") {
      logEvent(log, startedAt, { outcome: "invalid_payload", status: 413, hasEventId: false }, now);
      return response({ error: "Request payload too large" }, 413);
    }

    const parsed = inputSchema.safeParse(requestBody.kind === "valid" ? requestBody.value : null);
    if (!parsed.success) {
      logEvent(log, startedAt, { outcome: "invalid_payload", status: 400, hasEventId: false }, now);
      return response({ error: "Invalid request payload" }, 400);
    }

    const input = parsed.data;
    const fingerprint = fingerprintSuperBotEvent(canonicalEventPayload(input), eventHashKey);
    const scopedEventId = eventStoreKey(input, eventHashKey);
    const reservation = await telemetry.reserve({
      externalEventId: scopedEventId,
      requestFingerprint: fingerprint,
      channel: input.channel,
      conversationRef: conversationReference(input, eventHashKey),
    });
    const reservationLeaseVersion = reservation.kind === "new" ? reservation.leaseVersion : null;
    if (reservation.kind === "conflict") {
      logEvent(log, startedAt, {
        outcome: "invalid_payload",
        status: 409,
        hasEventId: Boolean(input.eventId),
        channel: input.channel,
        errorCode: "event_conflict",
      }, now);
      return response({ error: "Conflicting event payload", automated: false }, 409);
    }
    if (reservation.kind === "paused") {
      logEvent(log, startedAt, { outcome: "paused", status: 409, hasEventId: Boolean(input.eventId), channel: input.channel }, now);
      return response({ error: "Automation is paused", automated: false }, 409);
    }

    const automationState = await getAutomationState();
    if (automationState === "paused") {
      // A retry must never deliver a completed automatic response after a
      // global pause. Preserve completed telemetry, but mark newly reserved
      // events as paused so they are not replayed after reactivation.
      if (reservation.kind === "new") await telemetry.paused(reservation.id, now() - startedAt, reservationLeaseVersion);
      logEvent(log, startedAt, { outcome: "paused", status: 409, hasEventId: Boolean(input.eventId), channel: input.channel }, now);
      return response({ error: "Automation is paused", automated: false }, 409);
    }
    if (automationState === "unavailable") {
      if (reservation.kind === "new") await telemetry.failed(reservation.id, "AUTOMATION_UNAVAILABLE", now() - startedAt, reservationLeaseVersion);
      logEvent(log, startedAt, {
        outcome: "unavailable",
        status: 503,
        hasEventId: Boolean(input.eventId),
        channel: input.channel,
        errorCode: "automation_unavailable",
      }, now);
      return response({ error: "Automation unavailable", automated: false }, 503);
    }

    if (reservation.kind === "completed") {
      logEvent(log, startedAt, {
        outcome: "replayed",
        status: 200,
        hasEventId: Boolean(input.eventId),
        channel: input.channel,
        intent: safeIntent(reservation.reply.meta?.intent),
        productsCount: reservation.reply.products?.length ?? 0,
      }, now);
      return response({ reply: reservation.reply }, 200);
    }
    if (reservation.kind === "processing") {
      logEvent(log, startedAt, {
        outcome: "unavailable",
        status: 202,
        hasEventId: Boolean(input.eventId),
        channel: input.channel,
        errorCode: "event_processing",
      }, now);
      return response({ error: "Event is already processing", automated: false }, 202, { "Retry-After": "1" });
    }

    try {
      const result = await eventStore.execute(
        scopedEventId,
        fingerprint,
        () => answer(asSuperBotInput(input)),
      );
      const productsCount = result.value.products?.length ?? 0;
      // A catalog lookup can take long enough for an operator to pause the
      // global switch. Re-check immediately before returning deliverable text.
      const deliveryState = await getAutomationState();
      if (deliveryState === "paused") {
        await telemetry.paused(reservation.id, now() - startedAt, reservationLeaseVersion);
        logEvent(log, startedAt, { outcome: "paused", status: 409, hasEventId: Boolean(input.eventId), channel: input.channel }, now);
        return response({ error: "Automation is paused", automated: false }, 409);
      }
      if (deliveryState === "unavailable") {
        await telemetry.failed(reservation.id, "AUTOMATION_UNAVAILABLE", now() - startedAt, reservationLeaseVersion);
        logEvent(log, startedAt, {
          outcome: "unavailable",
          status: 503,
          hasEventId: Boolean(input.eventId),
          channel: input.channel,
          errorCode: "automation_unavailable",
        }, now);
        return response({ error: "Automation unavailable", automated: false }, 503);
      }
      const committed = await telemetry.responded(
        reservation.id,
        result.value,
        now() - startedAt,
        reservationLeaseVersion,
      );
      if (committed === false) {
        logEvent(log, startedAt, {
          outcome: "unavailable",
          status: 202,
          hasEventId: Boolean(input.eventId),
          channel: input.channel,
          errorCode: "event_processing",
        }, now);
        return response({ error: "Event is already processing", automated: false }, 202, { "Retry-After": "1" });
      }
      logEvent(log, startedAt, {
        outcome: result.replayed ? "replayed" : "served",
        status: 200,
        hasEventId: Boolean(input.eventId),
        channel: input.channel,
        intent: safeIntent(result.value.meta?.intent),
        productsCount,
      }, now);
      return response({ reply: result.value }, 200);
    } catch (error) {
      if (error instanceof SuperBotEventConflictError) {
        logEvent(log, startedAt, {
          outcome: "invalid_payload",
          status: 409,
          hasEventId: Boolean(input.eventId),
          channel: input.channel,
          errorCode: "event_conflict",
        }, now);
        return response({ error: "Conflicting event payload", automated: false }, 409);
      }
      await telemetry.failed(reservation.id, "REPLY_UNAVAILABLE", now() - startedAt, reservationLeaseVersion);
      logEvent(log, startedAt, {
        outcome: "unavailable",
        status: 503,
        hasEventId: Boolean(input.eventId),
        channel: input.channel,
        errorCode: "reply_unavailable",
      }, now);
      return response({ error: "Super Bot could not prepare a reply", automated: false }, 503);
    }
  };
}
