import type { PrismaClient } from "@prisma/client";
import { N8nOutboundError } from "./n8n-outbound";
import { MANYCHAT_IMAGE_FLOW, ProviderError, runManychatImageFlow, validateImageInput, type ImageInput, type ImageConfig } from "./manychat-image-dispatch";
import { isBcLiveContact } from "./bc-live-policy";

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function enqueueManychatImage(db: PrismaClient, input: ImageInput) {
  validateImageInput(input);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"manychat-image:" + input.subscriberId}, 0))`;
    const existing = await tx.chatMessage.findFirst({ where: { conversationId: input.conversationId, direction: "OUTBOUND", metadata: { path: ["requestId"], equals: input.requestId } } });
    if (existing) {
      if (existing.mediaUrl !== input.mediaUrl || existing.content !== input.content || meta(existing.metadata).manychatImageSubscriber !== input.subscriberId) {
        throw new N8nOutboundError("La solicitud ya existe con otro contenido.", { code: "IMAGE_REQUEST_CONFLICT", statusCode: 409 });
      }
      return existing;
    }
    const message = await tx.chatMessage.create({ data: {
      conversationId: input.conversationId, direction: "OUTBOUND", senderType: "AGENT", messageType: "IMAGE",
      content: input.content, mediaUrl: input.mediaUrl, status: "queued",
      metadata: { provider: "manychat", requestId: input.requestId, manychatImageSubscriber: input.subscriberId,
        manychatImageDispatch: "queued", queuedAt: new Date().toISOString(), agentId: input.agentId, flowNs: MANYCHAT_IMAGE_FLOW },
    } });
    await tx.conversation.update({ where: { id: input.conversationId }, data: { botEnabled: false, status: "ATENDIENDO", assignedUserId: input.agentId, lastMessageAt: message.createdAt } });
    return message;
  });
}

export async function cancelQueuedImage(db: PrismaClient, messageId: string, agentId: string) {
  const patch = JSON.stringify({ manychatImageDispatch: "cancelled", cancelledBy: agentId, cancelledAt: new Date().toISOString() });
  // Atomic predicate prevents cancellation from racing with the worker's claim.
  const changed = await db.$executeRaw`UPDATE "ChatMessage" SET "status" = 'cancelled', "metadata" = COALESCE("metadata", '{}'::jsonb) || ${patch}::jsonb
    WHERE "id" = ${messageId} AND "status" = 'queued' AND "metadata"->>'manychatImageDispatch' = 'queued'`;
  return changed === 1;
}

export async function processQueuedImages(db: PrismaClient, config: ImageConfig, now = new Date()) {
  // A crashed in-flight attempt is ambiguous. Never release its shared fields on a timer.
  const staleBefore = new Date(now.getTime() - 120_000).toISOString();
  await db.$executeRaw`UPDATE "ChatMessage" SET "status" = 'uncertain',
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"manychatImageDispatch":"uncertain","retryBlocked":true}'::jsonb
    WHERE "metadata"->>'manychatImageDispatch' = 'reserved'
      AND COALESCE("metadata"->>'dispatchStartedAt', to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) < ${staleBefore}
      AND NOT (COALESCE("metadata", '{}'::jsonb) ? 'manychatImageFlowAck')`;
  const candidates = await db.$queryRaw<Array<{ subscriber: string }>>`
    SELECT q."metadata"->>'manychatImageSubscriber' AS subscriber FROM "ChatMessage" q
    WHERE q."status" = 'queued' AND q."metadata"->>'manychatImageDispatch' = 'queued'
      AND NOT EXISTS (SELECT 1 FROM "ChatMessage" active
        WHERE active."metadata"->>'manychatImageSubscriber' = q."metadata"->>'manychatImageSubscriber'
          AND active."metadata"->>'manychatImageDispatch' IN ('reserved','accepted','uncertain')
          AND NOT (COALESCE(active."metadata", '{}'::jsonb) ? 'manychatImageFlowAck'))
    GROUP BY q."metadata"->>'manychatImageSubscriber' ORDER BY MIN(q."createdAt") LIMIT 20`;
  let dispatched = 0;
  for (const { subscriber } of candidates) {
    const claimed = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"manychat-image:" + subscriber}, 0))`;
      const busy = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ChatMessage"
        WHERE "metadata"->>'manychatImageSubscriber' = ${subscriber}
          AND "metadata"->>'manychatImageDispatch' IN ('reserved','accepted','uncertain')
          AND NOT (COALESCE("metadata", '{}'::jsonb) ? 'manychatImageFlowAck') LIMIT 1`;
      if (busy.length) return null;
      const message = await tx.chatMessage.findFirst({ where: { status: "queued", metadata: { path: ["manychatImageSubscriber"], equals: subscriber } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (!message) return null;
      if (message.senderType === "BOT") {
        const conversation = await tx.conversation.findUnique({ where: { id: message.conversationId }, include: { contact: true } });
        const master = await tx.storeSettings.findUnique({ where: { id: 1 }, select: { botMasterSwitch: true } });
        if (!conversation || !isBcLiveContact(conversation.contact) || !conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO" || master?.botMasterSwitch === false) {
          await tx.chatMessage.update({ where: { id: message.id }, data: { status: "cancelled", metadata: { ...meta(message.metadata), manychatImageDispatch: "cancelled", cancelledAt: now.toISOString(), reason: "BOT_NO_LONGER_OWNS_CONVERSATION" } } });
          return null;
        }
      }
      const patch = JSON.stringify({ manychatImageDispatch: "reserved", dispatchStartedAt: now.toISOString(), retryBlocked: true });
      const changed = await tx.$executeRaw`UPDATE "ChatMessage" SET "status" = 'pending', "metadata" = COALESCE("metadata", '{}'::jsonb) || ${patch}::jsonb
        WHERE "id" = ${message.id} AND "status" = 'queued' AND "metadata"->>'manychatImageDispatch' = 'queued'`;
      return changed === 1 ? message : null;
    });
    if (!claimed) continue;
    const data = meta(claimed.metadata);
    let state: "accepted" | "uncertain" | "rejected" = "accepted";
    let reason: string | null = null;
    try {
      const conversation = await db.conversation.findUniqueOrThrow({ where: { id: claimed.conversationId }, include: { contact: true } });
      if (conversation.channel !== "WHATSAPP" || conversation.contact.externalId?.startsWith("SIMULATOR:") || conversation.contact.manychatSubscriberId !== subscriber) {
        throw new ProviderError(false, "El contacto cambió desde que se puso la imagen en cola.");
      }
      await runManychatImageFlow({ conversationId: claimed.conversationId, subscriberId: subscriber,
        requestId: String(data.requestId), mediaUrl: claimed.mediaUrl!, content: claimed.content, agentId: String(data.agentId) }, config);
    } catch (error) {
      state = error instanceof ProviderError && !error.uncertain ? "rejected" : "uncertain";
      reason = error instanceof ProviderError ? error.message : "No se pudo confirmar el envío. Revisa el proveedor antes de repetirlo.";
    }
    const patch = JSON.stringify({ manychatImageDispatch: state, retryBlocked: state !== "rejected", ...(reason ? { error: reason } : {}) });
    const status = state === "accepted" ? "sent" : state === "uncertain" ? "uncertain" : "failed";
    // Preserve callbacks that arrive before sendFlow returns, and proven delivery states.
    await db.$executeRaw`UPDATE "ChatMessage" SET "status" = CASE WHEN "status" IN ('delivered','read') THEN "status" ELSE ${status} END,
      "metadata" = COALESCE("metadata", '{}'::jsonb) || ${patch}::jsonb WHERE "id" = ${claimed.id}`;
    dispatched++;
  }
  return { dispatched };
}
