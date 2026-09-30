import { deliveryLocation, isRockyGreeting } from "./rocky-conversation-policy";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getAutomationConversationContext } from "./messages-service";
import { AutomationCancelledError, rockyOutbox } from "./rocky-outbox";
import { buildPublicUrl } from "./site-url";
import { generateCatalogPdf, isGeneralCatalogRequest, parseCatalogRequest } from "./catalog-pdf";
type JsonRecord = Record<string, unknown>;
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function asRecord(value: unknown): JsonRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }

const WELCOME_MESSAGE = `👋 ¡Hola! Buen día. Bienvenido a *Importaciones Super*. Soy *Rocky*, tu asistente virtual.
📚 *TODOS NUESTROS PRODUCTOS Y CATÁLOGOS ACTUALIZADOS ESTÁN AQUÍ:*
👉 https://mc.ht/s/rwQ7BMz
Encontrarás *14 catálogos en PDF* con nuestros productos. 😉
🛍️ También puedes visitar nuestra tienda virtual:
👉 https://tiendavirtualsuper.com
📸 Si ya viste un producto, *envíame la foto, nombre o modelo* y un asesor te ayudará con la información.
🚚 Hacemos *envíos a Lima y a todo el Perú*.
📍 También puedes visitarnos en *Av. Abancay 752, Cercado de Lima*.
🕐 Atendemos *todos los días de 8:00 a. m. a 8:00 p. m., incluidos domingos*.
Para atenderte más rápido, indícame:
*📍 ¿Es para Lima o provincia?*
*📦 ¿Deseas comprar por unidad o por mayor?*
Si deseas hablar con una persona, escribe *“solicito asesor”* y te derivamos con un asesor.`;
const LIMA_DELIVERY_MESSAGE = "¡Claro! Para coordinar tu delivery en Lima, indícame por favor el distrito y la dirección exacta de entrega.";
const ADVISOR_MESSAGE = "¡Claro! Te derivé con un asesor. Te atenderemos por este mismo chat lo antes posible.";
const PRODUCT_PROMPT_MESSAGE = "¡Hola! Puedo compartirte nuestros catálogos, enlaces, horarios y medios de pago. Para precios, disponibilidad o detalles de productos, te atiende un asesor.";
const LOCATION_MESSAGE = "Nuestra tienda está en Av. Abancay 752, Cercado de Lima. Atendemos todos los días de 8:00 a. m. a 8:00 p. m., incluidos domingos. Ubicación: https://www.google.com/maps/search/?api=1&query=Avenida+Abancay+752%2C+Centro+de+Lima";
const SHIPPING_MESSAGE = "Hacemos envíos por Shalom a todo el Perú. En Lima también coordinamos delivery por inDrive; indícanos tu distrito y dirección para ayudarte.";
const HOURS_MESSAGE = "Atendemos todos los días de 8:00 a. m. a 8:00 p. m., incluidos domingos.";
const GENERAL_CATALOG_MESSAGE = "📚 Nuestros catálogos en PDF: https://mc.ht/s/rwQ7BMz\n🛍️ Tienda virtual: https://tiendavirtualsuper.com\nPuedes pedirme un catálogo por categoría. Un asesor te ayudará con precios, disponibilidad y detalles de productos.";
const PAYMENT_NOTICE_URL = buildPublicUrl("/uploads/communications/metodos-pago-importaciones-super-20260929-v2.jpeg");
const PAYMENT_NOTICE_MESSAGE = "Gracias. Te comparto nuestras cuentas autorizadas y medios de pago. Por seguridad, realiza depósitos únicamente a las cuentas indicadas en este comunicado.";
async function sendWelcomeMessage(conversationId: string, recipient: string) {
  await sendBotText(conversationId, recipient, WELCOME_MESSAGE, "conversation_welcome");
}

async function sendWelcomeIfNeeded(conversationId: string, recipient: string) {
  const priorBotReply = await prisma.chatMessage.findFirst({
    where: { conversationId, senderType: "BOT", status: { notIn: ["cancelled", "failed", "uncertain"] } },
    select: { id: true },
  });
  if (priorBotReply) return false;

  await sendWelcomeMessage(conversationId, recipient);
  return true;
}

function normalizedText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function hasIntent(content: string, phrases: string[]) {
  const normalized = " " + normalizedText(content).replace(/[^a-z0-9]+/g, " ").trim() + " ";
  return phrases.some(phrase => normalized.includes(" " + phrase + " "));
}

function isLimaDeliveryRequest(content: string) {
  const normalized = normalizedText(content);
  const mentionsLima = /\blima\b/.test(normalized);
  const mentionsDelivery = /\b(delivery|entrega|envio|costo)\b/.test(normalized);
  return mentionsLima && mentionsDelivery;
}

const isGreeting = isRockyGreeting;

function isAdvisorRequest(content: string) {
  return hasIntent(content, ["asesor", "asesora", "agente", "humano", "representante", "vendedor", "vendedora", "atencion humana", "hablar con alguien", "comunicarme"]);
}

function isLocationRequest(content: string) {
  return hasIntent(content, ["ubicacion", "direccion", "donde estan", "donde queda", "local", "tienda fisica", "como llego", "mapa"]);
}

function isShippingRequest(content: string) {
  return hasIntent(content, ["envio", "envios", "delivery", "entrega", "despacho", "shalom", "reparto", "provincia", "regiones", "agencia"]);
}

function isHoursRequest(content: string) {
  return hasIntent(content, ["horario", "horarios", "hora atienden", "a que hora", "abren", "cierran", "atienden hoy", "atienden domingo"]);
}

function isPaymentRequest(content: string) {
  return hasIntent(content, ["pago", "pagos", "pagar", "cuenta", "cuentas", "transferencia", "yape", "plin", "deposito", "banco", "datos para transferir"]);
}

async function handOffToAdvisor(conversationId: string, recipient: string, source: string) {
  await rockyOutbox.handoff({ conversationId, recipient, content: ADVISOR_MESSAGE, source });
}

async function sendBotText(conversationId: string, recipient: string, content: string, source: string) {
  await rockyOutbox.enqueue({ conversationId, recipient, content, source });
}

async function sendBotImage(conversationId: string, recipient: string, mediaUrl: string, caption: string, source: string) {
  await rockyOutbox.enqueue({ conversationId, recipient, mediaUrl, content: caption, source, type: "image" });
}

async function sendCatalog(conversationId: string, recipient: string, content: string) {
  if (isGeneralCatalogRequest(content)) {
    await sendBotText(conversationId, recipient, GENERAL_CATALOG_MESSAGE, "general_catalog");

    return true;
  }

  const request = parseCatalogRequest(content);
  if (!request) return false;

  try {
    const catalog = await generateCatalogPdf(request);
    const caption = `Aquí tienes el PDF ${request.title.toLowerCase()} (${catalog.productCount} productos).`;
    await rockyOutbox.enqueue({ conversationId, recipient, content: caption, mediaUrl: catalog.absoluteUrl, type: "document", source: "requested_catalog" });

  } catch (error) {

    if (error instanceof AutomationCancelledError) throw error;
    console.error("YCloud catalog generation failed:", error);
    // Never promise an empty catalog. A person can confirm the product name,
    // stock, or a suitable alternative without misleading the customer.
    await handOffToAdvisor(conversationId, recipient, "catalog_unavailable_handoff");
  }
  return true;
}

async function sendPaymentNotice(conversationId: string, recipient: string) {
  await sendBotImage(conversationId, recipient, PAYMENT_NOTICE_URL, PAYMENT_NOTICE_MESSAGE, "lima_delivery_payment_notice");
}

export async function planRockyResponse(conversationId: string, triggerMessageId: string, messageIds: string[] = [triggerMessageId]) {
  const latest = await prisma.chatMessage.findUniqueOrThrow({ where: { id: triggerMessageId }, include: { conversation: { include: { contact: true } } } });
  if (latest.conversationId !== conversationId || latest.senderType !== "CUSTOMER") throw new AutomationCancelledError();
  const from = latest.conversation.contact.phoneNormalized ?? latest.conversation.contact.phone ?? latest.conversation.contact.externalId;
  if (!from) throw new Error("Conversation has no recipient");
  const context = await getAutomationConversationContext(conversationId);
  const batch = await prisma.chatMessage.findMany({ where: { conversationId, id: { in: messageIds }, direction: "INBOUND", senderType: "CUSTOMER" }, select: { id: true, content: true, createdAt: true } });
  const history = new Map(context.messageHistory.map(message => [message.id, { ...message, createdAt: new Date(message.createdAt) }]));
  for (const message of batch) history.set(message.id, message);
  const fragments = [...history.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).map(message => message.content.trim()).filter(Boolean);
  const requests = fragments.filter(fragment => !isGreeting(fragment));
  const content = (requests.length ? requests : fragments).join("\n") || latest.content;
  const result = { ok: true, duplicate: false, conversation: { botEnabled: true }, conversationId, messageId: triggerMessageId };

  // The inbox already waits for ten seconds of silence. For a new automated
  // conversation, send only the welcome regardless of the first message's intent.
  if (await sendWelcomeIfNeeded(conversationId, from)) return result;
  if (isGreeting(content)) {
    await sendBotText(conversationId, from, PRODUCT_PROMPT_MESSAGE, "greeting_product_prompt");
    return result;
  }
  if (isAdvisorRequest(content)) {
    await handOffToAdvisor(conversationId, from, "advisor_handoff");
    return result;
  }
  if (hasIntent(content, ["link", "enlace", "tienda virtual", "pagina web"])) {
    await sendBotText(conversationId, from, GENERAL_CATALOG_MESSAGE, "store_links");
    return result;
  }
  if (await sendCatalog(conversationId, from, content)) return result;

  // Explicit service questions outrank any previously pending sales question.
  if (isLocationRequest(content)) { await sendBotText(conversationId, from, LOCATION_MESSAGE, "store_location"); return result; }
  if (isHoursRequest(content)) { await sendBotText(conversationId, from, HOURS_MESSAGE, "store_hours"); return result; }
  if (isPaymentRequest(content)) { await sendPaymentNotice(conversationId, from); return result; }

  const salesState = await prisma.conversationSalesState.findUnique({ where: { conversationId } });
  if (isShippingRequest(content)) {
    await sendBotText(conversationId, from, isLimaDeliveryRequest(content) ? LIMA_DELIVERY_MESSAGE : SHIPPING_MESSAGE, "store_shipping");
    return result;
  }

  const destination = deliveryLocation(content);
  if (destination) {
    const previous = asRecord(salesState?.deliveryData) ?? {};
    const deliveryData = { ...previous, location: destination, awaitingDeliveryLocation: false, awaitingLimaAddress: false } as Prisma.InputJsonValue;
    await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.upsert({ where: { conversationId }, create: { conversationId, stage: "GENERAL_INFORMATION", deliveryData }, update: { deliveryData } }));
    await sendBotText(conversationId, from, "Anoté el destino: " + destination + ". Hacemos envíos por Shalom a todo el Perú; en Lima también coordinamos delivery por inDrive. El costo se confirma con un asesor antes del pago.", "delivery_location_confirmed");
    return result;
  }
  if (/^(gracias|muchas gracias|ok|okay|listo|perfecto)$/.test(normalizedText(content))) {
    await sendBotText(conversationId, from, "¡Con gusto! Puedo ayudarte con catálogos e información general de la tienda.", "courtesy_acknowledgement");
    return result;
  }
  await handOffToAdvisor(conversationId, from, "product_information_advisor_handoff");
  return result;
}

/** The website chat is informational too; never call the product advisor here. */
export function rockyInformationReply(content: string, firstTurn = false) {
  if (firstTurn) return WELCOME_MESSAGE;
  if (isGreeting(content)) return PRODUCT_PROMPT_MESSAGE;
  if (isGeneralCatalogRequest(content) || parseCatalogRequest(content) || hasIntent(content, ["link", "enlace", "tienda virtual", "pagina web"])) return GENERAL_CATALOG_MESSAGE;
  if (isLocationRequest(content)) return LOCATION_MESSAGE;
  if (isHoursRequest(content)) return HOURS_MESSAGE;
  if (isShippingRequest(content)) return SHIPPING_MESSAGE;
  if (isPaymentRequest(content)) return `${PAYMENT_NOTICE_MESSAGE}\n${PAYMENT_NOTICE_URL}`;
  return "Un asesor te ayudará con precios, disponibilidad y detalles de productos. Escríbenos por WhatsApp para continuar.";
}
