export class YCloudOutboundError extends Error {
  readonly code: string;
  readonly statusCode: number;
  requestId?: string;
  messageId?: string;

  constructor(message: string, options: { code: string; statusCode: number }) {
    super(message);
    this.name = "YCloudOutboundError";
    this.code = options.code;
    this.statusCode = options.statusCode;
  }

  withContext(context: { requestId: string; messageId: string }) {
    this.requestId = context.requestId;
    this.messageId = context.messageId;
    return this;
  }
}

export type YCloudOutboundMessageType = "text" | "image" | "video" | "document" | "audio";

export type YCloudOutboundMessageInput = {
  externalId?: string;
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
  const from = normalizeYCloudPhone(process.env.YCLOUD_WHATSAPP_FROM);

  if (!apiKey || !from) {
    throw new YCloudOutboundError(
      "YCloud no está configurado para envíos. Falta YCLOUD_API_KEY o YCLOUD_WHATSAPP_FROM.",
      { code: "YCLOUD_CONFIGURATION_MISSING", statusCode: 503 },
    );
  }

  return { apiKey, from };
}

export function normalizeYCloudPhone(value: string | null | undefined) {
  const digits = value?.replace(/[^\d]/g, "") ?? "";
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}

function buildMessage(input: YCloudOutboundMessageInput) {
  if (input.type === "text") {
    return { type: "text", text: { body: input.content } };
  }

  if (!input.mediaUrl) {
    throw new YCloudOutboundError("Se requiere una URL pública para enviar este archivo.", {
      code: "YCLOUD_MEDIA_URL_MISSING", statusCode: 422,
    });
  }

  const media = input.type === "audio"
    ? { link: input.mediaUrl }
    : { link: input.mediaUrl, caption: input.content || undefined };

  return { type: input.type, [input.type]: media };
}

export async function sendYCloudOutboundMessage(
  input: YCloudOutboundMessageInput,
): Promise<YCloudOutboundMessageResult> {
  const { apiKey, from } = requiredConfig();
  const to = normalizeYCloudPhone(input.recipient);
  if (!to) {
    throw new YCloudOutboundError("El destinatario no tiene un número internacional válido para YCloud.", {
      code: "INVALID_RECIPIENT",
      statusCode: 400,
    });
  }
  let response: Response;

  try {
    response = await fetch(Y_CLOUD_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ from, to, externalId: input.externalId, ...buildMessage(input) }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new YCloudOutboundError("No se pudo conectar con YCloud para enviar el mensaje.", {
      code: "YCLOUD_UNAVAILABLE", statusCode: 502,
    });
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const nestedError = payload?.error && typeof payload.error === "object"
      ? payload.error as Record<string, unknown>
      : null;
    const detail = typeof payload?.message === "string"
      ? payload.message
      : typeof nestedError?.message === "string"
        ? nestedError.message
        : "YCloud rechazó el envío.";
    throw new YCloudOutboundError(detail, {
      code: "YCLOUD_REJECTED", statusCode: 502,
    });
  }

  const messageId = typeof payload?.wamid === "string"
    ? payload.wamid
    : typeof payload?.id === "string"
      ? payload.id
      : null;

  if (!messageId) {
    throw new YCloudOutboundError("YCloud respondió sin identificador de mensaje.", {
      code: "YCLOUD_INVALID_RESPONSE", statusCode: 502,
    });
  }

  return { messageId, provider: "ycloud" };
}
