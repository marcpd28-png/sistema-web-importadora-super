import { createHash } from "node:crypto";
import { MessageType, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { lockSimulatorConversation } from "./simulator-input-batch";

// Adapter contract for a verified source event, not a ManyChat webhook specification.
export const manychatOutgoingEventSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  subscriberId: z.string().trim().min(1).max(120),
  externalMessageId: z.string().trim().min(1).max(120).optional(),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.enum(["automation", "agent"]),
  content: z.string().max(16000).default(""),
  type: z.nativeEnum(MessageType),
  mediaUrl: z.string().url().refine(value => new URL(value).protocol === "https:").optional(),
  status: z.enum(["sent", "delivered", "read", "failed", "unknown"]).default("unknown"),
}).refine(event => event.content.trim() || event.mediaUrl, "Content or media URL required");

export async function recordManychatOutgoing(
  db: PrismaClient,
  event: z.infer<typeof manychatOutgoingEventSchema>,
  startedAt: Date,
  now = new Date(),
) {
  const occurredAt = new Date(event.occurredAt);
  if (!Number.isFinite(startedAt.getTime())) throw new Error("Invalid sync activation time");
  if (occurredAt < startedAt) return { ignored: "before_activation" as const };
  if (occurredAt.getTime() > now.getTime() + 60_000) return { ignored: "future_timestamp" as const };
  const conversations = await db.conversation.findMany({
    where: { channel: "WHATSAPP", contact: { manychatSubscriberId: event.subscriberId } },
    select: { id: true, contact: { select: { externalId: true } } },
    take: 2,
  });
  // Never guess between conversations or create a customer from an unverified identifier.
  if (conversations.length !== 1) return { ignored: "conversation_not_unique" as const };
  const conversation = conversations[0];
  if (conversation.contact.externalId?.startsWith("SIMULATOR:")) return { ignored: "simulator" as const };
  const externalMessageId = event.externalMessageId ?? "manychat-event:" + createHash("sha256")
    .update(JSON.stringify([event.subscriberId, event.eventId])).digest("hex");
  const existing = await db.chatMessage.findUnique({ where: { externalMessageId } });
  if (existing) {
    if (existing.conversationId !== conversation.id) return { ignored: "message_contact_mismatch" as const };
    return { duplicate: true as const, message: existing };
  }
  try {
    const message = await db.$transaction(async tx => {
      // Share the BC publication lock: an advisor's imported reply transfers
      // ownership before any later bot batch can commit.
      await lockSimulatorConversation(tx, conversation.id);
      const created = await tx.chatMessage.create({ data: {
        conversationId: conversation.id, externalMessageId,
        direction: "OUTBOUND", senderType: event.source === "agent" ? "AGENT" : "BOT",
        content: event.content, messageType: event.type, mediaUrl: event.mediaUrl ?? null,
        createdAt: occurredAt, status: event.status,
        metadata: { provider: "manychat", source: "manychat-outgoing-sync", externalSync: true,
          origin: event.source, eventId: event.eventId, recordedAt: now.toISOString() },
      } });
      await tx.conversation.updateMany({
        where: { id: conversation.id, lastMessageAt: { lt: occurredAt } },
        data: { lastMessageAt: occurredAt },
      });
      if (event.source === "agent") await tx.conversation.updateMany({
        where: { id: conversation.id }, data: { botEnabled: false, status: "ATENDIENDO" },
      });
      return created;
    });
    return { duplicate: false as const, message };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const message = await db.chatMessage.findUnique({ where: { externalMessageId } });
      if (message?.conversationId === conversation.id) return { duplicate: true as const, message };
    }
    throw error;
  }
}
