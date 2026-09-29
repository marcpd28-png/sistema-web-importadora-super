import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { MessageType, Prisma } from "@prisma/client";
import { N8nAutomationProvider } from "@/lib/automations/n8n-provider";
import { getAutomationConversationContext, processIncomingMessage } from "@/lib/messages-service";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";
import { sendYCloudOutboundMessage } from "@/lib/ycloud-outbound";
import { buildPublicUrl } from "@/lib/site-url";
import { generateCatalogPdf, isGeneralCatalogRequest, parseCatalogRequest } from "@/lib/catalog-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

const WELCOME_MESSAGE = `¡Hola! 👋 Bienvenido a Importaciones Super.
Soy Rocky, tu asistente virtual.

Puedes ver nuestro catálogo completo en nuestra tienda virtual:
https://tiendavirtualsuper.com

Si buscas un catálogo específico en PDF, escríbeme por ejemplo: “catálogo parlantes JBL” y te lo envío.

Realizamos envíos por Shalom a todo el Perú. También puedes recoger tu pedido en nuestra tienda:

Avenida Abancay 752, Centro de Lima
Lun–Sáb: 8:00 a. m. – 8:00 p. m.
Dom: 9:00 a. m. – 8:00 p. m.

Si estás en Lima, también podemos coordinar el envío de tu pedido a domicilio por inDrive. El costo del delivery se coordina directamente contigo para que elijas la opción que más te convenga.

Si deseas hablar directamente con un asesor, escribe “solicito asesor” en cualquier momento de la conversación y un asesor atenderá tu chat.

¿Qué producto estás buscando hoy?`;
const LIMA_DELIVERY_MESSAGE = "¡Claro! Para coordinar tu delivery en Lima, indícame por favor el distrito y la dirección exacta de entrega.";
const GENERAL_CATALOG_MESSAGE = "¡Claro! Aquí tienes nuestro catálogo general con todos los productos disponibles: https://tiendavirtualsuper.com";
const SCREEN_EXTENDER_MESSAGE = "Estos son los modelos disponibles de extensores de pantalla: https://tiendavirtualsuper.com/?q=extensor+de+pantalla";
const PAYMENT_NOTICE_URL = buildPublicUrl("/uploads/communications/cuentas-autorizadas-importaciones-super.jpeg");
const PAYMENT_NOTICE_MESSAGE = "Gracias. Te comparto nuestras cuentas autorizadas y medios de pago. Por seguridad, realiza depósitos únicamente a las cuentas indicadas en este comunicado.";

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

async function sendWelcomeMessage(conversationId: string, recipient: string) {
  const sent = await sendYCloudOutboundMessage({
    content: WELCOME_MESSAGE,
    recipient,
    type: "text",
  });

  const welcome = await prisma.chatMessage.upsert({
    where: { externalMessageId: sent.messageId },
    create: {
      conversationId,
      direction: "OUTBOUND",
      senderType: "BOT",
      messageType: "TEXT",
      content: WELCOME_MESSAGE,
      externalMessageId: sent.messageId,
      metadata: { provider: sent.provider, source: "conversation_welcome" } as Prisma.InputJsonValue,
      status: "sent",
    },
    update: {
      conversationId,
      direction: "OUTBOUND",
      senderType: "BOT",
      messageType: "TEXT",
      content: WELCOME_MESSAGE,
      metadata: { provider: sent.provider, source: "conversation_welcome" } as Prisma.InputJsonValue,
      status: "sent",
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: welcome.createdAt },
  });
  triggerPusherEvent(`chat-${conversationId}`, "new-message", welcome);
}

function normalizedText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isLimaDeliveryRequest(content: string) {
  const normalized = normalizedText(content);
  const mentionsLima = /\blima\b/.test(normalized);
  const mentionsDelivery = /\b(delivery|entrega|envio|costo)\b/.test(normalized);
  return mentionsLima && mentionsDelivery;
}

function isScreenExtenderInquiry(content: string) {
  const normalized = normalizedText(content);
  return /\bextensor(?:es)?\b/.test(normalized)
    && /\bpantalla(?:s)?\b/.test(normalized);
}

function isNoProductMatchReply(content: string) {
  const normalized = normalizedText(content);
  return normalized.includes("no encontre una coincidencia clara")
    || normalized.includes("no encontramos productos")
    || normalized.includes("no encontre productos");
}

async function sendScreenExtenderOptions(conversationId: string, recipient: string) {
  const sent = await sendYCloudOutboundMessage({
    content: SCREEN_EXTENDER_MESSAGE,
    recipient,
    type: "text",
  });
  const reply = await prisma.chatMessage.upsert({
    where: { externalMessageId: sent.messageId },
    create: {
      conversationId,
      direction: "OUTBOUND",
      senderType: "BOT",
      messageType: "TEXT",
      content: SCREEN_EXTENDER_MESSAGE,
      externalMessageId: sent.messageId,
      metadata: { provider: sent.provider, source: "screen_extender_options" } as Prisma.InputJsonValue,
      status: "sent",
    },
    update: {
      content: SCREEN_EXTENDER_MESSAGE,
      senderType: "BOT",
      status: "sent",
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: reply.createdAt },
  });
  triggerPusherEvent(`chat-${conversationId}`, "new-message", reply);
}

async function sendCatalog(conversationId: string, recipient: string, content: string) {
  if (isGeneralCatalogRequest(content)) {
    const sent = await sendYCloudOutboundMessage({
      content: GENERAL_CATALOG_MESSAGE,
      recipient,
      type: "text",
    });
    const message = await prisma.chatMessage.upsert({
      where: { externalMessageId: sent.messageId },
      create: {
        conversationId, direction: "OUTBOUND", senderType: "BOT", messageType: "TEXT",
        content: GENERAL_CATALOG_MESSAGE, externalMessageId: sent.messageId,
        metadata: { provider: sent.provider, source: "general_catalog" } as Prisma.InputJsonValue,
        status: "sent",
      },
      update: { conversationId, senderType: "BOT", messageType: "TEXT", content: GENERAL_CATALOG_MESSAGE, status: "sent" },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: message.createdAt } });
    triggerPusherEvent(`chat-${conversationId}`, "new-message", message);
    return true;
  }

  const request = parseCatalogRequest(content);
  if (!request) return false;

  try {
    const catalog = await generateCatalogPdf(request);
    const caption = `Aquí tienes el PDF ${request.title.toLowerCase()} (${catalog.productCount} productos).`;
    const sent = await sendYCloudOutboundMessage({ content: caption, mediaUrl: catalog.absoluteUrl, recipient, type: "document" });
    const document = await prisma.chatMessage.upsert({
      where: { externalMessageId: sent.messageId },
      create: {
        conversationId, direction: "OUTBOUND", senderType: "BOT", messageType: "DOCUMENT", content: caption,
        mediaUrl: catalog.absoluteUrl, externalMessageId: sent.messageId,
        metadata: { provider: sent.provider, source: "requested_catalog", catalog: request.slug } as Prisma.InputJsonValue,
        status: "sent",
      },
      update: { conversationId, senderType: "BOT", messageType: "DOCUMENT", content: caption, mediaUrl: catalog.absoluteUrl, status: "sent" },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: document.createdAt } });
    triggerPusherEvent(`chat-${conversationId}`, "new-message", document);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No se pudo preparar el catálogo.";
    const reply = detail.startsWith("No encontramos")
      ? `${detail} Indícanos otra marca, modelo o categoría y te ayudamos.`
      : "No pude generar el PDF en este momento. Un asesor puede ayudarte si escribes “solicito asesor”.";
    console.error("YCloud catalog generation failed:", error);
    const sent = await sendYCloudOutboundMessage({ content: reply, recipient, type: "text" });
    const message = await prisma.chatMessage.upsert({
      where: { externalMessageId: sent.messageId },
      create: { conversationId, direction: "OUTBOUND", senderType: "BOT", messageType: "TEXT", content: reply, externalMessageId: sent.messageId, metadata: { provider: sent.provider, source: "requested_catalog_error" } as Prisma.InputJsonValue, status: "sent" },
      update: { content: reply, senderType: "BOT", status: "sent" },
    });
    triggerPusherEvent(`chat-${conversationId}`, "new-message", message);
  }
  return true;
}

async function sendPaymentNotice(conversationId: string, recipient: string) {
  const sent = await sendYCloudOutboundMessage({
    content: PAYMENT_NOTICE_MESSAGE,
    mediaUrl: PAYMENT_NOTICE_URL,
    recipient,
    type: "image",
  });

  const notice = await prisma.chatMessage.upsert({
    where: { externalMessageId: sent.messageId },
    create: {
      conversationId,
      direction: "OUTBOUND",
      senderType: "BOT",
      messageType: "IMAGE",
      content: PAYMENT_NOTICE_MESSAGE,
      mediaUrl: PAYMENT_NOTICE_URL,
      externalMessageId: sent.messageId,
      metadata: { provider: sent.provider, source: "lima_delivery_payment_notice" } as Prisma.InputJsonValue,
      status: "sent",
    },
    update: { content: PAYMENT_NOTICE_MESSAGE, mediaUrl: PAYMENT_NOTICE_URL, senderType: "BOT", status: "sent" },
  });
  triggerPusherEvent(`chat-${conversationId}`, "new-message", notice);
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
    if (isScreenExtenderInquiry(content)) {
      try {
        await sendScreenExtenderOptions(result.conversationId, from);
      } catch (error) {
        console.error("YCloud screen extender response failed:", error);
      }
      return result;
    }

    if (await sendCatalog(result.conversationId, from, content)) {
      return result;
    }

    const salesState = await prisma.conversationSalesState.findUnique({
      where: { conversationId: result.conversationId },
      select: { deliveryData: true, stage: true },
    });
    const awaitingAddress = salesState?.stage === "AWAITING_DELIVERY_DETAILS"
      && Boolean((salesState.deliveryData as JsonRecord | null)?.awaitingLimaAddress);

    if (awaitingAddress && content.trim()) {
      await prisma.conversationSalesState.update({
        where: { conversationId: result.conversationId },
        data: {
          stage: "AWAITING_PAYMENT_METHOD",
          deliveryData: { limaAddress: content, awaitingLimaAddress: false } as Prisma.InputJsonValue,
        },
      });
      try {
        await sendPaymentNotice(result.conversationId, from);
      } catch (error) {
        console.error("YCloud payment notice failed:", error);
      }
      return result;
    }

    if (isLimaDeliveryRequest(content)) {
      await prisma.conversationSalesState.upsert({
        where: { conversationId: result.conversationId },
        create: { conversationId: result.conversationId, stage: "AWAITING_DELIVERY_DETAILS", deliveryData: { awaitingLimaAddress: true } },
        update: { stage: "AWAITING_DELIVERY_DETAILS", deliveryData: { awaitingLimaAddress: true } },
      });
      try {
        const sent = await sendYCloudOutboundMessage({ content: LIMA_DELIVERY_MESSAGE, recipient: from, type: "text" });
        await prisma.chatMessage.upsert({
          where: { externalMessageId: sent.messageId },
          create: { conversationId: result.conversationId, direction: "OUTBOUND", senderType: "BOT", messageType: "TEXT", content: LIMA_DELIVERY_MESSAGE, externalMessageId: sent.messageId, metadata: { provider: sent.provider, source: "lima_delivery_address_request" } as Prisma.InputJsonValue, status: "sent" },
          update: { content: LIMA_DELIVERY_MESSAGE, senderType: "BOT", status: "sent" },
        });
      } catch (error) {
        console.error("YCloud delivery question failed:", error);
      }
      return result;
    }
  }

  if (result.ok && !result.duplicate && result.createdConversation) {
    try {
      await sendWelcomeMessage(result.conversationId, from);
    } catch (error) {
      // Do not reject the provider webhook when the welcome delivery fails;
      // YCloud can retry incoming events and duplicate the conversation.
      console.error("YCloud welcome message failed:", error);
    }

    return result;
  }

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
        const conversationContext = await getAutomationConversationContext(result.conversationId);
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
          content: conversationContext.combinedContent || content,
          latestContent: content,
          messageHistory: conversationContext.messageHistory,
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

  const noProductMatch = isNoProductMatchReply(synced.content);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: timestamp,
      botEnabled: false,
      // The first no-results reply takes ownership away from the automation.
      // Subsequent customer messages stay in the advisor queue, preventing a
      // repeated sequence of "no encontré" replies from the bot.
      status: noProductMatch ? "REQUIERE_ASESOR" : "ATENDIENDO",
      assignedUserId: noProductMatch ? null : undefined,
    },
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
