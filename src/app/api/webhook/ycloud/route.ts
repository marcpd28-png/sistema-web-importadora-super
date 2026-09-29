import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { MessageType, Prisma } from "@prisma/client";
import { getAutomationConversationContext, processIncomingMessage } from "@/lib/messages-service";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";
import { sendYCloudOutboundMessage as deliverYCloudOutboundMessage } from "@/lib/ycloud-outbound";
import { buildPublicUrl } from "@/lib/site-url";
import { generateCatalogPdf, isGeneralCatalogRequest, parseCatalogRequest } from "@/lib/catalog-pdf";
import { answerShopAssistant } from "@/lib/shop-assistant";

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
const ADVISOR_MESSAGE = "¡Claro! Te derivé con un asesor. Te atenderemos por este mismo chat lo antes posible.";
const LOCATION_MESSAGE = "Nuestra tienda está en Avenida Abancay 752, Centro de Lima. Horario: Lun–Sáb, 8:00 a. m.–8:00 p. m.; Dom, 9:00 a. m.–8:00 p. m. Ubicación: https://www.google.com/maps/search/?api=1&query=Avenida+Abancay+752%2C+Centro+de+Lima";
const SHIPPING_MESSAGE = "Hacemos envíos por Shalom a todo el Perú. En Lima también coordinamos delivery por inDrive; indícanos tu distrito y dirección para ayudarte.";
const PRICES_MESSAGE = "Puedes revisar precios y stock actualizados en nuestro catálogo: https://tiendavirtualsuper.com. Para precio mayorista, indícanos el producto y la cantidad que necesitas.";
const OFFERS_MESSAGE = "Aquí puedes ver nuestras ofertas y productos destacados: https://tiendavirtualsuper.com/?featured=1";
const HOURS_MESSAGE = "Nuestro horario de atención es: Lun–Sáb, 8:00 a. m.–8:00 p. m.; Dom, 9:00 a. m.–8:00 p. m.";
// A catalog request should receive the same complete orientation as a new chat.
const GENERAL_CATALOG_MESSAGE = WELCOME_MESSAGE;
const SCREEN_EXTENDER_MESSAGE = "Estos son los modelos disponibles de extensores de pantalla: https://tiendavirtualsuper.com/?q=extensor+de+pantalla";
const PAYMENT_NOTICE_URL = buildPublicUrl("/uploads/communications/cuentas-autorizadas-importaciones-super.jpeg");
const PAYMENT_NOTICE_MESSAGE = "Gracias. Te comparto nuestras cuentas autorizadas y medios de pago. Por seguridad, realiza depósitos únicamente a las cuentas indicadas en este comunicado.";
const SPEAKER_CATALOG_MESSAGE = "¡Claro! Te comparto el catálogo general de parlantes.\n\nPara pedir una opción específica, escríbeme por ejemplo: “catálogo parlantes Bluetooth” o “catálogo parlantes JBL”.";
const CATALOG_SCOPE_WAIT_MS = 30 * 60 * 1000;
const OUTBOUND_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const ROCKY_MESSAGE_BATCH_WAIT_MS = 1_500;

class DuplicateOutboundMessageError extends Error {
  constructor() {
    super("El mismo mensaje automático ya fue enviado recientemente.");
    this.name = "DuplicateOutboundMessageError";
  }
}

function outboundFingerprint(input: { content: string; mediaUrl?: string | null; recipient: string; type: string }) {
  return createHash("sha256")
    .update(JSON.stringify({ content: input.content, mediaUrl: input.mediaUrl ?? null, type: input.type }))
    .digest("hex");
}

// Reserve before calling the provider: a second concurrent webhook finds the
// same reservation and never reaches WhatsApp. The reservation is deliberately
// retained after a network failure because delivery may have succeeded even
// when the response was lost.
async function sendYCloudOutboundMessage(input: Parameters<typeof deliverYCloudOutboundMessage>[0]) {
  const recipient = normalizeWhatsappPhone(input.recipient) ?? input.recipient;
  const fingerprint = outboundFingerprint(input);
  const cutoff = new Date(Date.now() - OUTBOUND_DUPLICATE_WINDOW_MS);
  const existing = await prisma.outboundMessageDispatch.findUnique({
    where: { recipient_fingerprint: { recipient, fingerprint } },
    select: { id: true, reservedAt: true },
  });

  if (existing) {
    const refreshed = await prisma.outboundMessageDispatch.updateMany({
      where: { id: existing.id, reservedAt: { lt: cutoff } },
      data: { reservedAt: new Date() },
    });
    if (refreshed.count === 0) throw new DuplicateOutboundMessageError();
  } else {
    try {
      await prisma.outboundMessageDispatch.create({ data: { recipient, fingerprint } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateOutboundMessageError();
      }
      throw error;
    }
  }

  return deliverYCloudOutboundMessage(input);
}

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

function editDistanceAtMost(left: string, right: string, maximum: number) {
  if (Math.abs(left.length - right.length) > maximum) return false;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    let minimum = previous[0];
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = saved;
      minimum = Math.min(minimum, previous[column]);
    }
    if (minimum > maximum) return false;
  }
  return previous[right.length] <= maximum;
}

function hasIntent(content: string, phrases: string[]) {
  const normalized = normalizedText(content);
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return phrases.some((phrase) => {
    if (normalized.includes(phrase)) return true;
    if (phrase.includes(" ")) return false;
    const tolerance = phrase.length >= 8 ? 2 : phrase.length >= 5 ? 1 : 0;
    return tolerance > 0 && words.some((word) => editDistanceAtMost(word, phrase, tolerance));
  });
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

function isSpeakerInquiry(content: string) {
  return /\b(parlante(?:s)?|altavoz(?:es)?|speaker(?:s)?)\b/.test(normalizedText(content));
}

function isAdvisorRequest(content: string) {
  return hasIntent(content, ["asesor", "asesora", "agente", "humano", "representante", "vendedor", "vendedora", "atencion humana", "hablar con alguien", "comunicarme"]);
}

function isLocationRequest(content: string) {
  return hasIntent(content, ["ubicacion", "direccion", "donde estan", "donde queda", "local", "tienda fisica", "como llego", "mapa"]);
}

function isShippingRequest(content: string) {
  return hasIntent(content, ["envio", "envios", "delivery", "entrega", "despacho", "shalom", "reparto", "provincia", "regiones", "agencia"]);
}

function isPriceRequest(content: string) {
  return hasIntent(content, ["precio", "precios", "cuanto cuesta", "cuanto vale", "mayorista", "costo", "lista de precios"]);
}

function isOffersRequest(content: string) {
  return hasIntent(content, ["oferta", "ofertas", "promo", "promocion", "promociones", "descuento", "descuentos", "rebaja", "rebajas", "liquidacion", "remate"]);
}

function isHoursRequest(content: string) {
  return hasIntent(content, ["horario", "horarios", "hora atienden", "a que hora", "abren", "cierran", "atienden hoy", "atienden domingo"]);
}

function isPaymentRequest(content: string) {
  return hasIntent(content, ["pago", "pagos", "pagar", "cuenta", "cuentas", "transferencia", "yape", "plin", "deposito", "banco", "datos para transferir"]);
}

function extractRequestedQuantity(content: string) {
  const match = normalizedText(content).match(/\b(\d{1,4})\s*(?:unidad|unidades|und|unds)?\b/);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function extractExplicitQuantity(content: string) {
  const match = normalizedText(content).match(/\b(\d{1,4})\s*(?:unidad|unidades|und|unds|piezas|pieza)\b/);
  return match ? Number(match[1]) : null;
}

function selectedShownProduct(content: string, shownProducts: unknown) {
  if (!Array.isArray(shownProducts)) return null;
  const normalized = normalizedText(content);
  const ordinal = normalized.match(/\b(?:opcion|modelo|el|la)\s*(primero|primera|segundo|segunda|tercero|tercera|[1-3])\b/)?.[1];
  const positions: Record<string, number> = { primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, "1": 1, "2": 2, "3": 3 };
  return shownProducts.find((product) => {
    const item = asRecord(product);
    const code = text(item?.code);
    return (code && normalized.includes(normalizedText(code))) || (ordinal && Number(item?.position) === positions[ordinal]);
  }) as JsonRecord | undefined ?? null;
}

function isNoProductMatchReply(content: string) {
  const normalized = normalizedText(content);
  return normalized.includes("no encontre una coincidencia clara")
    || normalized.includes("no encontramos productos")
    || normalized.includes("no encontre productos");
}

async function sendScreenExtenderOptions(conversationId: string, recipient: string) {
  await sendBotText(conversationId, recipient, SCREEN_EXTENDER_MESSAGE, "screen_extender_options");
}

async function sendSpeakerCatalogGuidance(conversationId: string, recipient: string) {
  await sendBotText(conversationId, recipient, SPEAKER_CATALOG_MESSAGE, "speaker_catalog_guidance");
  return sendCatalog(conversationId, recipient, "catálogo parlantes");
}

async function sendBotText(conversationId: string, recipient: string, content: string, source: string) {
  const sent = await sendYCloudOutboundMessage({ content, recipient, type: "text" });
  const reply = await prisma.chatMessage.upsert({
    where: { externalMessageId: sent.messageId },
    create: {
      conversationId,
      direction: "OUTBOUND",
      senderType: "BOT",
      messageType: "TEXT",
      content,
      externalMessageId: sent.messageId,
      metadata: { provider: sent.provider, source } as Prisma.InputJsonValue,
      status: "sent",
    },
    update: {
      content,
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

async function sendBotImage(
  conversationId: string,
  recipient: string,
  mediaUrl: string,
  caption: string,
  source: string,
) {
  const sent = await sendYCloudOutboundMessage({ content: caption, mediaUrl, recipient, type: "image" });
  const reply = await prisma.chatMessage.upsert({
    where: { externalMessageId: sent.messageId },
    create: {
      conversationId,
      direction: "OUTBOUND",
      senderType: "BOT",
      messageType: "IMAGE",
      content: caption,
      mediaUrl,
      externalMessageId: sent.messageId,
      metadata: { provider: sent.provider, source } as Prisma.InputJsonValue,
      status: "sent",
    },
    update: { content: caption, mediaUrl, senderType: "BOT", status: "sent" },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: reply.createdAt },
  });
  triggerPusherEvent(`chat-${conversationId}`, "new-message", reply);
}

async function isLatestCustomerMessage(conversationId: string, messageId: string) {
  // WhatsApp customers often split a request into several bubbles. Give the
  // next bubble a short window to arrive, then only the newest webhook gets
  // to answer using the complete recent context.
  await new Promise<void>((resolve) => setTimeout(resolve, ROCKY_MESSAGE_BATCH_WAIT_MS));
  const latest = await prisma.chatMessage.findFirst({
    where: { conversationId, direction: "INBOUND", senderType: "CUSTOMER" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return latest?.id === messageId;
}

async function answerProductPriceInquiry(conversationId: string, recipient: string, content: string) {
  return sendProductSearchResults(conversationId, recipient, content);
}

function productSearchCaption(product: {
  code: string;
  name: string;
  unitPrice: string;
  wholesalePrice: string | null;
  wholesaleMinQty: number;
  availabilityLabel: string;
  description?: string | null;
}) {
  const wholesale = product.wholesalePrice
    ? `\nPrecio mayorista desde ${product.wholesaleMinQty} unidades: ${product.wholesalePrice}.`
    : "";
  return `${product.name} (${product.code})\nPrecio unitario: ${product.unitPrice}.${wholesale}\nDisponibilidad: ${product.availabilityLabel}.`;
}

/** Responds to any product request with the available product information.
 * Unlike the old price-only path, this is also used for requests such as
 * "busco un repetidor wifi" or "tienen parlantes". */
async function sendProductSearchResults(conversationId: string, recipient: string, content: string) {
  const reply = await answerShopAssistant({ message: content });
  const products = (reply.products ?? []).slice(0, 3);
  if (!products.length) return false;

  if (products.length > 2) {
    const catalogHref = reply.quickActions?.find((action) => action.href.includes("?q="))?.href;
    await sendBotText(
      conversationId,
      recipient,
      `${reply.text || "Encontré varias opciones disponibles."}\n\nTe comparto el catálogo filtrado para que las revises: ${buildPublicUrl(catalogHref ?? "/")}`,
      "product_search_catalog",
    );
    return true;
  }

  if (products.length > 1 && reply.text) {
    await sendBotText(
      conversationId,
      recipient,
      reply.text,
      "product_search_results_intro",
    );
  }

  for (const product of products) {
    const caption = productSearchCaption(product);
    if (product.imageUrl) {
      const imageUrl = product.imageUrl.startsWith("http")
        ? product.imageUrl
        : buildPublicUrl(product.imageUrl);
      await sendBotImage(conversationId, recipient, imageUrl, caption, "product_search_result");
    } else {
      await sendBotText(conversationId, recipient, caption, "product_search_result_without_image");
    }
    if (product.description?.trim()) {
      await sendBotText(
        conversationId,
        recipient,
        `Descripción de ${product.name}: ${product.description.trim()}`,
        "product_search_result_description",
      );
    }
  }

  if (products.length === 1) {
    const product = products[0];
    await prisma.conversationSalesState.upsert({
      where: { conversationId },
      create: { conversationId, stage: "AWAITING_QUANTITY", selectedProductCode: product.code, unitPrice: product.unitPriceValue, priceTier: "Unitario" },
      update: { stage: "AWAITING_QUANTITY", selectedProductCode: product.code, quantity: null, unitPrice: product.unitPriceValue, priceTier: "Unitario", total: null },
    });
    await sendBotText(conversationId, recipient, "¿Deseas comprar este modelo? Indícame cuántas unidades necesitas y te envío los medios de pago.", "product_search_quantity");
    return true;
  }

  await prisma.conversationSalesState.upsert({
    where: { conversationId },
    create: { conversationId, stage: "AWAITING_MODEL_SELECTION", shownProducts: products.map((product, index) => ({ position: index + 1, code: product.code, name: product.name, unitPrice: product.unitPriceValue, imageUrl: product.imageUrl })) },
    update: { stage: "AWAITING_MODEL_SELECTION", selectedProductCode: null, quantity: null, shownProducts: products.map((product, index) => ({ position: index + 1, code: product.code, name: product.name, unitPrice: product.unitPriceValue, imageUrl: product.imageUrl })) },
  });

  await sendBotText(
    conversationId,
    recipient,
    "¿Cuál deseas comprar? Respóndeme con el código o nombre del modelo e indícame cuántas unidades necesitas para enviarte los medios de pago.",
    "product_search_result_selection",
  );
  return true;
}

async function sendCatalog(conversationId: string, recipient: string, content: string) {
  if (isGeneralCatalogRequest(content)) {
    await prisma.conversationSalesState.upsert({
      where: { conversationId },
      create: { conversationId, stage: "AWAITING_CATALOG_SCOPE" },
      update: { stage: "AWAITING_CATALOG_SCOPE" },
    });
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
    if (error instanceof DuplicateOutboundMessageError) return true;
    // Never expose a failed match or an internal error to the customer. Keep
    // the conversation commercial and guide it toward an available catalog.
    const reply = "Tenemos alternativas para ayudarte. Indícame la categoría, marca o el uso que buscas y te comparto las opciones disponibles.";
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

  // Every new customer conversation starts with the configured welcome. Do
  // this before evaluating catalog, product, or automation intents so a
  // keyword in the first bubble can never skip the default response.
  if (result.ok && !result.duplicate && result.createdConversation) {
    try {
      await sendWelcomeMessage(result.conversationId, from);
    } catch (error) {
      if (error instanceof DuplicateOutboundMessageError) return result;
      // Do not reject the provider webhook when the welcome delivery fails;
      // YCloud can retry incoming events and duplicate the conversation.
      console.error("YCloud welcome message failed:", error);
    }
    return result;
  }

  if (result.ok && !result.duplicate && result.conversation?.botEnabled) {
    if (!await isLatestCustomerMessage(result.conversationId, result.messageId)) {
      return result;
    }
  }

  if (result.ok && !result.duplicate && result.conversation?.botEnabled) {
    if (isAdvisorRequest(content)) {
      await prisma.conversation.update({
        where: { id: result.conversationId },
        data: { assignedUserId: null, botEnabled: false, status: "REQUIERE_ASESOR" },
      });
      try {
        await sendBotText(result.conversationId, from, ADVISOR_MESSAGE, "advisor_handoff");
      } catch (error) {
        console.error("YCloud advisor handoff response failed:", error);
      }
      return result;
    }

    if (isScreenExtenderInquiry(content)) {
      try {
        await sendScreenExtenderOptions(result.conversationId, from);
      } catch (error) {
        console.error("YCloud screen extender response failed:", error);
      }
      return result;
    }

    // Do not hand off speaker searches just because the exact wording did not
    // match a product. Give the customer the broad catalog and a short example
    // of how to narrow the request on their next message.
    if (isSpeakerInquiry(content)) {
      try {
        if (await sendProductSearchResults(result.conversationId, from, content)) {
          return result;
        }
        await sendSpeakerCatalogGuidance(result.conversationId, from);
      } catch (error) {
        console.error("YCloud speaker catalog response failed:", error);
      }
      return result;
    }

    if (await sendCatalog(result.conversationId, from, content)) {
      return result;
    }

    const salesState = await prisma.conversationSalesState.findUnique({
      where: { conversationId: result.conversationId },
      select: { deliveryData: true, selectedProductCode: true, shownProducts: true, stage: true, unitPrice: true, updatedAt: true },
    });

    const awaitingCatalogScope =
      salesState?.stage === "AWAITING_CATALOG_SCOPE" &&
      Date.now() - salesState.updatedAt.getTime() <= CATALOG_SCOPE_WAIT_MS &&
      content.trim().split(/\s+/).length <= 4;
    if (awaitingCatalogScope) {
      try {
        // The customer may answer the general-catalog prompt with only a
        // category or brand, e.g. "audífonos" or "JBL".
        if (await sendCatalog(result.conversationId, from, `catálogo ${content}`)) {
          await prisma.conversationSalesState.update({
            where: { conversationId: result.conversationId },
            data: { stage: "AWAITING_PRODUCT_QUERY" },
          });
          return result;
        }
      } catch (error) {
        console.error("YCloud catalog scope response failed:", error);
      }
    }
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

    const requestedQuantity = extractRequestedQuantity(content);
    const selectedProduct = salesState?.stage === "AWAITING_MODEL_SELECTION"
      ? selectedShownProduct(content, salesState.shownProducts)
      : null;
    if (selectedProduct) {
      const code = text(selectedProduct.code);
      const unitPrice = Number(selectedProduct.unitPrice);
      const quantity = extractExplicitQuantity(content);
      if (code && Number.isFinite(unitPrice) && quantity && quantity > 0) {
        await prisma.conversationSalesState.update({
          where: { conversationId: result.conversationId },
          data: { stage: "AWAITING_PAYMENT_METHOD", selectedProductCode: code, quantity, unitPrice, total: unitPrice * quantity },
        });
        await sendPaymentNotice(result.conversationId, from);
        return result;
      }
      if (code && Number.isFinite(unitPrice)) {
        await prisma.conversationSalesState.update({ where: { conversationId: result.conversationId }, data: { stage: "AWAITING_QUANTITY", selectedProductCode: code, unitPrice } });
        await sendBotText(result.conversationId, from, "Perfecto. ¿Cuántas unidades necesitas para enviarte los medios de pago?", "product_selection_quantity");
        return result;
      }
    }
    if (
      salesState?.stage === "AWAITING_QUANTITY" &&
      salesState.selectedProductCode &&
      requestedQuantity
    ) {
      const unitPrice = salesState.unitPrice ? Number(salesState.unitPrice) : null;
      await prisma.conversationSalesState.update({
        where: { conversationId: result.conversationId },
        data: {
          stage: "AWAITING_PAYMENT_METHOD",
          quantity: requestedQuantity,
          total: unitPrice === null ? null : unitPrice * requestedQuantity,
        },
      });
      try {
        await sendPaymentNotice(result.conversationId, from);
      } catch (error) {
        console.error("YCloud product quantity payment notice failed:", error);
      }
      return result;
    }

    if (isPriceRequest(content)) {
      try {
        if (await answerProductPriceInquiry(result.conversationId, from, content)) {
          return result;
        }
      } catch (error) {
        console.error("YCloud product price inquiry failed:", error);
      }
    }

    if (isPaymentRequest(content)) {
      try {
        await sendPaymentNotice(result.conversationId, from);
      } catch (error) {
        console.error("YCloud payment question failed:", error);
      }
      return result;
    }

    if (isLocationRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, LOCATION_MESSAGE, "store_location");
      } catch (error) {
        console.error("YCloud location response failed:", error);
      }
      return result;
    }

    if (isHoursRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, HOURS_MESSAGE, "store_hours");
      } catch (error) {
        console.error("YCloud hours response failed:", error);
      }
      return result;
    }

    if (isOffersRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, OFFERS_MESSAGE, "store_offers");
      } catch (error) {
        console.error("YCloud offers response failed:", error);
      }
      return result;
    }

    if (isPriceRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, PRICES_MESSAGE, "store_prices");
      } catch (error) {
        console.error("YCloud prices response failed:", error);
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

    if (isShippingRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, SHIPPING_MESSAGE, "store_shipping");
      } catch (error) {
        console.error("YCloud shipping response failed:", error);
      }
      return result;
    }

    // Product requests do not need to mention a price. Resolve them against
    // the catalog before handing the message to n8n or an advisor.
    try {
      if (await sendProductSearchResults(result.conversationId, from, content)) {
        return result;
      }
    } catch (error) {
      console.error("YCloud general product search failed:", error);
    }
  }

  if (result.ok && !result.duplicate && result.conversation?.botEnabled) {
    try {
      const conversationContext = await getAutomationConversationContext(result.conversationId);
      const rockyContent = conversationContext.combinedContent || content;

      // Rocky owns interpretation. It receives the customer's recent bubbles
      // as one request, so it can resolve incomplete or split messages using
      // the real product catalog before any escalation is considered.
      if (await sendProductSearchResults(result.conversationId, from, rockyContent)) {
        return result;
      }

      const rockyReply = await answerShopAssistant({ message: rockyContent });
      if (rockyReply.text) {
        await sendBotText(result.conversationId, from, rockyReply.text, "rocky_catalog_interpretation");
        return result;
      }
    } catch (error) {
      console.error("Rocky catalog interpretation failed:", error);
    }

    try {
      await prisma.conversation.update({
        where: { id: result.conversationId },
        data: { status: "ESPERANDO_CLIENTE" },
      });
      await sendBotText(
        result.conversationId,
        from,
        "Quiero ayudarte a encontrarlo. Escríbeme el nombre, marca, código o para qué lo necesitas; también puedes enviarme el producto en varios mensajes.",
        "rocky_clarification",
      );
    } catch (error) {
      console.error("Rocky clarification response failed:", error);
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
