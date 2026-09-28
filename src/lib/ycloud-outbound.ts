import { N8nOutboundError } from "@/lib/n8n-outbound";

export type YCloudOutboundMessageType = "text" | "image" | "video" | "document" | "audio";

export type YCloudOutboundMessageInput = {
  content: string;
  mediaUrl?: string | null;
  recipient: string;
  type: YCloudOutboundMessageType;
};

export type YCloudOutboundMessageResult = {
  messageId: string;
  provider: "ycloud";
};

// Encola el mensaje y permite que el webhook whatsapp.message.updated refleje su estado.
const Y_CLOUD_SEND_URL = "https://api.ycloud.com/v2/whatsapp/messages";

function requiredConfig() {
  const apiKey = process.env.YCLOUD_API_KEY?.trim();
  const from = process.env.YCLOUD_WHATSAPP_FROM?.trim();

  if (!apiKey || !from) {
    throw new N8nOutboundError(
      "YCloud no está configurado para envíos. Falta YCLOUD_API_KEY o YCLOUD_WHATSAPP_FROM.",
      { code: "YCLOUD_CONFIGURATION_MISSING", statusCode: 503 },
    );
  }

  return { apiKey, from };
}

function buildMessage(input: YCloudOutboundMessageInput) {
  if (input.type === "text") {
    return { type: "text", text: { body: input.content } };
  }

  if (!input.mediaUrl) {
    throw new N8nOutboundError("Se requiere una URL pública para enviar este archivo.", {
      code: "YCLOUD_MEDIA_URL_MISSING", statusCode: 422,
    });
  }

  const media = input.type === "document"
    ? { link: input.mediaUrl, caption: input.content || undefined }
    : { link: input.mediaUrl, caption: input.content || undefined };

  return { type: input.type, [input.type]: media };
}

export async function sendYCloudOutboundMessage(
  input: YCloudOutboundMessageInput,
): Promise<YCloudOutboundMessageResult> {
  const { apiKey, from } = requiredConfig();
  let response: Response;

  try {
    response = await fetch(Y_CLOUD_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ from, to: input.recipient, ...buildMessage(input) }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new N8nOutboundError("No se pudo conectar con YCloud para enviar el mensaje.", {
      code: "YCLOUD_UNAVAILABLE", statusCode: 502,
    });
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = typeof payload?.message === "string" ? payload.message : "YCloud rechazó el envío.";
    throw new N8nOutboundError(detail, {
      code: "YCLOUD_REJECTED", statusCode: 502,
    });
  }

  const messageId = typeof payload?.wamid === "string"
    ? payload.wamid
    : typeof payload?.id === "string"
      ? payload.id
      : null;

  if (!messageId) {
    throw new N8nOutboundError("YCloud respondió sin identificador de mensaje.", {
      code: "YCLOUD_INVALID_RESPONSE", statusCode: 502,
    });
  }

  return { messageId, provider: "ycloud" };
}
