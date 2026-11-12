import { createHmac, timingSafeEqual } from "crypto";
import { MessageType } from "@prisma/client";
import { processIncomingMessage } from "@/lib/messages-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 512_000;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function messageType(value: unknown): MessageType {
  switch (text(value)) {
    case "audio": return "AUDIO";
    case "contacts": return "CONTACT";
    case "document": return "DOCUMENT";
    case "image": return "IMAGE";
    case "location": return "LOCATION";
    case "text": return "TEXT";
    case "video": return "VIDEO";
    default: return "UNKNOWN";
  }
}

function messageContent(message: JsonRecord, type: string | null) {
  if (type === "text") return text(asRecord(message.text)?.body) ?? "";
  if (type === "button") return text(asRecord(message.button)?.text) ?? "Botón recibido";
  if (type === "interactive") {
    const interactive = asRecord(message.interactive);
    return text(asRecord(interactive?.button_reply)?.title)
      ?? text(asRecord(interactive?.list_reply)?.title)
      ?? "Respuesta interactiva recibida";
  }
  if (type === "location") {
    const location = asRecord(message.location);
    const latitude = text(location?.latitude);
    const longitude = text(location?.longitude);
    return latitude && longitude ? `Ubicación: ${latitude}, ${longitude}` : "Ubicación recibida";
  }
  const media = type ? asRecord(message[type]) : null;
  return text(media?.caption) ?? (type ? `${type} recibido` : "Mensaje recibido");
}

function messageMediaUrl(message: JsonRecord, type: string | null) {
  return type ? text(asRecord(message[type])?.link) : null;
}

function verifySignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;

  const attributes = Object.fromEntries(signatureHeader.split(",").map((entry) => {
    const [key, ...value] = entry.trim().split("=");
    return [key, value.join("=")];
  }));
  const timestamp = attributes.t;
  const signature = attributes.s;
  if (!timestamp || !signature || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

async function processInbound(event: JsonRecord) {
  const message = asRecord(event.whatsappInboundMessage);
  if (!message) return null;

  const from = text(message.from);
  const externalMessageId = text(message.wamid) ?? text(message.id);
  if (!from || !externalMessageId) return null;

  const type = text(message.type);
  const profile = asRecord(message.customerProfile);
  return processIncomingMessage({
    channel: "WHATSAPP",
    content: messageContent(message, type),
    externalContactId: from,
    externalMessageId,
    mediaUrl: messageMediaUrl(message, type),
    metadata: {
      provider: "ycloud",
      eventId: text(event.id),
      inboundMessageId: text(message.id),
      fromUserId: text(message.fromUserId),
    },
    name: text(profile?.name) ?? from,
    phone: from,
    timestamp: text(message.sendTime) ?? text(event.createTime) ?? new Date().toISOString(),
    type: messageType(type),
  });
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Evento demasiado grande" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return Response.json({ error: "Evento demasiado grande" }, { status: 413 });
  }
  if (!verifySignature(rawBody, request.headers.get("ycloud-signature"))) {
    return Response.json({ error: "Firma de YCloud inválida" }, { status: 401 });
  }

  let event: JsonRecord | null;
  try {
    event = asRecord(JSON.parse(rawBody));
  } catch {
    return Response.json({ error: "Evento JSON inválido" }, { status: 400 });
  }
  if (!event) return Response.json({ error: "Evento inválido" }, { status: 400 });

  try {
    if (event.type !== "whatsapp.inbound_message.received") return Response.json({ received: true });
    const result = await processInbound(event);
    return Response.json({ received: true, processed: Boolean(result), duplicate: result?.duplicate ?? false });
  } catch (error) {
    // A non-2xx response tells YCloud to retry a message that was not stored.
    console.error("ycloud_inbound_failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "No se pudo guardar el mensaje" }, { status: 503 });
  }
}
