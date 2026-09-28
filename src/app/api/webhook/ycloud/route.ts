import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { MessageType, Prisma } from "@prisma/client";
import { N8nAutomationProvider } from "@/lib/automations/n8n-provider";
import { processIncomingMessage } from "@/lib/messages-service";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function messageContent(message: JsonRecord, type: string | null, direction: "inbound" | "outbound" = "inbound") {
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
  const action = direction === "outbound" ? "enviado" : "recibido";
  return text(media?.caption) ?? (type ? `${type} ${action}` : `Mensaje ${action}`);
}

function messageMediaUrl(message: JsonRecord, type: string | null) {
  if (!type) return null;
  return text(asRecord(message[type])?.link);
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
  const receivedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function processInbound(event: JsonRecord) {
  const message = asRecord(event.whatsappInboundMessage);
  if (!message) return null;

  const from = text(message.from);
  const externalMessageId = text(message.wamid) ?? text(message.id);
  if (!from || !externalMessageId) return null;

  const type = text(message.type);
  const profile = asRecord(message.customerProfile);
  const content = messageContent(message, type);
  const result = await processIncomingMessage({
    channel: "WHATSAPP",
    content,
    externalContactId: from,
    externalMessageId,
    mediaUrl: messageMediaUrl(message, type),
    metadata: {
      provider: "ycloud",
      eventId: text(event.id),
      inboundMessageId: text(message.id),
      fromUserId: text(message.fromUserId),
      raw: message,
    },
    name: text(profile?.name) ?? from,
    phone: from,
    timestamp: text(message.sendTime) ?? text(event.createTime) ?? new Date().toISOString(),
    type: messageType(type),
  });

  if (result.ok && !result.duplicate && result.conversation?.botEnabled) {
    try {
      const automation = await prisma.automation.findFirst({
        where: { channel: "WHATSAPP", status: "ACTIVE" },
        include: {
          versions: {
            where: { status: "PUBLISHED" },
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });

      const version = automation?.versions[0];
      if (automation && version) {
        const execution = await prisma.automationExecution.create({
          data: {
            automationId: automation.id,
            automationVersionId: version.id,
            conversationId: result.conversationId,
            messageId: result.messageId,
            status: "RUNNING",
            correlationId: `${result.conversationId}-${result.messageId}`,
          },
        });

        await N8nAutomationProvider.triggerWebhook("wh-1", {
          contactId: result.contactId,
          conversationId: result.conversationId,
          messageId: result.messageId,
          executionId: execution.id,
          content,
          phone: from,
          metadata: message,
        });
      }
    } catch (error) {
      console.error("YCloud automation routing error:", error);
    }
  }

  return result;
}

async function applyStatus(event: JsonRecord) {
  const message = asRecord(event.whatsappMessage);
  const status = text(message?.status);
  const ids = [text(message?.wamid), text(message?.id)].filter((id): id is string => Boolean(id));
  if (!message || !ids.length || !status) return;

  const existing = await prisma.chatMessage.findFirst({
    where: { externalMessageId: { in: ids } },
  });

  if (existing) {
    await prisma.chatMessage.update({
      where: { id: existing.id },
      data: { status },
    });
    return;
  }

  const recipient = text(message.to);
  const phoneNormalized = normalizeWhatsappPhone(recipient);
  if (!recipient || !phoneNormalized) return;

  let contact = await prisma.chatContact.findFirst({
    where: {
      channel: "WHATSAPP",
      NOT: { externalId: { startsWith: "SIMULATOR:" } },
      OR: [
        { phoneNormalized },
        { phone: { contains: phoneNormalized } },
        { externalId: recipient },
      ],
    },
  });

  if (!contact) {
    const profile = asRecord(message.customerProfile);
    contact = await prisma.chatContact.create({
      data: {
        channel: "WHATSAPP",
        externalId: recipient,
        name: text(profile?.name) ?? recipient,
        phone: recipient,
        phoneNormalized,
      },
    });
  }

  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, channel: "WHATSAPP", status: { not: "CERRADO" } },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { contactId: contact.id, channel: "WHATSAPP", status: "ATENDIENDO", botEnabled: false },
    });
  }

  const timestamp = new Date(text(message.sendTime) ?? text(message.createTime) ?? text(event.createTime) ?? Date.now());
  const synced = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      externalMessageId: ids[0],
      direction: "OUTBOUND",
      senderType: "AGENT",
      messageType: messageType(message.type),
      content: messageContent(message, text(message.type), "outbound"),
      mediaUrl: messageMediaUrl(message, text(message.type)),
      metadata: { provider: "ycloud", source: "ycloud_console", eventId: text(event.id), raw: message } as Prisma.InputJsonValue,
      status,
      createdAt: timestamp,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: timestamp, botEnabled: false, status: "ATENDIENDO" },
  });
  triggerPusherEvent(`chat-${conversation.id}`, "new-message", synced);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("ycloud-signature"))) {
    return NextResponse.json({ error: "Invalid YCloud webhook signature" }, { status: 401 });
  }

  let event: JsonRecord | null;
  try {
    event = asRecord(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!event) return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });

  if (event.type === "whatsapp.inbound_message.received") {
    const result = await processInbound(event);
    return NextResponse.json({ received: true, processed: Boolean(result), duplicate: result?.duplicate ?? false });
  }

  if (event.type === "whatsapp.message.updated") {
    await applyStatus(event);
  }

  return NextResponse.json({ received: true });
}
