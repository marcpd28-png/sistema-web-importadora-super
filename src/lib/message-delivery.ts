import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

const receiptSchema = z.object({
  id: z.string().startsWith("wamid.").max(120),
  recipient_id: z.string().regex(/^\d{6,20}$/),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string().regex(/^\d{10}$/),
  errors: z.array(z.object({ code: z.number().int() })).optional(),
});
type DeliveryStatus = z.infer<typeof receiptSchema>["status"];
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

export function extractDeliveryEvents(payload: unknown, allowedPhoneIds: Set<string>, now = new Date()) {
  if (record(payload).object !== "whatsapp_business_account") return [];
  return array(record(payload).entry).flatMap(entry => array(record(entry).changes).flatMap(change => {
    if (record(change).field !== "messages") return [];
    const value = record(record(change).value);
    const phoneNumberId = record(value.metadata).phone_number_id;
    if (typeof phoneNumberId !== "string" || !allowedPhoneIds.has(phoneNumberId)) return [];
    return array(value.statuses).flatMap(raw => {
      const result = receiptSchema.safeParse(raw);
      if (!result.success) return [];
      const { id: externalMessageId, recipient_id: recipientId, timestamp, status, errors } = result.data;
      const occurredAt = new Date(Number(timestamp) * 1000);
      if (occurredAt.getTime() > now.getTime() + 60_000) return [];
      const id = createHash("sha256").update(JSON.stringify([phoneNumberId, externalMessageId, recipientId, status, timestamp])).digest("hex");
      return [{ id, externalMessageId, phoneNumberId, recipientId, status, occurredAt, errorCode: errors?.[0] ? String(errors[0].code) : null }];
    });
  }));
}

// Positive delivery evidence cannot be undone by older or contradictory callbacks.
export function nextDeliveryStatus(current: string | null, incoming: DeliveryStatus) {
  if (current === "read") return current;
  if (current === "delivered") return incoming === "read" ? "read" : current;
  if (current === "failed" && incoming === "sent") return current;
  return incoming;
}

export async function persistDeliveryEvents(db: PrismaClient, events: ReturnType<typeof extractDeliveryEvents>) {
  if (!events.length) return 0;
  const result = await db.messageDeliveryEvent.createMany({ data: events, skipDuplicates: true });
  return result.count;
}

export async function reconcileDeliveryEvents(db: PrismaClient, now = new Date()) {
  const events = await db.messageDeliveryEvent.findMany({
    where: { reconciledAt: null, nextAttemptAt: { lte: now } }, orderBy: [{ nextAttemptAt: "asc" }, { occurredAt: "asc" }], take: 100,
  });
  let applied = 0;
  for (const event of events) {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"delivery:" + event.externalMessageId}, 0))`;
      const fresh = await tx.messageDeliveryEvent.findUniqueOrThrow({ where: { id: event.id } });
      if (fresh.reconciledAt) return;
      const message = await tx.chatMessage.findUnique({ where: { externalMessageId: event.externalMessageId }, include: { conversation: { include: { contact: true } } } });
      const contact = message?.conversation.contact;
      const phone = (contact?.phoneNormalized || contact?.phone || contact?.externalId || "").replace(/\D/g, "");
      if (!message || message.direction !== "OUTBOUND" || message.conversation.channel !== "WHATSAPP"
        || contact?.externalId?.startsWith("SIMULATOR:") || phone !== event.recipientId) {
        await tx.messageDeliveryEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(now.getTime() + 300_000) } });
        return;
      }
      const metadata = record(message.metadata);
      const prior = record(metadata.deliveryReceipt);
      if (typeof prior.phoneNumberId === "string" && prior.phoneNumberId !== event.phoneNumberId) {
        await tx.messageDeliveryEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(now.getTime() + 300_000) } });
        return;
      }
      const status = nextDeliveryStatus(message.status, event.status as DeliveryStatus);
      // Ignore regressions, but retain the original immutable event for auditing.
      if (status === event.status && !(prior.status === status && typeof prior.occurredAt === "string" && prior.occurredAt <= event.occurredAt.toISOString())) {
        const patch = JSON.stringify({ deliveryReceipt: { provider: "meta", status, occurredAt: event.occurredAt.toISOString(), phoneNumberId: event.phoneNumberId, errorCode: event.errorCode } });
        await tx.$executeRaw`UPDATE "ChatMessage" SET "status" = ${status}, "metadata" = COALESCE("metadata", '{}'::jsonb) || ${patch}::jsonb WHERE "id" = ${message.id}`;
        applied++;
      }
      await tx.messageDeliveryEvent.update({ where: { id: event.id }, data: { reconciledAt: now } });
    });
  }
  return { scanned: events.length, applied };
}
