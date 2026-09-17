import type { Prisma } from "@prisma/client";
import { buildChatInputBatch, CHAT_BATCH_MAX_MESSAGES } from "./chat-input-batch";

export async function lockSimulatorConversation(tx: Prisma.TransactionClient, conversationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`simulator:${conversationId}`}))`;
}

export async function readSimulatorInputBatch(tx: Prisma.TransactionClient, conversationId: string, triggerMessageId: string) {
  const lastReply = await tx.chatMessage.findFirst({
    where: { conversationId, direction: "OUTBOUND", senderType: { in: ["BOT", "AGENT"] },
      OR: [{ status: null }, { status: { notIn: ["failed", "pending"] } }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  const rows = await tx.chatMessage.findMany({
    where: { conversationId, ...(lastReply ? { createdAt: { gte: lastReply.createdAt } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CHAT_BATCH_MAX_MESSAGES + 2,
    select: { id: true, direction: true, senderType: true, messageType: true, content: true, mediaUrl: true, createdAt: true, status: true },
  });
  return buildChatInputBatch(rows, triggerMessageId);
}
