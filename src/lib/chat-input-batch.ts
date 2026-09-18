export const CHAT_QUIET_PERIOD_MS = 12_000;
export const CHAT_BATCH_MAX_CHARACTERS = 10_000;
export const CHAT_BATCH_MAX_MESSAGES = 100;

export type ChatInputMessage = {
  id: string;
  direction: string;
  senderType: string;
  messageType: string;
  content: string;
  mediaUrl: string | null;
  createdAt: Date;
  status?: string | null;
};

export function isDeliveredReply(message: ChatInputMessage) {
  return message.direction === "OUTBOUND" && ["BOT", "AGENT"].includes(message.senderType)
    && message.status !== "failed" && message.status !== "pending";
}

/** A sliding period of silence, not a fixed look-back window that loses earlier fragments. */
export function buildChatInputBatch(messages: ChatInputMessage[], triggerMessageId: string, now = Date.now()) {
  const ordered = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const inbound = ordered.filter(m => m.direction === "INBOUND" && m.senderType === "CUSTOMER");
  const latest = inbound.at(-1);
  const base = { triggerMessageId, latestMessageId: latest?.id ?? null };
  if (!inbound.some(m => m.id === triggerMessageId)) return { ...base, status: "TRIGGER_NOT_FOUND" as const };
  if (latest!.id !== triggerMessageId) return { ...base, status: "SUPERSEDED" as const };
  let start = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (isDeliveredReply(ordered[i])) { start = i + 1; break; }
  }
  const pending = ordered.slice(start).filter(m => m.direction === "INBOUND" && m.senderType === "CUSTOMER");
  if (!pending.some(m => m.id === triggerMessageId)) return { ...base, status: "ALREADY_ANSWERED" as const };
  const waitMs = Math.max(0, latest!.createdAt.getTime() + CHAT_QUIET_PERIOD_MS - now);
  if (waitMs) return { ...base, status: "WAITING" as const, waitMs };
  const content = pending.map(m => m.content.trim()).filter(Boolean).join("\n");
  const common = { ...base, messageIds: pending.map(m => m.id) };
  if (pending.length > CHAT_BATCH_MAX_MESSAGES || content.length > CHAT_BATCH_MAX_CHARACTERS) {
    return { ...common, status: "TOO_LARGE" as const };
  }
  return {
    ...common, status: "READY" as const, content,
    fragments: pending.map(m => ({ messageId: m.id, messageType: m.messageType, content: m.content })),
    media: pending.filter(m => m.mediaUrl).map(m => ({ messageId: m.id, messageType: m.messageType, mediaUrl: m.mediaUrl! })),
  };
}
