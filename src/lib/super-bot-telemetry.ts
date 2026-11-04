import { Prisma, SuperBotEventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ShopAssistantReply } from "@/lib/shop-assistant-types";

// A failed worker must not leave a provider retry in `PROCESSING` forever.
// It is intentionally longer than the normal catalog request path so an
// active worker is not reclaimed during ordinary processing.
const PROCESSING_LEASE_MS = 5 * 60_000;
const SUPER_BOT_EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RETENTION_CHECK_INTERVAL_MS = 6 * 60 * 60_000;

let nextRetentionCheckAt = 0;

export type SuperBotEventInput = {
  externalEventId?: string | null;
  requestFingerprint?: string | null;
  channel?: string | null;
  conversationRef?: string | null;
};

export type SuperBotEventReservation =
  | { kind: "new"; id: string | null; leaseVersion?: number | null }
  | { kind: "completed"; id: string; reply: ShopAssistantReply }
  | { kind: "processing"; id: string | null }
  | { kind: "paused"; id: string }
  | { kind: "conflict"; id: string | null }
  | { kind: "untracked"; id: null };

function compact(value: string | null | undefined, maximum: number) {
  const text = value?.trim();
  return text ? text.slice(0, maximum) : null;
}

function knownDatabaseError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function responseFromPayload(value: Prisma.JsonValue | null): ShopAssistantReply | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const reply = (value as Record<string, unknown>).reply;
  if (!reply || Array.isArray(reply) || typeof reply !== "object") return null;
  return typeof (reply as Record<string, unknown>).text === "string"
    ? reply as ShopAssistantReply
    : null;
}

function telemetryFailure(operation: string, error: unknown) {
  // Never include conversation identifiers, user messages, response bodies, or
  // provider errors in logs. ChatbotX remains their authoritative store.
  console.error("[SUPER_BOT_TELEMETRY_ERROR]", {
    operation,
    code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "unknown",
  });
}

/**
 * Events are operational traces, not a second conversation archive. Best
 * effort pruning keeps the replay window practical without putting a cron
 * dependency on the delivery path. The provider remains authoritative.
 */
async function pruneExpiredSuperBotEvents() {
  const now = Date.now();
  if (now < nextRetentionCheckAt) return;
  nextRetentionCheckAt = now + RETENTION_CHECK_INTERVAL_MS;
  try {
    await prisma.superBotEvent.deleteMany({
      where: { createdAt: { lt: new Date(now - SUPER_BOT_EVENT_RETENTION_MS) } },
    });
  } catch (error) {
    telemetryFailure("retention", error);
  }
}

/**
 * Reserve a durable slot before generating an automatic reply. A provider
 * retry with the same external event gets its first completed catalog response
 * instead of producing a second reply. Telemetry outages must not stop a safe
 * catalog response, so callers receive `untracked` on database failures.
 */
export async function reserveSuperBotEvent(input: SuperBotEventInput): Promise<SuperBotEventReservation> {
  void pruneExpiredSuperBotEvents();
  const externalEventId = compact(input.externalEventId, 160);
  const requestFingerprint = compact(input.requestFingerprint, 64);
  const channel = compact(input.channel, 32) ?? "unknown";
  const conversationRef = compact(input.conversationRef, 160);

  try {
    if (!externalEventId) {
      const event = await prisma.superBotEvent.create({
        data: { channel, conversationRef },
        select: { id: true, leaseVersion: true },
      });
      return { kind: "new", id: event.id, leaseVersion: event.leaseVersion };
    }

    try {
      const event = await prisma.superBotEvent.create({
        data: { externalEventId, requestFingerprint, channel, conversationRef },
        select: { id: true, leaseVersion: true },
      });
      return { kind: "new", id: event.id, leaseVersion: event.leaseVersion };
    } catch (error) {
      if (!knownDatabaseError(error, "P2002")) throw error;
      const existing = await prisma.superBotEvent.findUnique({
        where: { externalEventId },
        select: { id: true, status: true, requestFingerprint: true, responsePayload: true, updatedAt: true, leaseVersion: true },
      });
      if (existing?.requestFingerprint && requestFingerprint && existing.requestFingerprint !== requestFingerprint) {
        return { kind: "conflict", id: existing.id };
      }
      const reply = existing ? responseFromPayload(existing.responsePayload) : null;
      if (existing?.status === "RESPONDED" && reply) {
        return { kind: "completed", id: existing.id, reply };
      }
      if (existing?.status === "PAUSED") {
        return { kind: "paused", id: existing.id };
      }
      // The database schema makes this non-null, but retain a defensive
      // runtime guard for partially migrated databases. Without a concrete
      // version, a retry must never claim or complete a fenced lease.
      const existingLeaseVersion = existing?.leaseVersion;
      if (!existing || !isValidLeaseVersion(existingLeaseVersion)) {
        return { kind: "processing", id: existing?.id ?? null };
      }
      if (existing?.status === "FAILED") {
        // Conditional state transition means only one concurrent retry earns
        // the right to regenerate a response after a known failure.
        const claimed = await prisma.superBotEvent.updateMany({
          where: { id: existing.id, status: "FAILED", leaseVersion: existingLeaseVersion },
          data: {
            status: "PROCESSING",
            leaseVersion: { increment: 1 },
            errorCode: null,
            latencyMs: null,
          },
        });
        return claimed.count === 1
          ? { kind: "new", id: existing.id, leaseVersion: existingLeaseVersion + 1 }
          : { kind: "processing", id: existing.id };
      }
      if (existing?.status === "PROCESSING") {
        const leaseExpiredAt = new Date(Date.now() - PROCESSING_LEASE_MS);
        if (existing.updatedAt <= leaseExpiredAt) {
          // A conditional lease renewal avoids two retries taking over the
          // same abandoned work item. `updatedAt` is explicit here because
          // the status intentionally stays PROCESSING.
          const claimed = await prisma.superBotEvent.updateMany({
            where: {
              id: existing.id,
              status: "PROCESSING",
              leaseVersion: existingLeaseVersion,
              updatedAt: { lte: leaseExpiredAt },
            },
            data: {
              leaseVersion: { increment: 1 },
              updatedAt: new Date(),
              errorCode: null,
              latencyMs: null,
            },
          });
          if (claimed.count === 1) return {
            kind: "new",
            id: existing.id,
            leaseVersion: existingLeaseVersion + 1,
          };
        }
        return { kind: "processing", id: existing.id };
      }
      return { kind: "processing", id: existing?.id ?? null };
    }
  } catch (error) {
    telemetryFailure("reserve", error);
    return { kind: "untracked", id: null };
  }
}

function isValidLeaseVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function activeLeaseWhere(id: string, leaseVersion: number | null | undefined) {
  if (!isValidLeaseVersion(leaseVersion)) return null;
  return { id, status: "PROCESSING" as const, leaseVersion };
}

/**
 * State changes are fenced by the lease acquired in `reserveSuperBotEvent`.
 * An abandoned worker can finish after a retry took over, but it cannot then
 * mark or deliver its stale reply as the current event result.
 */
export async function markSuperBotEventResponded(
  id: string | null,
  reply: ShopAssistantReply,
  latencyMs: number,
  leaseVersion?: number | null,
) {
  if (!id) return true;
  const where = activeLeaseWhere(id, leaseVersion);
  if (!where) return false;
  try {
    const updated = await prisma.superBotEvent.updateMany({
      where,
      data: {
        status: "RESPONDED",
        responsePayload: { reply },
        intent: reply.meta?.intent?.slice(0, 120) ?? null,
        productsCount: reply.products?.length ?? 0,
        latencyMs: Math.max(0, Math.round(latencyMs)),
        errorCode: null,
      },
    });
    return updated.count === 1;
  } catch (error) {
    telemetryFailure("responded", error);
    return false;
  }
}

export async function markSuperBotEventPaused(
  id: string | null,
  latencyMs: number,
  leaseVersion?: number | null,
) {
  if (!id) return true;
  const where = activeLeaseWhere(id, leaseVersion);
  if (!where) return false;
  try {
    const updated = await prisma.superBotEvent.updateMany({
      where,
      data: {
        status: "PAUSED",
        latencyMs: Math.max(0, Math.round(latencyMs)),
        errorCode: "AUTOMATION_PAUSED",
      },
    });
    return updated.count === 1;
  } catch (error) {
    telemetryFailure("paused", error);
    return false;
  }
}

export async function markSuperBotEventFailed(
  id: string | null,
  errorCode: string,
  latencyMs: number,
  leaseVersion?: number | null,
) {
  if (!id) return true;
  const where = activeLeaseWhere(id, leaseVersion);
  if (!where) return false;
  try {
    const updated = await prisma.superBotEvent.updateMany({
      where,
      data: {
        status: "FAILED",
        latencyMs: Math.max(0, Math.round(latencyMs)),
        errorCode: errorCode.slice(0, 80),
      },
    });
    return updated.count === 1;
  } catch (error) {
    telemetryFailure("failed", error);
    return false;
  }
}

export type SuperBotOperationsSummary = {
  since: Date;
  total: number;
  responded: number;
  paused: number;
  failed: number;
  averageLatencyMs: number | null;
};

export async function getSuperBotOperationsSummary(now = new Date()): Promise<SuperBotOperationsSummary> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [statuses, latency] = await Promise.all([
    prisma.superBotEvent.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.superBotEvent.aggregate({
      where: { createdAt: { gte: since }, status: "RESPONDED", latencyMs: { not: null } },
      _avg: { latencyMs: true },
    }),
  ]);

  const counts = new Map(statuses.map((item) => [item.status, item._count._all]));
  const responded = counts.get(SuperBotEventStatus.RESPONDED) ?? 0;
  const paused = counts.get(SuperBotEventStatus.PAUSED) ?? 0;
  const failed = counts.get(SuperBotEventStatus.FAILED) ?? 0;

  return {
    since,
    total: statuses.reduce((total, item) => total + item._count._all, 0),
    responded,
    paused,
    failed,
    averageLatencyMs: latency._avg.latencyMs === null ? null : Math.round(latency._avg.latencyMs),
  };
}
