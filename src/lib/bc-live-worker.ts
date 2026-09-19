import type { PrismaClient, Prisma } from "@prisma/client";
import { isBcLiveContact } from "./bc-live-policy";
import { sendN8nOutboundMessage } from "./n8n-outbound";
import { normalizeCommercialText } from "./commercial-query";
import { triggerPusherEvent } from "./pusher-server";
import { MANYCHAT_IMAGE_FLOW, validateImageInput } from "./manychat-image-dispatch";

const meta = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export async function processBcLivePilot(db: PrismaClient) {
  if (process.env.BC_LIVE_PILOT_ENABLED !== "true" || !process.env.BC_LIVE_PILOT_STARTED_AT) return;
  const started = new Date(process.env.BC_LIVE_PILOT_STARTED_AT);
  if (!Number.isFinite(started.getTime())) return;
  if ((await db.storeSettings.findUnique({ where: { id: 1 }, select: { botMasterSwitch: true } }))?.botMasterSwitch === false) return;
  const phones = (process.env.BC_LIVE_PILOT_PHONES ?? "").split(",").map(s => s.trim());
  const conversations = await db.conversation.findMany({ where: { botEnabled: true, assignedUserId: null, status: "AUTOMATICO", contact: { phoneNormalized: { in: phones } } }, include: { contact: true }, take: 10 });
  const key = process.env.N8N_INTERNAL_API_KEY;
  if (!key) return;
  const base = `http://127.0.0.1:${process.env.PORT || "4000"}/api/internal/chat/`;
  const call = async (route: string, body: unknown) => {
    const r = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json", "x-internal-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error("BC_PILOT_REQUEST_FAILED");
    return r.json();
  };
  for (const conversation of conversations) {
    if (!isBcLiveContact(conversation.contact)) continue;
    // A transport crash may already have reached WhatsApp: never retry it blindly.
    const staleBefore = new Date(Date.now() - 120_000).toISOString();
    const stale = await db.$executeRaw`UPDATE "ChatMessage" SET status = 'uncertain' WHERE "conversationId" = ${conversation.id} AND status = 'bc_sending' AND metadata->>'bcDispatchStartedAt' < ${staleBefore}`;
    if (stale || await db.chatMessage.count({ where: { conversationId: conversation.id, senderType: "BOT", status: { in: ["uncertain", "failed"] }, createdAt: { gte: started } } })) {
      await db.conversation.update({ where: { id: conversation.id }, data: { botEnabled: false, status: "ATENDIENDO" } }); continue;
    }
    const pending = await db.chatMessage.findFirst({ where: { conversationId: conversation.id, status: { in: ["bc_queued", "bc_sending", "queued", "pending", "accepted"] }, direction: "OUTBOUND" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (pending) {
      if (pending.status !== "bc_queued") continue;
      const data = meta(pending.metadata);
      const claimed = await db.chatMessage.updateMany({ where: { id: pending.id, status: "bc_queued", conversation: { botEnabled: true, assignedUserId: null, status: "AUTOMATICO" } }, data: { status: "bc_sending", metadata: { ...data, bcDispatchStartedAt: new Date().toISOString() } as Prisma.InputJsonValue } });
      if (!claimed.count) continue;
      try {
        if (!conversation.contact.manychatSubscriberId || !conversation.contact.phoneNormalized) throw new Error("NO_SUBSCRIBER");
        if (pending.messageType === "IMAGE") {
          validateImageInput({ conversationId: conversation.id, subscriberId: conversation.contact.manychatSubscriberId, requestId: String(data.requestId), mediaUrl: pending.mediaUrl!, content: pending.content, agentId: "bc-live-pilot" });
          if (process.env.MANYCHAT_IMAGE_QUEUE_ENABLED !== "true" || process.env.MANYCHAT_IMAGE_FLOW_ENABLED !== "true") throw new Error("IMAGE_QUEUE_DISABLED");
          await db.chatMessage.update({ where: { id: pending.id }, data: { status: "queued", metadata: { ...data, provider: "manychat", manychatImageSubscriber: conversation.contact.manychatSubscriberId, manychatImageDispatch: "queued", queuedAt: new Date().toISOString(), flowNs: MANYCHAT_IMAGE_FLOW } as Prisma.InputJsonValue } });
        } else {
          const sent = await sendN8nOutboundMessage({ agentId: "bc-live-pilot", channel: "WHATSAPP", conversationId: conversation.id,
            recipient: conversation.contact.phoneNormalized, manychatSubscriberId: conversation.contact.manychatSubscriberId,
            requestId: String(data.requestId), content: pending.content, type: pending.messageType.toLowerCase() as "text" | "document" | "video", mediaUrl: pending.mediaUrl });
          const saved = await db.chatMessage.update({ where: { id: pending.id }, data: { status: "sent", externalMessageId: sent.messageId, metadata: { ...data, provider: sent.provider } as Prisma.InputJsonValue } });
          triggerPusherEvent(`chat-${conversation.id}`, "new-message", saved);
        }
      } catch {
        await db.chatMessage.update({ where: { id: pending.id }, data: { status: "uncertain" } });
        await db.conversation.update({ where: { id: conversation.id }, data: { botEnabled: false, status: "ATENDIENDO" } });
      }
      continue;
    }
    const latest = await db.chatMessage.findFirst({ where: { conversationId: conversation.id, direction: "INBOUND", senderType: "CUSTOMER", createdAt: { gte: started } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (!latest || Date.now() - latest.createdAt.getTime() < 12_000) continue;
    const text = normalizeCommercialText(latest.content);
    if (/\b(?:asesor|humano|stop|unsubscribe|no quiero mensajes)\b|\b(?:no me|deja de|dejen de)\s+(?:escrib\w*|respond\w*|contact\w*)/.test(text)) {
      await db.conversation.update({ where: { id: conversation.id }, data: { botEnabled: false, status: "ATENDIENDO" } }); continue;
    }
    const input = { conversationId: conversation.id, triggerMessageId: latest.id };
    const result = await call("requests", input);
    if (!result.handled) await call("simulator-batch", { ...input, requestId: `bc:${latest.id}`, messages: [{ type: "TEXT", content: "Estoy atendiendo la prueba BC. Puedes consultar productos por nombre o código, enviar una foto o pedir «quiero comprar CODIGO 2 unidades y también CODIGO 1 unidad». Si una referencia tiene varios modelos, te pediré elegir el código. Escribe «asesor» para pasar a atención manual." }] });
  }
}
