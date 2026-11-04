import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SUPER_BOT_INTERNAL_KEY_MIN_BYTES = 32;

const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_PER_CLIENT = 120;
const DEFAULT_RATE_LIMIT_GLOBAL = 600;
const DEFAULT_MAX_RATE_LIMIT_CLIENTS = 1_024;
const DEFAULT_EVENT_TTL_MS = 10 * 60_000;
const DEFAULT_PENDING_EVENT_TTL_MS = 2 * 60_000;
const DEFAULT_MAX_EVENTS = 2_000;

type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; scope: "client" | "global" };

export type SuperBotInternalLogEvent = {
  event: "super_bot.internal_reply";
  outcome: "configured_error" | "invalid_payload" | "paused" | "rate_limited" | "replayed" | "served" | "unavailable";
  status: number;
  latencyMs: number;
  channel?: "messenger" | "telegram" | "tiktok" | "web";
  hasEventId: boolean;
  intent?: string;
  productsCount?: number;
  errorCode?: "automation_unavailable" | "event_conflict" | "event_processing" | "reply_unavailable";
};

/**
 * Returns a usable service credential only when it has a minimum byte length
 * and cannot contain header-breaking control characters. The value itself is
 * intentionally never logged or returned to callers.
 */
function configuredSecret(value: string | undefined) {
  const key = value?.trim();
  if (!key || Buffer.byteLength(key, "utf8") < SUPER_BOT_INTERNAL_KEY_MIN_BYTES) return null;
  if (/[\u0000-\u001f\u007f]/.test(key)) return null;
  return key;
}

export function getConfiguredSuperBotInternalApiKey(
  value = process.env.SUPER_BOT_INTERNAL_API_KEY,
) {
  return configuredSecret(value);
}

/**
 * Keep this server-only HMAC key stable when rotating the adapter credential,
 * so in-flight provider retries retain their durable event identity.
 */
export function getConfiguredSuperBotEventHashKey(
  value = process.env.SUPER_BOT_EVENT_HASH_KEY,
) {
  return configuredSecret(value);
}

export function isSuperBotInternalRequestAuthorized(
  provided: string | null,
  configuredKey: string | null,
) {
  if (!provided || !configuredKey) return false;
  const expected = Buffer.from(configuredKey);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A keyed digest avoids retaining inbound customer content while making an
 * offline dictionary attack against a leaked operational table impractical.
 * The unkeyed fallback is retained only for isolated utility tests; requests
 * reaching the route always supply the configured service key.
 */
export function fingerprintSuperBotEvent(value: unknown, secret?: string | null) {
  const serialized = JSON.stringify(value) ?? "null";
  return secret
    ? createHmac("sha256", secret).update(serialized).digest("base64url")
    : createHash("sha256").update(serialized).digest("base64url");
}

/**
 * The provider address is used only for an in-process counter, never exposed
 * or logged. The global counter remains effective if a sender spoofs a
 * forwarding header. A reverse proxy should still normalize forwarding headers.
 */
export function superBotRateLimitClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const raw = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(raw.slice(0, 160)).digest("base64url");
}

class SlidingWindowCounter {
  private readonly entries = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  consume(key: string, now: number): RateLimitDecision {
    const windowStart = now - this.windowMs;
    this.trimExpired(windowStart);

    const timestamps = this.entries.get(key) ?? [];
    const active = timestamps.filter((timestamp) => timestamp > windowStart);
    if (active.length >= this.limit) {
      const oldest = active[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
        scope: key === "__global__" ? "global" : "client",
      };
    }

    active.push(now);
    this.entries.delete(key);
    this.entries.set(key, active);
    this.trimToMaximum();
    return { allowed: true };
  }

  private trimExpired(windowStart: number) {
    for (const [key, timestamps] of this.entries) {
      const active = timestamps.filter((timestamp) => timestamp > windowStart);
      if (!active.length) this.entries.delete(key);
      else if (active.length !== timestamps.length) this.entries.set(key, active);
    }
  }

  private trimToMaximum() {
    while (this.entries.size > this.maxKeys) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.entries.delete(oldestKey);
    }
  }
}

export type SuperBotRateLimiter = {
  check: (clientKey: string, now?: number) => RateLimitDecision;
};

export function createSuperBotRateLimiter(options: {
  windowMs?: number;
  perClientLimit?: number;
  globalLimit?: number;
  maxClients?: number;
} = {}): SuperBotRateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_RATE_WINDOW_MS;
  const perClientLimit = options.perClientLimit ?? DEFAULT_RATE_LIMIT_PER_CLIENT;
  const globalLimit = options.globalLimit ?? DEFAULT_RATE_LIMIT_GLOBAL;
  const maxClients = options.maxClients ?? DEFAULT_MAX_RATE_LIMIT_CLIENTS;
  if (![windowMs, perClientLimit, globalLimit, maxClients].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Invalid Super Bot in-memory rate-limit configuration.");
  }

  const clients = new SlidingWindowCounter(perClientLimit, windowMs, maxClients);
  const global = new SlidingWindowCounter(globalLimit, windowMs, 1);
  return {
    check(clientKey: string, now = Date.now()) {
      // Reject a saturated client before it can consume the shared budget.
      // This prevents one authenticated sender from turning repeated denials
      // into a global in-process denial of service.
      const clientDecision = clients.consume(clientKey, now);
      if (!clientDecision.allowed) return clientDecision;
      return global.consume("__global__", now);
    },
  };
}

type EventEntry = {
  expiresAt: number;
  fingerprint: string;
  promise: Promise<unknown>;
};

export class SuperBotEventConflictError extends Error {
  constructor() {
    super("An event identifier was reused with a different payload.");
  }
}

export type SuperBotEventStore = {
  execute: <T>(eventId: string | undefined, fingerprint: string, operation: () => Promise<T>) => Promise<{
    replayed: boolean;
    value: T;
  }>;
};

/**
 * Coalesces duplicate provider deliveries inside one process. It is bounded
 * and intentionally treats a failed operation as retryable. Deployments with
 * multiple workers still need provider-level delivery deduplication.
 */
export function createSuperBotEventStore(options: {
  ttlMs?: number;
  pendingTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
} = {}): SuperBotEventStore {
  const ttlMs = options.ttlMs ?? DEFAULT_EVENT_TTL_MS;
  const pendingTtlMs = options.pendingTtlMs ?? DEFAULT_PENDING_EVENT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_EVENTS;
  const now = options.now ?? Date.now;
  if (![ttlMs, pendingTtlMs, maxEntries].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Invalid Super Bot in-memory event-store configuration.");
  }

  const entries = new Map<string, EventEntry>();

  function trimExpired(currentTime: number) {
    for (const [eventId, entry] of entries) {
      if (entry.expiresAt <= currentTime) entries.delete(eventId);
    }
    while (entries.size >= maxEntries) {
      const oldestEventId = entries.keys().next().value as string | undefined;
      if (!oldestEventId) break;
      entries.delete(oldestEventId);
    }
  }

  return {
    async execute<T>(eventId: string | undefined, fingerprint: string, operation: () => Promise<T>) {
      if (!eventId) return { replayed: false, value: await operation() };

      const currentTime = now();
      trimExpired(currentTime);
      const existing = entries.get(eventId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new SuperBotEventConflictError();
        return { replayed: true, value: await existing.promise as T };
      }

      const operationPromise = Promise.resolve().then(operation);
      const entry: EventEntry = {
        fingerprint,
        expiresAt: currentTime + pendingTtlMs,
        promise: operationPromise,
      };
      entries.set(eventId, entry);

      try {
        const value = await operationPromise;
        if (entries.get(eventId) === entry) entry.expiresAt = now() + ttlMs;
        return { replayed: false, value };
      } catch (error) {
        if (entries.get(eventId) === entry) entries.delete(eventId);
        throw error;
      }
    },
  };
}

export function recordSuperBotInternalLog(event: SuperBotInternalLogEvent) {
  // Do not add message text, history, event IDs, conversation IDs, IPs, keys,
  // provider response bodies, or caught Error messages to this record.
  console.info(JSON.stringify(event));
}

export const superBotInternalRateLimiter = createSuperBotRateLimiter();
export const superBotInternalEventStore = createSuperBotEventStore();
