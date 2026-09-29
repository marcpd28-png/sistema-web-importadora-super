import { cleanWhatsappNumber } from "@/lib/utils";
import { sendYCloudOutboundMessage } from "@/lib/ycloud-outbound";

type QuotePdfNotificationInput = {
  bodyText: string;
  contactName?: string | null;
  fallbackText?: string | null;
  filename: string;
  pdfUrl: string;
  to: string;
};

export type WhatsappSendResult = {
  messageId: string | null;
  ok: boolean;
  provider: "ycloud";
  response: unknown;
};

type WhatsappTextMessageInput = {
  body: string;
  previewUrl?: boolean;
  to: string;
};

export function getWhatsappAlertTarget(defaultNumber?: string | null) {
  const configured =
    process.env.WHATSAPP_ALERT_NUMBER?.trim() ||
    process.env.WHATSAPP_NOTIFICATION_NUMBER?.trim() ||
    defaultNumber?.trim() ||
    "";
  const cleaned = cleanWhatsappNumber(configured);
  return cleaned || null;
}

export function isWhatsappApiConfigured() {
  return Boolean(process.env.YCLOUD_API_KEY?.trim() && process.env.YCLOUD_WHATSAPP_FROM?.trim());
}

export async function sendWhatsappTextMessage(
  input: WhatsappTextMessageInput,
): Promise<WhatsappSendResult> {
  const to = normalizeWhatsappRecipient(input.to);

  if (!to) {
    throw new Error("No hay un número destino válido para WhatsApp API.");
  }

  const sent = await sendYCloudOutboundMessage({ content: input.body, recipient: to, type: "text" });

  return {
    messageId: sent.messageId,
    ok: true,
    provider: "ycloud",
    response: sent,
  };
}

export type WhatsappMediaMessageInput = {
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  mediaUrl: string;
  caption?: string;
  filename?: string;
  to: string;
};

export async function sendWhatsappMediaMessage(
  input: WhatsappMediaMessageInput,
): Promise<WhatsappSendResult> {
  const to = normalizeWhatsappRecipient(input.to);
  if (!to) {
    throw new Error("No hay un número destino válido para WhatsApp API.");
  }

  const mediaType = input.type === "IMAGE" ? "image" : input.type === "VIDEO" ? "video" : "document";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
  const absoluteUrl = input.mediaUrl.startsWith("http") ? input.mediaUrl : `${baseUrl}${input.mediaUrl}`;
  const sent = await sendYCloudOutboundMessage({ content: input.caption ?? "", mediaUrl: absoluteUrl, recipient: to, type: mediaType });

  return {
    messageId: sent.messageId,
    ok: true,
    provider: "ycloud",
    response: sent,
  };
}

export async function sendQuotePdfToWhatsapp(
  input: QuotePdfNotificationInput,
): Promise<WhatsappSendResult> {
  const to = normalizeWhatsappRecipient(input.to);

  if (!to) {
    throw new Error("No hay un número destino válido para la alerta de WhatsApp.");
  }

  try {
    const sent = await sendYCloudOutboundMessage({ content: input.bodyText, mediaUrl: input.pdfUrl, recipient: to, type: "document" });

    return {
      messageId: sent.messageId,
      ok: true,
      provider: "ycloud",
      response: sent,
    };
  } catch (error) {
    if (!input.fallbackText) {
      throw error;
    }

    const sent = await sendYCloudOutboundMessage({ content: input.fallbackText, recipient: to, type: "text" });

    return {
      messageId: sent.messageId,
      ok: true,
      provider: "ycloud",
      response: sent,
    };
  }
}

function normalizeWhatsappRecipient(value: string) {
  const digits = cleanWhatsappNumber(value);

  if (!digits) {
    return null;
  }

  if (digits.startsWith("51") && digits.length >= 11) {
    return digits;
  }

  if (digits.length === 9) {
    return `51${digits}`;
  }

  return digits;
}
