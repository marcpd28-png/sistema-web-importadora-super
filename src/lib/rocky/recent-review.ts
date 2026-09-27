import { prisma } from "@/lib/prisma";

export const ROCKY_REVIEW_HOURS = 3;

type ReviewMessage = {
  id: string;
  content: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "CUSTOMER" | "AGENT" | "BOT" | "SYSTEM";
  messageType: string;
  createdAt: Date;
};

export type RockyReviewTurn = {
  key: string;
  sourceMessageIds: string[];
  customerText: string;
  actualReply: string | null;
  createdAt: string;
  canReplay: boolean;
  mediaTypes: string[];
};

export type RockyReviewConversation = {
  id: string;
  contactLabel: string;
  channel: string;
  turns: RockyReviewTurn[];
};

function displayContent(message: ReviewMessage) {
  const content = message.content.trim();
  if (message.messageType === "TEXT") return content;
  const label = message.messageType === "IMAGE" ? "Imagen" : message.messageType === "AUDIO" ? "Audio"
    : message.messageType === "VIDEO" ? "Video" : message.messageType === "DOCUMENT" ? "Documento" : "Archivo";
  return content ? `[${label}] ${content}` : `[${label} sin texto]`;
}

export function groupRockyReviewTurns(messages: ReviewMessage[]): RockyReviewTurn[] {
  const turns: RockyReviewTurn[] = [];
  let inbound: ReviewMessage[] = [];
  let outbound: ReviewMessage[] = [];

  const flush = () => {
    if (!inbound.length) return;
    const mediaTypes = [...new Set(inbound.filter(message => message.messageType !== "TEXT").map(message => message.messageType))];
    turns.push({
      key: inbound[inbound.length - 1].id,
      sourceMessageIds: inbound.map(message => message.id),
      customerText: inbound.map(displayContent).filter(Boolean).join("\n"),
      actualReply: outbound.length ? outbound.map(displayContent).filter(Boolean).join("\n\n") : null,
      createdAt: inbound[0].createdAt.toISOString(),
      canReplay: mediaTypes.length === 0 && inbound.some(message => message.content.trim()),
      mediaTypes,
    });
    inbound = [];
    outbound = [];
  };

  for (const message of messages) {
    const isCustomer = message.direction === "INBOUND" && message.senderType === "CUSTOMER";
    if (isCustomer) {
      if (outbound.length) flush();
      inbound.push(message);
    } else if (message.direction === "OUTBOUND" && inbound.length) {
      outbound.push(message);
    }
  }
  flush();
  return turns;
}

export async function loadRecentRockyReview(since: Date): Promise<RockyReviewConversation[]> {
  const conversations = await prisma.conversation.findMany({
    where: {
      contact: { NOT: { externalId: { startsWith: "SIMULATOR:" } } },
      messages: { some: { createdAt: { gte: since }, direction: "INBOUND", senderType: "CUSTOMER" } },
    },
    select: {
      id: true,
      channel: true,
      contact: { select: { name: true } },
      messages: {
        where: { createdAt: { gte: since } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, content: true, direction: true, senderType: true, messageType: true, createdAt: true },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 60,
  });

  return conversations.map(conversation => ({
    id: conversation.id,
    contactLabel: conversation.contact.name || "Cliente",
    channel: conversation.channel,
    turns: groupRockyReviewTurns(conversation.messages),
  })).filter(conversation => conversation.turns.length > 0);
}
