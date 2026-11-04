import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { triggerPusherEvent } from "./pusher-server";

export const telegramEventSchema = z.object({
  eventId: z.string().min(1).max(120),
  kind: z.enum(["message", "edit", "delete", "control"]),
  connectionId: z.string().min(1).max(180), chatId: z.string().regex(/^\d+$/).max(32),
  name: z.string().max(180).default("Cliente de Telegram"),
  messageId: z.number().int().positive().optional(), messageIds: z.array(z.number().int().positive()).max(1000).optional(),
  sender: z.enum(["CUSTOMER", "BOT", "AGENT"]).default("CUSTOMER"),
  type: z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "UNKNOWN"]).default("TEXT"),
  content: z.string().max(20000).default(""), timestamp: z.number().int().nonnegative(),
  fileId: z.string().max(1024).optional(), filename: z.string().max(255).optional(),
  localMessageId: z.string().max(120).optional(), replyToMessageId: z.number().int().positive().optional(),
  historical: z.boolean().default(false),
  botEnabled: z.boolean().optional(), needsAdvisor: z.boolean().optional(), revision: z.number().int().nonnegative().optional(),
}).refine(event => !["message", "edit"].includes(event.kind) || Boolean(event.messageId), { message: "messageId is required" });
export type TelegramEvent = z.infer<typeof telegramEventSchema>;
export function telegramContactKey(connection: string, chat: string) {
  return `tg:${createHash("sha256").update(`${connection}:${chat}`).digest("hex")}`;
}
export function telegramMessageKey(connection: string, chat: string, id: number) {
  return `${telegramContactKey(connection, chat)}:${id}`;
}

export async function receiveTelegramEvent(input: unknown) {
  const event = telegramEventSchema.parse(input);
  const key = telegramContactKey(event.connectionId, event.chatId);
  const stamp = new Date(event.timestamp * 1000);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    if (await tx.telegramInboxEvent.findUnique({ where: { id: event.eventId } })) return { duplicate: true };
    const contact = await tx.chatContact.upsert({ where: { channel_externalId: { channel: "TELEGRAM", externalId: key } },
      create: { channel: "TELEGRAM", externalId: key, name: event.name }, update: event.name !== "Cliente de Telegram" ? { name: event.name } : {} });
    // One continuous Telegram conversation preserves the 24-hour window and control state.
    let conversation = await tx.conversation.findFirst({ where: { contactId: contact.id, channel: "TELEGRAM" }, orderBy: { createdAt: "desc" } });
    if (!conversation) conversation = await tx.conversation.create({ data: {
      contactId: contact.id, channel: "TELEGRAM", telegramConnectionId: event.connectionId, telegramChatId: event.chatId,
      lastMessageAt: stamp,
    } });
    const externalMessageId = event.messageId ? telegramMessageKey(event.connectionId, event.chatId, event.messageId) : undefined;
    if (event.kind === "delete") {
      await tx.chatMessage.updateMany({ where: { conversationId: conversation.id, externalMessageId: { in: (event.messageIds || []).map(id => telegramMessageKey(event.connectionId, event.chatId, id)) } }, data: { status: "deleted" } });
    } else if (event.kind === "control") {
      if (event.revision !== undefined && event.revision > conversation.telegramRevision && event.botEnabled !== undefined) {
        await tx.conversation.update({ where: { id: conversation.id }, data: {
          telegramRevision: event.revision, botEnabled: event.botEnabled,
          status: event.botEnabled ? "AUTOMATICO" : event.needsAdvisor ? "REQUIERE_ASESOR" : "ATENDIENDO",
          ...(event.botEnabled ? { assignedUserId: null } : {}),
        } });
      }
    } else if (externalMessageId) {
      const existing = await tx.chatMessage.findUnique({ where: { externalMessageId } });
      const local = event.localMessageId ? await tx.chatMessage.findFirst({ where: { id: event.localMessageId, conversationId: conversation.id, senderType: "AGENT" } }) : null;
      const replyTarget = event.replyToMessageId ? await tx.chatMessage.findUnique({ where: { externalMessageId: telegramMessageKey(event.connectionId, event.chatId, event.replyToMessageId) } }) : null;
      const metadata: Prisma.InputJsonObject = { provider: "telegram", telegramMessageId: event.messageId!,
        ...(event.fileId ? { telegramFileId: event.fileId } : {}), ...(event.filename ? { filename: event.filename } : {}),
        ...(replyTarget ? { replyTo: { id: replyTarget.id, content: replyTarget.content, senderType: replyTarget.senderType } } : {}),
      };
      const mediaUrl = event.fileId ? `telegram-file:${event.fileId}` : null;
      if (local && !existing) {
        await tx.chatMessage.update({ where: { id: local.id }, data: { externalMessageId, status: "sent", metadata: { ...(local.metadata as Prisma.InputJsonObject || {}), ...metadata } } });
      } else if (existing && event.kind === "edit") {
        await tx.chatMessage.update({ where: { id: existing.id }, data: { content: event.content, mediaUrl, messageType: event.type, metadata: { ...metadata, edited: true } } });
      } else if (!existing && event.kind === "message") {
        await tx.chatMessage.create({ data: { conversationId: conversation.id, externalMessageId,
          senderType: event.sender, direction: event.sender === "CUSTOMER" ? "INBOUND" : "OUTBOUND", messageType: event.type,
          content: event.content, mediaUrl, metadata, status: "sent", createdAt: stamp } });
      }
      if (event.kind === "message" && !existing) {
        await tx.conversation.update({ where: { id: conversation.id }, data: {
          lastMessageAt: stamp > conversation.lastMessageAt ? stamp : conversation.lastMessageAt,
          ...(event.sender === "CUSTOMER" ? {
            unreadCount: { increment: event.historical ? 0 : 1 },
            telegramLastInboundAt: !conversation.telegramLastInboundAt || stamp > conversation.telegramLastInboundAt ? stamp : conversation.telegramLastInboundAt,
            ...(conversation.status === "CERRADO" ? { status: "REQUIERE_ASESOR" } : {}),
          } : {}),
        } });
      }
    }
    await tx.telegramInboxEvent.create({ data: { id: event.eventId } });
    return { duplicate: false, conversationId: conversation.id };
  });
  if (result.conversationId) triggerPusherEvent(`chat-${result.conversationId}`, "telegram-update", { conversationId: result.conversationId });
  return result;
}
