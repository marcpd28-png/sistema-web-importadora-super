import { cleanWhatsappNumber } from "@/lib/utils";

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
  provider: "manychat" | "meta-cloud";
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
  const provider = process.env.WHATSAPP_PROVIDER?.trim();

  if (provider === "manychat") {
    return Boolean(process.env.MANYCHAT_API_KEY?.trim());
  }

  return Boolean(
    provider === "meta-cloud" &&
      process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
}

export async function sendWhatsappTextMessage(
  input: WhatsappTextMessageInput,
): Promise<WhatsappSendResult> {
  const provider = process.env.WHATSAPP_PROVIDER?.trim();

  if (provider !== "meta-cloud") {
    throw new Error("El centro de mensajes requiere WHATSAPP_PROVIDER=meta-cloud.");
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!accessToken || !phoneNumberId) {
    throw new Error("Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID para enviar por WhatsApp API.");
  }

  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v22.0";
  const to = normalizeWhatsappRecipient(input.to);

  if (!to) {
    throw new Error("No hay un número destino válido para WhatsApp API.");
  }

  const response = await postMetaMessage(graphVersion, phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      body: input.body,
      preview_url: input.previewUrl ?? false,
    },
  });

  return {
    messageId: getMetaMessageId(response),
    ok: true,
    provider: "meta-cloud",
    response,
  };
}

export async function sendQuotePdfToWhatsapp(
  input: QuotePdfNotificationInput,
): Promise<WhatsappSendResult> {
  const provider = process.env.WHATSAPP_PROVIDER?.trim();

  if (provider === "manychat") {
    return sendQuotePdfToManychat(input);
  }

  if (provider !== "meta-cloud") {
    throw new Error("No hay un proveedor de WhatsApp API soportado configurado.");
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!accessToken || !phoneNumberId) {
    throw new Error("Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID para enviar por WhatsApp API.");
  }

  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v22.0";
  const to = normalizeWhatsappRecipient(input.to);

  if (!to) {
    throw new Error("No hay un número destino válido para la alerta de WhatsApp.");
  }

  try {
    const documentResponse = await postMetaMessage(graphVersion, phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: {
        link: input.pdfUrl,
        caption: input.bodyText,
        filename: input.filename,
      },
    });

    return {
      messageId: getMetaMessageId(documentResponse),
      ok: true,
      provider: "meta-cloud",
      response: documentResponse,
    };
  } catch (error) {
    if (!input.fallbackText) {
      throw error;
    }

    const textResponse = await postMetaMessage(graphVersion, phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        body: input.fallbackText,
        preview_url: false,
      },
    });

    return {
      messageId: getMetaMessageId(textResponse),
      ok: true,
      provider: "meta-cloud",
      response: textResponse,
    };
  }
}

async function sendQuotePdfToManychat(
  input: QuotePdfNotificationInput,
): Promise<WhatsappSendResult> {
  const apiKey = process.env.MANYCHAT_API_KEY?.trim();
  const apiBaseUrl = process.env.MANYCHAT_API_BASE_URL?.trim() || "https://api.manychat.com";

  if (!apiKey) {
    throw new Error("Falta configurar MANYCHAT_API_KEY para usar ManyChat.");
  }

  const to = normalizeWhatsappRecipient(input.to);

  if (!to) {
    throw new Error("No hay un número destino válido para la alerta de ManyChat.");
  }

  const firstName = splitContactName(input.contactName).firstName;
  const lastName = splitContactName(input.contactName).lastName;
  const consentPhrase = "Solicitud de cotización desde Importaciones Super";
  const subscriber = await createManychatSubscriber(apiBaseUrl, apiKey, {
    consentPhrase,
    email: null,
    firstName,
    lastName,
    phone: to,
    whatsappPhone: to,
  });

  const subscriberId = getManychatSubscriberId(subscriber);

  if (!subscriberId) {
    throw new Error("Manychat no devolvió un subscriber_id válido para el contacto.");
  }

  const flowNs = await resolveManychatFlowNs(apiBaseUrl, apiKey);

  if (flowNs) {
    const flowResponse = await postManychatFlow(apiBaseUrl, apiKey, {
      flow_ns: flowNs,
      subscriber_id: Number(subscriberId),
    });

    return {
      messageId: getManychatMessageId(flowResponse),
      ok: true,
      provider: "manychat",
      response: {
        flowResponse,
        subscriber,
      },
    };
  }

  const messageTag = process.env.MANYCHAT_MESSAGE_TAG?.trim() || "POST_PURCHASE_UPDATE";
  const contentResponse = await postManychatMessage(apiBaseUrl, apiKey, {
    message_tag: messageTag,
    subscriber_id: Number(subscriberId),
    data: {
      version: "v2",
      content: {
        actions: [],
        messages: [
          {
            text: `${input.bodyText}\nPDF: ${input.pdfUrl}`,
            type: "text",
          },
        ],
        quick_replies: [],
      },
    },
  });

  return {
    messageId: getManychatMessageId(contentResponse),
    ok: true,
    provider: "manychat",
    response: {
      subscriber,
      contentResponse,
    },
  };
}

async function resolveManychatFlowNs(apiBaseUrl: string, apiKey: string) {
  const configured = process.env.MANYCHAT_FLOW_NS?.trim();

  if (configured) {
    return configured;
  }

  const response = await fetch(`${apiBaseUrl}/fb/page/getFlows`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok || !payload || typeof payload !== "object") {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  const rawFlows = Array.isArray(data)
    ? data
    : Array.isArray((data as { flows?: unknown } | null)?.flows)
      ? (data as { flows: unknown[] }).flows
      : [];

  if (!rawFlows.length) {
    return null;
  }

  const flows = rawFlows
    .map((flow) => {
      if (!flow || typeof flow !== "object") {
        return null;
      }

      const record = flow as Record<string, unknown>;
      const ns = typeof record.ns === "string" ? record.ns.trim() : "";
      const name = typeof record.name === "string" ? record.name.trim() : "";

      if (!ns || !name) {
        return null;
      }

      return { name, ns };
    })
    .filter((flow): flow is { name: string; ns: string } => Boolean(flow));

  const prioritized =
    flows.find((flow) => /cotiz|quote|pre\s*venta|preventa/i.test(flow.name)) ??
    flows.find((flow) => /whats|pdf|asesor|venta/i.test(flow.name)) ??
    null;

  return prioritized?.ns ?? null;
}

async function postMetaMessage(
  graphVersion: string,
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? extractMetaErrorMessage((payload as { error?: unknown }).error)
        : `WhatsApp API respondió HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

function extractMetaErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "No se pudo enviar el mensaje por WhatsApp API.";
  }

  const record = error as Record<string, unknown>;

  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  return "No se pudo enviar el mensaje por WhatsApp API.";
}

function getMetaMessageId(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const messages = (payload as { messages?: unknown }).messages;

  if (!Array.isArray(messages) || !messages.length) {
    return null;
  }

  const first = messages[0];

  if (!first || typeof first !== "object") {
    return null;
  }

  return typeof (first as { id?: unknown }).id === "string" ? (first as { id: string }).id : null;
}

async function createManychatSubscriber(
  apiBaseUrl: string,
  apiKey: string,
  input: {
    consentPhrase: string;
    email: string | null;
    firstName: string;
    lastName: string;
    phone: string;
    whatsappPhone: string;
  },
) {
  const response = await fetch(`${apiBaseUrl}/fb/subscriber/createSubscriber`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      consent_phrase: input.consentPhrase,
      email: input.email ?? undefined,
      first_name: input.firstName || undefined,
      last_name: input.lastName || undefined,
      phone: input.phone || undefined,
      whatsapp_phone: input.whatsappPhone,
      has_opt_in_email: Boolean(input.email),
      has_opt_in_sms: false,
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (response.ok) {
    return payload;
  }

  const existingSubscriberId = await findManychatSubscriberIdByPhone(apiBaseUrl, apiKey, input.phone);

  if (existingSubscriberId) {
    return { data: [{ id: existingSubscriberId }] };
  }

  const validationMessage = extractManychatValidationMessage(payload);

  if (validationMessage?.includes("Permission denied to import phone")) {
    throw new Error(
      "ManyChat bloqueó la importación del número por API. El contacto debe escribir primero al WhatsApp conectado o ManyChat debe habilitar la importación de contactos.",
    );
  }

  if (validationMessage?.includes("This WhatsApp ID already exists")) {
    throw new Error(
      "ManyChat informó que el número ya existe, pero no quedó accesible por API. Necesitas que ese contacto haya interactuado antes con el WhatsApp conectado o que ManyChat habilite su importación.",
    );
  }

  const message =
    payload && typeof payload === "object" && "error" in payload
      ? extractMetaErrorMessage((payload as { error?: unknown }).error)
      : `Manychat respondió HTTP ${response.status}.`;

  throw new Error(message);
}

async function findManychatSubscriberIdByPhone(apiBaseUrl: string, apiKey: string, phone: string) {
  const response = await fetch(
    `${apiBaseUrl}/fb/subscriber/findBySystemField?phone=${encodeURIComponent(phone)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok || !payload || typeof payload !== "object") {
    return null;
  }

  const data = (payload as { data?: unknown }).data;

  if (!Array.isArray(data) || !data.length) {
    return null;
  }

  const first = data[0];

  if (!first || typeof first !== "object") {
    return null;
  }

  const id = (first as { id?: unknown }).id;

  return typeof id === "number" || typeof id === "string" ? String(id) : null;
}

async function postManychatMessage(
  apiBaseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${apiBaseUrl}/fb/sending/sendContent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? extractMetaErrorMessage((payload as { error?: unknown }).error)
        : `Manychat respondió HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

async function postManychatFlow(
  apiBaseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${apiBaseUrl}/fb/sending/sendFlow`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? extractMetaErrorMessage((payload as { error?: unknown }).error)
        : `Manychat respondió HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

function getManychatSubscriberId(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const directId = (payload as { id?: unknown }).id;

  if (typeof directId === "number" || typeof directId === "string") {
    return String(directId);
  }

  const data = (payload as { data?: unknown }).data;

  if (Array.isArray(data) && data.length) {
    const first = data[0];

    if (first && typeof first === "object") {
      const id = (first as { id?: unknown }).id;
      if (typeof id === "number" || typeof id === "string") {
        return String(id);
      }
    }
  }

  return null;
}

function getManychatMessageId(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const directId = (payload as { message_id?: unknown; id?: unknown }).message_id ?? (payload as { id?: unknown }).id;

  if (typeof directId === "number" || typeof directId === "string") {
    return String(directId);
  }

  return null;
}

function extractManychatValidationMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const details = (payload as { details?: unknown }).details;

  if (!details || typeof details !== "object") {
    return null;
  }

  const messages = (details as { messages?: unknown }).messages;

  if (!messages || typeof messages !== "object") {
    return null;
  }

  const waId = (messages as { wa_id?: unknown }).wa_id;

  if (waId && typeof waId === "object") {
    const text = (waId as { message?: unknown }).message;
    if (Array.isArray(text) && text.length && typeof text[0] === "string") {
      return text[0];
    }
  }

  const warning = (messages as { warning?: unknown }).warning;

  if (warning && typeof warning === "object") {
    const text = (warning as { message?: unknown }).message;
    if (Array.isArray(text) && text.length && typeof text[0] === "string") {
      return text[0];
    }
  }

  return null;
}

function splitContactName(value?: string | null) {
  const normalized = value?.trim() || "";

  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const [firstName, ...rest] = normalized.split(/\s+/);

  return {
    firstName,
    lastName: rest.join(" ").trim(),
  };
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
