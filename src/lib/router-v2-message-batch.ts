import { prisma } from "@/lib/prisma";

export type RouterV2BatchMessage = {
  id: string;
  direction: string;
  senderType: string;
  messageType: string;
  content: string;
  mediaUrl: string | null;
  createdAt: Date;
};

export type RouterV2MessageBatch =
  | {
      status: "READY";
      triggerMessageId: string;
      latestMessageId: string;
      messageIds: string[];
      content: string;
      media: Array<{
        messageId: string;
        messageType: string;
        mediaUrl: string;
      }>;
    }
  | {
      status: "SUPERSEDED";
      triggerMessageId: string;
      latestMessageId: string;
    }
  | {
      status: "TRIGGER_NOT_FOUND";
      triggerMessageId: string;
    };

function isCustomerInbound(message: RouterV2BatchMessage) {
  return (
    message.direction === "INBOUND" &&
    message.senderType === "CUSTOMER"
  );
}

export function buildRouterV2MessageBatch(input: {
  messages: RouterV2BatchMessage[];
  triggerMessageId: string;
  maxWindowMs?: number;
}): RouterV2MessageBatch {
  const ordered = [...input.messages].sort((a, b) => {
    const time = a.createdAt.getTime() - b.createdAt.getTime();
    return time !== 0 ? time : a.id.localeCompare(b.id);
  });

  const trigger = ordered.find(
    (message) => message.id === input.triggerMessageId,
  );

  if (!trigger || !isCustomerInbound(trigger)) {
    return {
      status: "TRIGGER_NOT_FOUND",
      triggerMessageId: input.triggerMessageId,
    };
  }

  const customerInbound = ordered.filter(isCustomerInbound);
  const latest = customerInbound.at(-1);
  if (!latest) {
    return {
      status: "TRIGGER_NOT_FOUND",
      triggerMessageId: input.triggerMessageId,
    };
  }

  if (latest.id !== input.triggerMessageId) {
    return {
      status: "SUPERSEDED",
      triggerMessageId: input.triggerMessageId,
      latestMessageId: latest.id,
    };
  }

  let suffixStart = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (!isCustomerInbound(ordered[index])) {
      suffixStart = index + 1;
      break;
    }
  }

  const maxWindowMs = Math.max(
    1_000,
    Math.min(input.maxWindowMs ?? 12_000, 60_000),
  );
  const cutoff = latest.createdAt.getTime() - maxWindowMs;

  const batch = ordered
    .slice(suffixStart)
    .filter(isCustomerInbound)
    .filter((message) => message.createdAt.getTime() >= cutoff)
    .slice(-8);

  const content = batch
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 10_000);

  const media = batch
    .filter((message) => Boolean(message.mediaUrl))
    .map((message) => ({
      messageId: message.id,
      messageType: message.messageType,
      mediaUrl: message.mediaUrl as string,
    }));

  return {
    status: "READY",
    triggerMessageId: input.triggerMessageId,
    latestMessageId: latest.id,
    messageIds: batch.map((message) => message.id),
    content,
    media,
  };
}

export async function getRouterV2MessageBatch(input: {
  conversationId: string;
  triggerMessageId: string;
  maxWindowMs?: number;
}) {
  const rows = await prisma.chatMessage.findMany({
    where: {
      conversationId: input.conversationId,
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: 20,
    select: {
      id: true,
      direction: true,
      senderType: true,
      messageType: true,
      content: true,
      mediaUrl: true,
      createdAt: true,
    },
  });

  return buildRouterV2MessageBatch({
    messages: rows.map((row) => ({
      ...row,
      direction: row.direction,
      senderType: row.senderType,
      messageType: row.messageType,
    })),
    triggerMessageId: input.triggerMessageId,
    maxWindowMs: input.maxWindowMs,
  });
}
