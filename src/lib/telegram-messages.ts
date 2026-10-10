import type { Conversation, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { telegramCommand, TelegramBridgeError, telegramReplyWindow } from "./telegram-bridge";
import { telegramMessageKey } from "./telegram-events";
import { buildPublicUrl } from "./site-url";
import type { SendMessageInput } from "./messages-service";

type BridgeResult = { messageId: number; revision: number };
export async function sendTelegramMessage(conversation: Conversation, input: SendMessageInput, agentId: string) {
  const id = `tgout:${input.requestId}`;
  const previous = await prisma.chatMessage.findUnique({ where: { id } });
  if (previous) {
    if (previous.conversationId !== conversation.id) throw new TelegramBridgeError("La solicitud pertenece a otra conversación.", 409);
    return previous;
  }
  if (!conversation.telegramConnectionId || !conversation.telegramChatId) throw new TelegramBridgeError("Este chat no tiene una conexión de Telegram válida.", 409);
  if (!telegramReplyWindow(conversation.telegramLastInboundAt)) throw new TelegramBridgeError("Telegram permite responder durante las 24 horas posteriores al último mensaje del cliente. Espera un nuevo mensaje.", 409);
  if (!["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(input.type)) throw new TelegramBridgeError("Ese tipo de archivo no se puede enviar a Telegram.", 400);
  const mediaUrl = input.mediaUrl?.startsWith("/") ? buildPublicUrl(input.mediaUrl) : input.mediaUrl;
  if (input.type !== "TEXT" && !mediaUrl) throw new TelegramBridgeError("Selecciona un archivo para enviar.", 400);
  if (input.content.length > (input.type === "TEXT" ? 4000 : 1000)) throw new TelegramBridgeError("El mensaje supera el límite de Telegram. Envíalo en partes más cortas.", 400);
  const reply = input.replyToMessageId ? await prisma.chatMessage.findFirst({ where: { id: input.replyToMessageId, conversationId: conversation.id } }) : null;
  const replyId = (reply?.metadata as Record<string, unknown> | null)?.telegramMessageId;
  if (input.replyToMessageId && typeof replyId !== "number") throw new TelegramBridgeError("El mensaje elegido no está disponible para responder.", 400);
  const metadata: Prisma.InputJsonObject = { provider: "telegram", requestId: input.requestId,
    ...(reply ? { replyTo: { id: reply.id, content: reply.content, senderType: reply.senderType } } : {}) };
  // Only show Rocky as paused after the bridge has actually applied the pause.
  const paused = await controlTelegram(conversation, false);
  const created = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
    const duplicate = await tx.chatMessage.findUnique({ where: { id } });
    if (duplicate) {
      if (duplicate.conversationId !== conversation.id) throw new TelegramBridgeError("La solicitud pertenece a otra conversación.", 409);
      return false;
    }
    await tx.chatMessage.create({ data: { id, conversationId: conversation.id, direction: "OUTBOUND", senderType: "AGENT",
      messageType: input.type, content: input.content, mediaUrl, metadata, status: "pending" } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { telegramRevision: paused.revision, botEnabled: false, status: "ATENDIENDO", assignedUserId: agentId, unreadCount: 0, lastReadAt: new Date() } });
    return true;
  });
  if (!created) return prisma.chatMessage.findUniqueOrThrow({ where: { id } });
  try {
    // Bridge serializes pause + send with Rocky's processing lock and durably deduplicates this ID.
    const result = await telegramCommand<BridgeResult>("send", {
      connectionId: conversation.telegramConnectionId, chatId: conversation.telegramChatId,
      requestId: id, type: input.type, content: input.content, mediaUrl, replyToMessageId: replyId,
    });
    await prisma.chatMessage.updateMany({ where: { id, status: { in: ["pending", "uncertain"] } }, data: {
      externalMessageId: telegramMessageKey(conversation.telegramConnectionId, conversation.telegramChatId, result.messageId),
      status: "sent", metadata: { ...metadata, telegramMessageId: result.messageId },
    } });
    await prisma.conversation.updateMany({ where: { id: conversation.id, telegramRevision: { lte: result.revision } }, data: {
      telegramRevision: result.revision, botEnabled: false, status: "ATENDIENDO", lastMessageAt: new Date(),
    } });
  } catch (error) {
    const safe = error instanceof TelegramBridgeError ? error : new TelegramBridgeError("No se pudo confirmar el envío a Telegram.", 502, true);
    await prisma.chatMessage.updateMany({ where: { id, status: "pending" }, data: { status: safe.uncertain ? "uncertain" : "failed", metadata: { ...metadata, error: safe.message } } });
    // Return the persisted state so the UI cannot turn an ambiguous delivery into a retryable bubble.
    return prisma.chatMessage.findUniqueOrThrow({ where: { id } });
  }
  return prisma.chatMessage.findUniqueOrThrow({ where: { id } });
}

export async function controlTelegram(conversation: Conversation, botEnabled: boolean) {
  if (!conversation.telegramConnectionId || !conversation.telegramChatId) throw new TelegramBridgeError("No se encontró la conexión de Telegram.", 409);
  return telegramCommand<{ revision: number }>("control", { connectionId: conversation.telegramConnectionId, chatId: conversation.telegramChatId, botEnabled });
}
