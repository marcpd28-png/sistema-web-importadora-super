import type { ChatMessage } from "@/types/messages";

export type MessageReply = {
  id: string;
  content: string;
  senderType: string;
};

export function createMessageReply(message: ChatMessage): MessageReply {
  const labels: Record<string, string> = { IMAGE: "Imagen", VIDEO: "Video", AUDIO: "Audio", DOCUMENT: "Documento" };
  return { id: message.id, content: message.content || labels[message.messageType] || "Mensaje", senderType: message.senderType };
}

export function readMessageReply(metadata: unknown): MessageReply | null {
  if (!metadata || typeof metadata !== "object" || !("replyTo" in metadata)) return null;
  const reply = metadata.replyTo;
  if (!reply || typeof reply !== "object" || !("id" in reply) || !("content" in reply) || !("senderType" in reply)) return null;
  return typeof reply.id === "string" && typeof reply.content === "string" && typeof reply.senderType === "string"
    ? { id: reply.id, content: reply.content, senderType: reply.senderType } : null;
}
