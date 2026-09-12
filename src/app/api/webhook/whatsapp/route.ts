import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processIncomingMessage, processWhatsappStatusUpdate } from "@/lib/messages-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getString(record: JsonRecord | null, key: string) {
  const value = record?.[key];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getMetaTimestamp(value: string | null) {
  if (!value) {
    return new Date().toISOString();
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return new Date().toISOString();
  }

  const date = numeric > 100000000000 ? new Date(numeric) : new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mapMetaMessageType(type: string | null) {
  switch (type) {
    case "audio":
      return "AUDIO";
    case "contacts":
      return "CONTACT";
    case "document":
      return "DOCUMENT";
    case "image":
      return "IMAGE";
    case "location":
      return "LOCATION";
    case "text":
      return "TEXT";
    case "video":
      return "VIDEO";
    default:
      return "UNKNOWN";
  }
}

function getInteractiveText(interactive: JsonRecord | null) {
  const buttonReply = asRecord(interactive?.button_reply);
  const listReply = asRecord(interactive?.list_reply);
  return getString(buttonReply, "title") ?? getString(listReply, "title") ?? getString(buttonReply, "id") ?? getString(listReply, "id");
}

function getMessageContent(message: JsonRecord, type: string | null) {
  if (type === "text") {
    return getString(asRecord(message.text), "body") ?? "";
  }

  if (type === "button") {
    const button = asRecord(message.button);
    return getString(button, "text") ?? getString(button, "payload") ?? "Botón recibido";
  }

  if (type === "interactive") {
    return getInteractiveText(asRecord(message.interactive)) ?? "Respuesta interactiva recibida";
  }

  if (type === "image" || type === "video" || type === "document" || type === "audio") {
    const media = asRecord(message[type]);
    return getString(media, "caption") ?? `${mapMetaMessageType(type).toLowerCase()} recibido`;
  }

  if (type === "location") {
    const location = asRecord(message.location);
    const latitude = getString(location, "latitude");
    const longitude = getString(location, "longitude");
    return latitude && longitude ? `Ubicación: ${latitude}, ${longitude}` : "Ubicación recibida";
  }

  return "Mensaje recibido";
}

function findContactName(contacts: unknown[], waId: string) {
  for (const item of contacts) {
    const contact = asRecord(item);
    if (getString(contact, "wa_id") !== waId) {
      continue;
    }

    const profileName = getString(asRecord(contact?.profile), "name");
    if (profileName) {
      return profileName;
    }
  }

  return waId;
}


export function extractMetaStatuses(payload: unknown) {
  const statuses = [];
  const entries = payload?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (value?.statuses) {
        for (const st of value.statuses) {
          statuses.push({
            id: st.id,
            status: st.status,
            timestamp: st.timestamp,
            errors: st.errors || []
          });
        }
      }
    }
  }
  return statuses;
}

function extractMessages(payload: unknown) {
  const body = asRecord(payload);
  const entries = asArray(body?.entry);
  const messages: Array<{
    contacts: unknown[];
    message: JsonRecord;
    phoneNumberId: string | null;
  }> = [];

  for (const entry of entries) {
    const changes = asArray(asRecord(entry)?.changes);

    for (const change of changes) {
      const value = asRecord(asRecord(change)?.value);
      const phoneNumberId = getString(asRecord(value?.metadata), "phone_number_id");
      const contacts = asArray(value?.contacts);

      for (const rawMessage of asArray(value?.messages)) {
        const message = asRecord(rawMessage);

        if (message) {
          messages.push({ contacts, message, phoneNumberId });
        }
      }
    }
  }

  return messages;
}

function verifyMetaSignature(request: NextRequest, rawBody: string) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
  const allowUnsigned = process.env.ALLOW_UNSIGNED_META_WEBHOOKS === "true";
  const isProduction = process.env.NODE_ENV === "production";

  if (!appSecret) {
    if (allowUnsigned && !isProduction) {
      return true;
    }
    // Fail closed: without a secret, we can't verify, so we must reject
    throw new Error("MISSING_APP_SECRET");
  }

  const signature = request.headers.get("x-hub-signature-256")?.replace(/^sha256=/, "");

  if (!signature) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && challenge && expectedToken && token === expectedToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  try {
    if (!verifyMetaSignature(request, rawBody)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  } catch (err: unknown) {
    if ((err as Error)?.message === "MISSING_APP_SECRET") {
      return NextResponse.json({ error: "Server configuration error: missing App Secret" }, { status: 503 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const messages = extractMessages(payload);
  const results = [];

  const statuses = extractMetaStatuses(payload);
  for (const st of statuses) {
    results.push(
      processWhatsappStatusUpdate({
        externalMessageId: st.id,
        status: st.status,
        timestamp: st.timestamp,
        errors: st.errors,
      }).catch(err => {
        console.error("Error processing status update:", err);
      })
    );
  }


  for (const { contacts, message, phoneNumberId } of messages) {
    const from = getString(message, "from");
    const id = getString(message, "id");

    if (!from || !id) {
      continue;
    }

    const type = getString(message, "type");
    const result = await processIncomingMessage({
      channel: "WHATSAPP",
      content: getMessageContent(message, type),
      externalContactId: from,
      externalMessageId: id,
      metadata: {
        message,
        phoneNumberId,
        source: "meta-whatsapp-cloud-api",
      },
      name: findContactName(contacts, from),
      phone: from,
      timestamp: getMetaTimestamp(getString(message, "timestamp")),
      type: mapMetaMessageType(type),
    });

    results.push(result);
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
