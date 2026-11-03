import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../prisma";
import { socialConversation, socialRequest, socialReplyInbox, type SocialChannel, type SocialMessage, type SocialPage } from "../social-inbox";
import { SOCIAL_FILE_LIMIT, uploadSocialFile } from "../social-media";
import { messengerControl } from "../messenger-control";
import { controlTelegram } from "../telegram-messages";
import { telegramCommand, telegramReplyWindow } from "../telegram-bridge";
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
    owned = !c.botEnabled;
    control = [c.automationRevision, c.telegramRevision, c.botEnabled, c.status, c.assignedUserId];
    const lastInbound = history.filter(m => m.role === "user").at(-1);
    // Text-only automation never opens a new messaging session.
    canSend = channel === "telegram" ? telegramReplyWindow(c.telegramLastInboundAt) :
      Boolean(lastInbound && Date.now() - Date.parse(lastInbound.at) < 86400000);
  } else {
    const { conversation, inbox } = await socialConversation(externalId, channel as SocialChannel);
    const page = await socialRequest<SocialPage<SocialMessage>>(`/conversations/${externalId}/messages?perPage=30`);
    history = page.data.filter(m => m.contactInboxId === inbox.id && !m.deletedAt && !m.sendError)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id, undefined, { numeric: true }))
      .map(m => ({ id: m.id, role: m.messageType === "incoming" ? "user" : "assistant", text: m.text || "", at: m.createdAt, attachment: Boolean(m.attachments?.length) }));
    owned = !conversation.botEnabled;
    control = [conversation.botEnabled, inbox.id];
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
    let telegramRevision: number | undefined;
    if (channel === "telegram") telegramRevision = (await controlTelegram(c, false)).revision;
    await prisma.conversation.update({ where: { id: externalId }, data: { botEnabled: false, ...(telegramRevision === undefined ? {} : { telegramRevision }) } });
  } else {
    await socialConversation(externalId, channel as SocialChannel);
    if (channel === "messenger") {
      if (!process.env.MESSENGER_CONTROL_TOKEN) throw new Error("MESSENGER_CONTROL_REQUIRED");
      await messengerControl(externalId, { action: "manual", minutes: 0, actor: "rocky-ai" });
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
  const c = await prisma.conversation.findUniqueOrThrow({ where: { id: externalId }, include: { contact: true } });
  const id = `ai:${draftId}`;
  const messageType: "TEXT" | "IMAGE" = mediaUrl ? "IMAGE" : "TEXT";
  await prisma.chatMessage.create({ data: { id, conversationId: externalId, content: text, mediaUrl, direction: "OUTBOUND",
    senderType: actor ? "AGENT" : "BOT", messageType, status: "sending", metadata: { source: "rocky-ai", draftId, approvedBy: actor } } });
  try {
    let providerId: string;
    if (channel === "telegram") {
      if (!c.telegramConnectionId || !c.telegramChatId || !telegramReplyWindow(c.telegramLastInboundAt)) throw new Error("TELEGRAM_NOT_READY");
      const sent = await telegramCommand<{ messageId: number }>("send", {
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
      const sent = await telegramCommand<{ messageId: number }>("send", {
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
