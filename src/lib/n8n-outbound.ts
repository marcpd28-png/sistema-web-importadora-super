import { randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizeWhatsappPhone } from "@/lib/utils";

const DEFAULT_TIMEOUT_MS = 12_000;

const n8nResponseSchema = z.object({
  ok: z.literal(true),
  provider: z.string().min(1),
  messageId: z.string().min(1).max(120),
});

export type N8nOutboundMessageType = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export type N8nOutboundMessageInput = {
  channel: "WHATSAPP";
  conversationId: string;
  recipient: string;
  content: string;
  type: N8nOutboundMessageType;
  mediaUrl?: string | null;
  agentId: string;
};

export type N8nOutboundMessageResult = {
  messageId: string;
  provider: string;
  requestId: string;
};

export class N8nOutboundError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly remoteStatus?: number;

  constructor(
    message: string,
    options: { code: string; statusCode: number; remoteStatus?: number },
  ) {
    super(message);
    this.name = "N8nOutboundError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.remoteStatus = options.remoteStatus;
  }
}

type SendOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function getRequiredConfig() {
  const webhookUrl = process.env.N8N_OUTBOUND_WEBHOOK_URL?.trim();
  const apiKey = process.env.N8N_OUTBOUND_API_KEY?.trim();

  if (!webhookUrl || !apiKey) {
    throw new N8nOutboundError(
      "El outbound n8n no está configurado en el servidor.",
      { code: "N8N_NOT_CONFIGURED", statusCode: 503 },
    );
  }

  return { apiKey, webhookUrl };
}

function getRemoteError(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) {
    return "n8n rechazó el envío outbound.";
  }

  const error = payload.error;
  return typeof error === "string" && error.trim()
    ? error.trim().slice(0, 240)
    : "n8n rechazó el envío outbound.";
}

export async function sendN8nOutboundMessage(
  input: N8nOutboundMessageInput,
  options: SendOptions = {},
): Promise<N8nOutboundMessageResult> {
  const { apiKey, webhookUrl } = getRequiredConfig();
  const recipient = normalizeWhatsappPhone(input.recipient);

  if (!recipient) {
    throw new N8nOutboundError(
      "La conversación no tiene un teléfono de WhatsApp válido.",
      { code: "INVALID_RECIPIENT", statusCode: 400 },
    );
  }

  const requestId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": apiKey,
      },
      body: JSON.stringify({
        channel: input.channel,
        conversationId: input.conversationId,
        recipient,
        content: input.content,
        type: input.type,
        mediaUrl: input.mediaUrl ?? null,
        agentId: input.agentId,
        requestId,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new N8nOutboundError(getRemoteError(payload), {
        code: "N8N_REMOTE_ERROR",
        statusCode: 502,
        remoteStatus: response.status,
      });
    }

    const parsed = n8nResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new N8nOutboundError(
        "n8n no confirmó la aceptación del mensaje por Meta.",
        { code: "N8N_INVALID_RESPONSE", statusCode: 502 },
      );
    }

    return {
      messageId: parsed.data.messageId,
      provider: parsed.data.provider,
      requestId,
    };
  } catch (error) {
    if (error instanceof N8nOutboundError) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new N8nOutboundError(
        "El webhook outbound de n8n agotó el tiempo de espera.",
        { code: "N8N_TIMEOUT", statusCode: 504 },
      );
    }

    throw new N8nOutboundError(
      "No se pudo contactar el webhook outbound de n8n.",
      { code: "N8N_UNAVAILABLE", statusCode: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
