import type { MessageType } from "@prisma/client";

type MediaMessage = {
  messageType: string;
  mediaUrl?: string | null;
  metadata?: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function safeMessageMediaUrl(value: unknown) {
  const url = text(value);
  if (!url) return null;
  // Local uploads are also used by the message composer.
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : null;
  } catch {
    return null;
  }
}

export function getMessageMedia(message: MediaMessage) {
  const metadata = record(message.metadata);
  const raw = Object.keys(record(metadata.message)).length ? record(metadata.message) : metadata;
  const media = record(metadata.media);
  let type = message.messageType as MessageType;
  // Recover messages already saved before audio/sticker support was added.
  if (["TEXT", "UNKNOWN", "IMAGE"].includes(type)) {
    const rawType = text(raw.type)?.toLowerCase();
    if (rawType === "sticker" || Object.keys(record(raw.sticker)).length) type = "STICKER";
    else if (type !== "IMAGE" && (rawType === "audio" || Object.keys(record(raw.audio)).length)) type = "AUDIO";
  }
  const attachment = record(raw[type.toLowerCase()]);

  return {
    type,
    url: safeMessageMediaUrl(message.mediaUrl)
      ?? safeMessageMediaUrl(metadata.mediaUrl)
      ?? safeMessageMediaUrl(media.url)
      ?? safeMessageMediaUrl(attachment.url)
      ?? safeMessageMediaUrl(attachment.link),
    mediaId: text(metadata.mediaId) ?? text(media.id) ?? text(attachment.id),
    phoneNumberId: text(metadata.phoneNumberId) ?? text(record(metadata.metadata).phone_number_id),
    mimeType: text(media.mimeType) ?? text(attachment.mime_type),
  };
}

export function getMessageMediaSrc(message: MediaMessage & { id: string }) {
  const media = getMessageMedia(message);
  // Meta webhook URLs require authorization and expire. Resolve them on the
  // server whenever the original media ID is available, including old messages.
  return media.mediaId ? `/api/admin/messages/${encodeURIComponent(message.id)}/media` : media.url;
}
