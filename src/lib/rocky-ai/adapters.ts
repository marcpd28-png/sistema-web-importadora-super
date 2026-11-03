import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../prisma";
import { dedupeSocialMessages, safeSocialMessage, socialConversation, socialConversationHasHumanAssignee, socialRequest, socialReplyInbox, type SocialChannel, type SocialMessage, type SocialPage } from "../social-inbox";
import { SOCIAL_FILE_LIMIT, uploadSocialFile } from "../social-media";
import { messengerControl, messengerSuperBotCompatible } from "../messenger-control";
import { controlTelegramSuperBot, sendTelegramSuperBot, telegramReplyWindow, telegramSuperBotBridgeReady } from "../telegram-bridge";
import { telegramMessageKey } from "../telegram-events";
import { normalizeYCloudPhone, sendYCloudOutboundMessage } from "../ycloud-outbound";
import { hash, type AiChannel, type HistoryItem, type Snapshot } from "./policy";

export const isLocal = (channel: AiChannel) => channel === "whatsapp" || channel === "telegram";
export async function snapshot(channel: AiChannel, externalId: string): Promise<Snapshot> {
  let history: HistoryItem[], owned = false, canSend = false, control: unknown;
  if (isLocal(channel)) {
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: externalId }, include: {
      contact: true, messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 },
    } });
    if (c.channel.toLowerCase() !== channel || c.contact.externalId?.startsWith("SIMULATOR:")) throw new Error("INVALID_CONVERSATION");
    history = c.messages.filter(m => !["cancelled", "failed"].includes(m.status ?? "")).reverse()
      .map(m => ({ id: m.id, role: m.senderType === "CUSTOMER" ? "user" : "assistant", text: m.content, at: m.createdAt.toISOString(), attachment: m.messageType !== "TEXT" }));
    // Telegram's legacy `botEnabled` flag alone cannot distinguish a Super
    // Bot claim from an adviser takeover. A claimed AI thread must also stay
    // unassigned and visibly automatic.
    owned = !c.botEnabled && !c.assignedUserId && (channel !== "telegram" || c.status === "AUTOMATICO");
    control = [c.automationRevision, c.telegramRevision, c.botEnabled, c.status, c.assignedUserId];
    const lastInbound = history.filter(m => m.role === "user").at(-1);
    // Text-only automation never opens a new messaging session.
    canSend = channel === "telegram" ? telegramReplyWindow(c.telegramLastInboundAt) :
      Boolean(lastInbound && Date.now() - Date.parse(lastInbound.at) < 86400000);
  } else {
    const { conversation, inbox } = await socialConversation(externalId, channel as SocialChannel);
    const page = await socialRequest<SocialPage<SocialMessage>>(`/conversations/${externalId}/messages?perPage=30`);
    // Meta emits an outbound ownership notice when Super Bot takes a chat.
    // It is not a customer or adviser turn, and treating it as one would pause
    // the bot before it can answer the customer that triggered the claim.
    history = dedupeSocialMessages(page.data.map(safeSocialMessage).filter(m =>
      m.contactInboxId === inbox.id && !m.deletedAt && !m.sendError && !m.systemEvent,
    ))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id, undefined, { numeric: true }))
      .map(m => ({ id: m.id, role: m.messageType === "incoming" ? "user" : "assistant", text: m.text || "", at: m.createdAt, attachment: Boolean(m.attachments?.length) }));
    // An adviser assignment is an independent human-takeover signal.  It can
    // arrive after Super Bot already claimed the ChatbotX conversation, so it
    // must both revoke ownership and change the context hash before delivery.
    owned = !conversation.botEnabled && !socialConversationHasHumanAssignee(conversation);
    control = [conversation.botEnabled, inbox.id, conversation.assignedUserId, conversation.assigneeId,
      conversation.assignedUser?.id, conversation.assignee?.id];
    if (channel === "messenger") {
      if (!process.env.MESSENGER_CONTROL_TOKEN) owned = false;
      else {
        const state = await messengerControl(externalId);
        owned = owned && state.owner === "store" && state.resumeAt === null && !state.error;
        control = [control, state.owner, state.mode, state.resumeAt, state.resumeTarget];
      }
    }
    const incoming = inbox.lastIncomingMessageAt;
    canSend = Boolean(incoming && Date.now() - Date.parse(incoming) < 86400000);
  }
  const triggerId = history.filter(m => m.role === "user").at(-1)?.id ?? "";
  return { history, triggerId, owned, canSend, contextHash: hash([control, history]),
    reason: !owned ? "Otro bot o servicio controla esta conversación." : !canSend ? "Espera un nuevo mensaje del cliente para responder." : undefined };
}

export async function claimChannel(channel: AiChannel, externalId: string) {
  if (isLocal(channel)) {
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: externalId } });
    if (c.channel.toLowerCase() !== channel) throw new Error("INVALID_CONVERSATION");
    if (channel === "telegram") {
      if (!c.botEnabled || c.assignedUserId || c.status !== "AUTOMATICO") throw new Error("CONTROL_CHANGED");
      if (!c.telegramConnectionId || !c.telegramChatId) throw new Error("TELEGRAM_NOT_READY");
      const telegramRevision = (await controlTelegramSuperBot({
        connectionId: c.telegramConnectionId, chatId: c.telegramChatId, expectedRevision: c.telegramRevision,
      })).revision;
      // The bridge's expected revision protects its side; this conditional
      // write protects the local inbox if an adviser took the chat in between.
      const claimed = await prisma.conversation.updateMany({ where: {
        id: externalId, assignedUserId: null, status: "AUTOMATICO",
      }, data: { botEnabled: false, telegramRevision } });
      if (!claimed.count) throw new Error("CONTROL_CHANGED");
    } else {
      await prisma.conversation.update({ where: { id: externalId }, data: { botEnabled: false } });
    }
  } else {
    const { conversation } = await socialConversation(externalId, channel as SocialChannel);
    // A thread with ChatbotX's bot disabled is already owned by a human or
    // another integration. Never use an automatic default to take it back.
    if (!conversation.botEnabled || socialConversationHasHumanAssignee(conversation)) throw new Error("CONTROL_CHANGED");
    if (channel === "messenger") {
      if (!messengerSuperBotCompatible()) throw new Error("MESSENGER_SUPER_BOT_INCOMPATIBLE");
      // The controller is the only authority that can distinguish Meta's
      // automated owner from a human handoff. Unknown, other, resumed, or
      // already-store states are deliberately not claimable by polling.
      const before = await messengerControl(externalId);
      if (before.error || before.owner !== "meta" || before.mode !== "meta" || before.resumeAt !== null || before.ownerVerified === false) {
        throw new Error("CONTROL_CHANGED");
      }
      const claimed = await messengerControl(externalId, { action: "manual", minutes: 0, actor: "rocky-ai" });
      if (claimed.error || claimed.owner !== "store" || claimed.mode !== "manual" || claimed.resumeAt !== null || claimed.ownerVerified === false) {
        throw new Error("CHANNEL_NOT_OWNED");
      }
    }
    await socialRequest(`/conversations/${externalId}/disable-bot`, {});
  }
  const state = await snapshot(channel, externalId);
  if (!state.owned) throw new Error("CHANNEL_NOT_OWNED");
  return state;
}

/** Called ONLY after a durable SENDING claim. An ambiguous outcome is never retried. */
export async function deliver(
  channel: AiChannel,
  externalId: string,
  text: string,
  draftId: string,
  actor: string | null,
  mediaUrl: string | null = null,
) {
  if (!isLocal(channel)) {
    // Social inboxes do not share one safe media-delivery contract yet. Keep
    // the verified product caption rather than risking an ambiguous upload.
    const inbox = await socialReplyInbox(channel as SocialChannel, externalId);
    const message = await socialRequest<SocialMessage>(`/conversations/${externalId}/messages`, { text, inboxId: inbox.inboxId }, draftId);
    if (!message?.id || message.sendError) throw new Error("DELIVERY_UNCONFIRMED");
    return message.id;
  }
  if (channel === "telegram" && !await telegramSuperBotBridgeReady()) {
    throw new Error("TELEGRAM_BOT_BRIDGE_INCOMPATIBLE");
  }
  const c = await prisma.conversation.findUniqueOrThrow({ where: { id: externalId }, include: { contact: true } });
  const id = `ai:${draftId}`;
  const messageType: "TEXT" | "IMAGE" = mediaUrl ? "IMAGE" : "TEXT";
  await prisma.chatMessage.create({ data: { id, conversationId: externalId, content: text, mediaUrl, direction: "OUTBOUND",
    senderType: actor ? "AGENT" : "BOT", messageType, status: "sending", metadata: { source: "rocky-ai", draftId, approvedBy: actor } } });
  try {
    let providerId: string;
    if (channel === "telegram") {
      if (!c.telegramConnectionId || !c.telegramChatId || !telegramReplyWindow(c.telegramLastInboundAt)) throw new Error("TELEGRAM_NOT_READY");
      const sent = await sendTelegramSuperBot({
        connectionId: c.telegramConnectionId, chatId: c.telegramChatId, requestId: id, type: "TEXT", content: text,
        ...(mediaUrl ? { type: "IMAGE", mediaUrl } : {}),
      });
      providerId = telegramMessageKey(c.telegramConnectionId, c.telegramChatId, sent.messageId);
    } else {
      const recipient = normalizeYCloudPhone(c.contact.phoneNormalized ?? c.contact.phone ?? c.contact.externalId);
      if (!recipient || c.contact.externalId?.startsWith("SIMULATOR:")) throw new Error("INVALID_RECIPIENT");
      providerId = (await sendYCloudOutboundMessage({
        recipient,
        content: text,
        ...(mediaUrl ? { mediaUrl, type: "image" as const } : { type: "text" as const }),
        externalId: id,
      })).messageId;
    }
    await prisma.chatMessage.update({ where: { id }, data: { externalMessageId: providerId, status: "accepted" } });
    await prisma.conversation.update({ where: { id: externalId }, data: { lastMessageAt: new Date() } });
    return providerId;
  } catch (error) {
    await prisma.chatMessage.updateMany({ where: { id, status: "sending" }, data: { status: "uncertain" } });
    throw error;
  }
}

type CatalogDocument = {
  documentUrl: string;
  relativeUrl: string;
  filename: string;
  byteLength: number;
  caption: string;
  deliveryId: string;
};

function localCatalogDocument(relativeUrl: string) {
  if (!/^\/uploads\/catalogs\/[a-z0-9][a-z0-9._-]*\.pdf$/i.test(relativeUrl)) throw new Error("INVALID_CATALOG_DOCUMENT");
  const root = path.resolve(process.cwd(), "public", "uploads", "catalogs");
  const file = path.resolve(process.cwd(), "public", relativeUrl.slice(1));
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_CATALOG_DOCUMENT");
  return file;
}

function publicDocumentMessage(input: CatalogDocument) {
  return `${input.caption}\n${input.documentUrl}`;
}

/**
 * Sends a PDF produced by the catalog worker. It is deliberately separate from
 * `deliver`: a document has its own durable delivery row and must never be
 * retried after an outcome that might already have reached the customer.
 */
export async function deliverCatalogDocument(channel: AiChannel, externalId: string, input: CatalogDocument) {
  const destination = new URL(input.documentUrl);
  if (!/^https?:$/.test(destination.protocol) || input.caption.length > 1000) throw new Error("INVALID_CATALOG_DOCUMENT");

  if (!isLocal(channel)) {
    if (channel === "messenger" && input.byteLength <= SOCIAL_FILE_LIMIT) {
      const file = localCatalogDocument(input.relativeUrl);
      const details = await stat(file);
      if (details.size !== input.byteLength || details.size > SOCIAL_FILE_LIMIT) throw new Error("CATALOG_DOCUMENT_CHANGED");
      const bytes = await readFile(file);
      const uploaded = await uploadSocialFile(new File([bytes], input.filename, { type: "application/pdf" }));
      // Super Bot already owns this thread. Unlike a human adviser reply, do
      // not invoke Messenger's handoff/resume control here.
      const inbox = await socialReplyInbox("messenger", externalId);
      const message = await socialRequest<SocialMessage>(`/conversations/${externalId}/messages`, {
        text: input.caption, inboxId: inbox.inboxId, mediaFileId: uploaded.mediaFileId,
      }, `catalog:${input.deliveryId}`);
      if (!message.id || message.sendError) throw new Error("DELIVERY_UNCONFIRMED");
      return message.id;
    }
    // TikTok and Instagram's current integration accepts text only. Messenger
    // also receives the public link when a multipart PDF exceeds its 5 MB
    // upload limit, rather than silently dropping the document.
    return deliver(channel, externalId, publicDocumentMessage(input), `catalog:${input.deliveryId}`, null);
  }

  if (channel === "telegram" && !await telegramSuperBotBridgeReady()) {
    throw new Error("TELEGRAM_BOT_BRIDGE_INCOMPATIBLE");
  }

  const c = await prisma.conversation.findUniqueOrThrow({ where: { id: externalId }, include: { contact: true } });
  if (c.channel.toLowerCase() !== channel) throw new Error("INVALID_CONVERSATION");
  const id = `ai:catalog:${input.deliveryId}`;
  const existing = await prisma.chatMessage.findUnique({ where: { id } });
  if (existing) {
    if (existing.externalMessageId && ["accepted", "sent"].includes(existing.status ?? "")) return existing.externalMessageId;
    throw new Error("DELIVERY_UNCONFIRMED");
  }
  await prisma.chatMessage.create({ data: { id, conversationId: externalId, content: input.caption, mediaUrl: input.documentUrl,
    direction: "OUTBOUND", senderType: "BOT", messageType: "DOCUMENT", status: "sending",
    metadata: { source: "rocky-ai", catalogDeliveryId: input.deliveryId } } });
  try {
    let providerId: string;
    if (channel === "telegram") {
      if (!c.telegramConnectionId || !c.telegramChatId || !telegramReplyWindow(c.telegramLastInboundAt)) throw new Error("TELEGRAM_NOT_READY");
      const sent = await sendTelegramSuperBot({
        connectionId: c.telegramConnectionId, chatId: c.telegramChatId, requestId: id,
        type: "DOCUMENT", content: input.caption, mediaUrl: input.documentUrl,
      });
      providerId = telegramMessageKey(c.telegramConnectionId, c.telegramChatId, sent.messageId);
    } else {
      const recipient = normalizeYCloudPhone(c.contact.phoneNormalized ?? c.contact.phone ?? c.contact.externalId);
      if (!recipient || c.contact.externalId?.startsWith("SIMULATOR:")) throw new Error("INVALID_RECIPIENT");
      providerId = (await sendYCloudOutboundMessage({ recipient, content: input.caption, mediaUrl: input.documentUrl, type: "document", externalId: id })).messageId;
    }
    await prisma.chatMessage.update({ where: { id }, data: { externalMessageId: providerId, status: "accepted" } });
    await prisma.conversation.update({ where: { id: externalId }, data: { lastMessageAt: new Date() } });
    return providerId;
  } catch (error) {
    await prisma.chatMessage.updateMany({ where: { id, status: "sending" }, data: { status: "uncertain" } });
    throw error;
  }
}
