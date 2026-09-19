import { type PrismaClient } from "@prisma/client";
import { createManychatImageAckToken } from "@/lib/manychat-image-ack";
import { N8nOutboundError } from "@/lib/n8n-outbound";

export const MANYCHAT_IMAGE_FLOW = "content20260919025706_215753";
export type ImageInput = { conversationId: string; subscriberId: string; requestId: string; mediaUrl: string; content: string; agentId: string };
export type ImageConfig = { apiKey: string; signingSecret: string; fetchImpl?: typeof fetch };

export class ProviderError extends Error {
  constructor(readonly uncertain: boolean, message: string) { super(message); }
}

export function validateImageInput(input: ImageInput) {
  const subscriberId = Number(input.subscriberId);
  if (!/^\d+$/.test(input.subscriberId) || !Number.isSafeInteger(subscriberId) || subscriberId <= 0) throw new Error("Invalid ManyChat subscriber");
  const media = new URL(input.mediaUrl);
  if (media.protocol !== "https:" || media.username || media.password) throw new Error("Invalid public image URL");
  return { subscriberId, media };
}

export async function runManychatImageFlow(input: ImageInput, config: ImageConfig) {
  const { subscriberId, media } = validateImageInput(input);
  const token = createManychatImageAckToken(input.requestId, input.subscriberId, config.signingSecret);
  const requests = [
    { path: "subscriber/setCustomFields", body: { subscriber_id: subscriberId, fields: [
      { field_id: 14982263, field_value: media.href },
      { field_id: 14982264, field_value: input.content },
      { field_id: 14982291, field_value: input.requestId },
      { field_id: 14982292, field_value: token },
    ] } },
    { path: "sending/sendFlow", body: { subscriber_id: subscriberId, flow_ns: MANYCHAT_IMAGE_FLOW } },
  ];
  for (const request of requests) {
    let response: Response;
    try {
      response = await (config.fetchImpl ?? fetch)(`https://api.manychat.com/fb/${request.path}`, {
        method: "POST", headers: { Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`, "Content-Type": "application/json" },
        body: JSON.stringify(request.body), signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new ProviderError(true, "ManyChat no confirmó la solicitud. No reintentes la imagen hasta revisar su estado.");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.status !== "success") {
      const definite = response.status >= 400 && response.status < 500 || response.ok && body?.status === "error";
      throw new ProviderError(!definite, definite
        ? "ManyChat rechazó el envío de la imagen. Revisa que el flujo esté publicado y la conversación permita responder."
        : "La respuesta de ManyChat no confirma el envío. No reintentes hasta revisar su estado.");
    }
  }
}

export async function sendManychatImageFromInbox(db: PrismaClient, input: ImageInput, config: ImageConfig) {
  try { validateImageInput(input); } catch {
    throw new N8nOutboundError("El contacto de ManyChat o la URL de imagen no son válidos.", { code: "INVALID_MANYCHAT_IMAGE", statusCode: 400 });
  }
  // A durable per-contact reservation remains held after process restart or timeout.
  // Only the signed final-flow callback or an explicit rejection permits the next image.
  const reserved = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"manychat-image:" + input.subscriberId}, 0))`;
    const same = await tx.chatMessage.findFirst({ where: {
      conversationId: input.conversationId, direction: "OUTBOUND", messageType: "IMAGE",
      metadata: { path: ["requestId"], equals: input.requestId },
    } });
    if (same) {
      if (same.status === "sent") return { message: same, duplicate: true };
      throw new N8nOutboundError("Esta solicitud de imagen ya fue registrada; revisa su estado antes de repetirla.", { code: "IMAGE_REQUEST_EXISTS", statusCode: 409 })
        .withContext({ requestId: input.requestId, messageId: same.id });
    }
    const active = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ChatMessage"
      WHERE "metadata"->>'manychatImageSubscriber' = ${input.subscriberId}
        AND "metadata"->>'manychatImageDispatch' IN ('reserved', 'accepted', 'uncertain')
        AND NOT (COALESCE("metadata", '{}'::jsonb) ? 'manychatImageFlowAck')
      LIMIT 1
    `;
    if (active.length) throw new N8nOutboundError("Hay una imagen anterior pendiente de confirmación para este cliente. Espera a que termine antes de enviar otra.", { code: "MANYCHAT_IMAGE_BUSY", statusCode: 409 });
    const message = await tx.chatMessage.create({ data: {
      conversationId: input.conversationId, direction: "OUTBOUND", senderType: "AGENT", messageType: "IMAGE",
      content: input.content, mediaUrl: input.mediaUrl, status: "pending",
      metadata: { requestId: input.requestId, provider: "manychat", manychatImageSubscriber: input.subscriberId,
        manychatImageDispatch: "reserved", flowNs: MANYCHAT_IMAGE_FLOW },
    } });
    return { message, duplicate: false };
  }, { timeout: 10_000 });
  if (reserved.duplicate) return reserved.message;
  const id = reserved.message.id;
  try {
    await runManychatImageFlow(input, config);
  } catch (error) {
    const uncertain = !(error instanceof ProviderError) || error.uncertain;
    const reason = error instanceof ProviderError ? error.message : "No se pudo confirmar el envío de imagen mediante ManyChat.";
    const patch = JSON.stringify({ manychatImageDispatch: uncertain ? "uncertain" : "rejected", error: reason, retryBlocked: uncertain });
    await db.$executeRaw`UPDATE "ChatMessage" SET "status" = 'failed', "metadata" = COALESCE("metadata", '{}'::jsonb) || ${patch}::jsonb WHERE "id" = ${id}`;
    throw new N8nOutboundError(reason, { code: uncertain ? "MANYCHAT_IMAGE_UNCERTAIN" : "MANYCHAT_IMAGE_REJECTED", statusCode: 502 })
      .withContext({ requestId: input.requestId, messageId: id });
  }
  const patch = JSON.stringify({ manychatImageDispatch: "accepted" });
  return db.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "ChatMessage" SET "status" = 'sent', "externalMessageId" = ${"manychat-flow:" + id}, "metadata" = COALESCE("metadata", '{}'::jsonb) || ${patch}::jsonb WHERE "id" = ${id}`;
    const sent = await tx.chatMessage.findUniqueOrThrow({ where: { id } });
    await tx.conversation.update({ where: { id: input.conversationId }, data: {
      lastMessageAt: sent.createdAt, botEnabled: false, status: "ATENDIENDO", assignedUserId: input.agentId,
    } });
    return sent;
  });
}
