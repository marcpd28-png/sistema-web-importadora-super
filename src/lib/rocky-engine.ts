import { deliveryLocation, isPriceFollowUp, isQuantityOnly, isRockyGreeting, requestedUnits, verifiedQuote } from "./rocky-conversation-policy";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getAutomationConversationContext } from "./messages-service";
import { AutomationCancelledError, rockyOutbox } from "./rocky-outbox";
import { buildPublicUrl } from "./site-url";
import { generateCatalogPdf, isGeneralCatalogRequest, parseCatalogRequest } from "./catalog-pdf";
import { answerShopAssistant } from "./shop-assistant";
import { productWhatsAppImage } from "./whatsapp-product-image";
type JsonRecord = Record<string, unknown>;
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function asRecord(value: unknown): JsonRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }

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
const PRODUCT_PROMPT_MESSAGE = "¡Hola! Con gusto te ayudo. ¿Qué producto del catálogo te interesa? Puedes escribirme el nombre, marca o código y te indico las opciones y precios disponibles.";
const LOCATION_MESSAGE = "Nuestra tienda está en Avenida Abancay 752, Centro de Lima. Horario: Lun–Sáb, 8:00 a. m.–8:00 p. m.; Dom, 9:00 a. m.–8:00 p. m. Ubicación: https://www.google.com/maps/search/?api=1&query=Avenida+Abancay+752%2C+Centro+de+Lima";
const SHIPPING_MESSAGE = "Hacemos envíos por Shalom a todo el Perú. En Lima también coordinamos delivery por inDrive; indícanos tu distrito y dirección para ayudarte.";
const PRODUCT_DELIVERY_MESSAGE = "Tenemos recojo en tienda (Avenida Abancay 752, Centro de Lima), envíos por Shalom a todo el Perú y delivery en Lima por inDrive. ¿En qué distrito o ciudad lo necesitas?";
const HOURS_MESSAGE = "Nuestro horario de atención es: Lun–Sáb, 8:00 a. m.–8:00 p. m.; Dom, 9:00 a. m.–8:00 p. m.";
const GENERAL_CATALOG_MESSAGE = "¡Claro! Puedes revisar y escoger los productos disponibles en nuestro catálogo completo: https://tiendavirtualsuper.com\n\nCuando elijas un producto, escríbeme su nombre o código y te confirmo el precio y stock. También hacemos envíos por Shalom a todo el Perú.";
const PAYMENT_NOTICE_URL = buildPublicUrl("/uploads/communications/metodos-pago-importaciones-super-20260929-v2.jpeg");
const PAYMENT_NOTICE_MESSAGE = "Gracias. Te comparto nuestras cuentas autorizadas y medios de pago. Por seguridad, realiza depósitos únicamente a las cuentas indicadas en este comunicado.";
const CATALOG_SCOPE_WAIT_MS = 30 * 60 * 1000;
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

function selectedShownProduct(content: string, shownProducts: unknown) {
  if (!Array.isArray(shownProducts)) return null;
  const normalized = normalizedText(content);
  const ordinal = normalized.match(/\b(?:opcion|modelo|el|la)\s*(primero|primera|segundo|segunda|tercero|tercera|[1-3])\b/)?.[1];
  const positions: Record<string, number> = { primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, "1": 1, "2": 2, "3": 3 };
  return shownProducts.find((product) => {
    const item = asRecord(product);
    const code = text(item?.code);
    const normalizedCode = code ? normalizedText(code).replace(/[^a-z0-9]+/g, " ").trim() : "";
    const normalizedMessage = " " + normalized.replace(/[^a-z0-9]+/g, " ").trim() + " ";
    return (normalizedCode && normalizedMessage.includes(" " + normalizedCode + " ")) || (ordinal && Number(item?.position) === positions[ordinal]);
  }) as JsonRecord | undefined ?? null;
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
  const prefix = `(${product.code})`;
  const name = product.name.startsWith(prefix) ? product.name.slice(prefix.length).trim() : product.name;
  return `${name} (${product.code})\nPrecio unitario: ${product.unitPrice}.${wholesale}\nDisponibilidad: ${product.availabilityLabel}.`;
}

/** Responds to any product request with the available product information.
 * Unlike the old price-only path, this is also used for requests such as
 * "busco un repetidor wifi" or "tienen parlantes". */
async function sendProductSearchResults(conversationId: string, recipient: string, content: string, productContextCode?: string) {
  const reply = await answerShopAssistant({ message: content, productContextCode });
  // Two precise alternatives are easier to compare and prevent a catalog
  // search from turning into a sequence of repetitive bot bubbles.
  const products = (reply.products ?? []).filter(product => product.stockUnits > 0 && Number.isFinite(product.unitPriceValue) && product.unitPriceValue > 0).slice(0, 2);
  if (!products.length) return false;

  for (const product of products) {
    const caption = productSearchCaption(product);
    const outboundImage = await productWhatsAppImage(product.id);
    if (outboundImage) {
      const imageUrl = outboundImage.startsWith("http")
        ? outboundImage
        : buildPublicUrl(outboundImage);
      await sendBotImage(conversationId, recipient, imageUrl, caption, "product_search_result");
    } else {
      await sendBotText(conversationId, recipient, caption, "product_search_result_without_image");
    }
  }

  const previousState = await prisma.conversationSalesState.findUnique({ where: { conversationId }, select: { deliveryData: true } });
  const previousDelivery = asRecord(previousState?.deliveryData) ?? {};
  const knownDestination = text(previousDelivery.location) ?? text(previousDelivery.limaAddress);
  const deliveryData = { ...previousDelivery, awaitingDeliveryLocation: !knownDestination } as Prisma.InputJsonValue;
  await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.upsert({
    where: { conversationId },
    create: { conversationId, stage: "AWAITING_DELIVERY_DETAILS", selectedProductCode: products.length === 1 ? products[0].code : null, deliveryData, shownProducts: products.map((product, index) => ({ position: index + 1, code: product.code, name: product.name, unitPrice: product.unitPriceValue, imageUrl: product.imageUrl })) },
    update: { stage: "AWAITING_DELIVERY_DETAILS", selectedProductCode: products.length === 1 ? products[0].code : null, quantity: null, deliveryData, shownProducts: products.map((product, index) => ({ position: index + 1, code: product.code, name: product.name, unitPrice: product.unitPriceValue, imageUrl: product.imageUrl })) },
  }));

  if (!knownDestination) await sendBotText(conversationId, recipient, PRODUCT_DELIVERY_MESSAGE, "product_search_delivery_options");
  await sendPaymentNotice(conversationId, recipient);
  return true;
}

async function sendCatalog(conversationId: string, recipient: string, content: string) {
  if (isGeneralCatalogRequest(content)) {
    await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.upsert({
      where: { conversationId },
      create: { conversationId, stage: "AWAITING_CATALOG_SCOPE" },
      update: { stage: "AWAITING_CATALOG_SCOPE" },
    }));
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

  if (isGreeting(content)) {
    if (!await sendWelcomeIfNeeded(conversationId, from)) await sendBotText(conversationId, from, PRODUCT_PROMPT_MESSAGE, "greeting_product_prompt");
    return result;
  }
  if (isAdvisorRequest(content)) {
    await handOffToAdvisor(conversationId, from, "advisor_handoff");
    return result;
  }
  if (await sendCatalog(conversationId, from, content)) return result;

  // Explicit service questions outrank any previously pending sales question.
  if (isLocationRequest(content)) { await sendBotText(conversationId, from, LOCATION_MESSAGE, "store_location"); return result; }
  if (isHoursRequest(content)) { await sendBotText(conversationId, from, HOURS_MESSAGE, "store_hours"); return result; }
  if (isPaymentRequest(content)) { await sendPaymentNotice(conversationId, from); return result; }

  const salesState = await prisma.conversationSalesState.findUnique({ where: { conversationId } });
  const selected = selectedShownProduct(content, salesState?.shownProducts);
  const code = text(selected?.code) ?? salesState?.selectedProductCode;
  const quantity = requestedUnits(content);
  if (quantity && code && (selected || isQuantityOnly(content))) {
    const product = await prisma.product.findUnique({ where: { code } });
    const quote = product ? verifiedQuote(product, quantity) : null;
    if (!product || !quote) { await handOffToAdvisor(conversationId, from, "quote_validation_handoff"); return result; }
    await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({ where: { conversationId }, data: { selectedProductCode: code, ...quote, stage: "AWAITING_PAYMENT_METHOD" } }));
    await sendBotText(conversationId, from, product.name + " (" + code + "). " + quantity + " unidades a S/ " + quote.unitPrice.toFixed(2) + " cada una. Total: S/ " + quote.total.toFixed(2) + ".", "verified_quantity_quote");
    await sendPaymentNotice(conversationId, from);
    return result;
  }
  if (selected && code) {
    const product = await prisma.product.findUnique({ where: { code } });
    if (!product || !verifiedQuote(product, 1)) { await handOffToAdvisor(conversationId, from, "selection_validation_handoff"); return result; }
    await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({ where: { conversationId }, data: { selectedProductCode: code, stage: "AWAITING_QUANTITY" } }));
    await sendBotText(conversationId, from, "Perfecto, " + product.name + ". ¿Cuántas unidades necesitas?", "product_selection_quantity");
    return result;
  }
  if (isPriceFollowUp(content)) {
    const shown = Array.isArray(salesState?.shownProducts) ? salesState.shownProducts : [];
    const contextCode = code ?? (shown.length === 1 ? text(asRecord(shown[0])?.code) : null);
    if (contextCode && await sendProductSearchResults(conversationId, from, content, contextCode)) return result;
    await sendBotText(conversationId, from, shown.length > 1 ? "¿De cuál de los modelos que te mostré necesitas el precio?" : "¿Qué producto te interesa? Puedes indicarme su nombre, marca o modelo.", "product_clarification");
    return result;
  }
  if (isShippingRequest(content)) {
    await sendBotText(conversationId, from, isLimaDeliveryRequest(content) ? LIMA_DELIVERY_MESSAGE : SHIPPING_MESSAGE, "store_shipping");
    return result;
  }

  const catalogScope = salesState?.stage === "AWAITING_CATALOG_SCOPE" && Date.now() - salesState.updatedAt.getTime() <= CATALOG_SCOPE_WAIT_MS && !/\b(precio|precios|cuanto|costo|vale)\b/.test(normalizedText(content));
  if (catalogScope && await sendCatalog(conversationId, from, "catálogo " + content)) return result;
  if (await sendProductSearchResults(conversationId, from, content)) return result;

  const destination = deliveryLocation(content);
  if (destination && salesState) {
    const previous = asRecord(salesState.deliveryData) ?? {};
    await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({ where: { conversationId }, data: { deliveryData: { ...previous, location: destination, awaitingDeliveryLocation: false, awaitingLimaAddress: false } as Prisma.InputJsonValue } }));
    await sendBotText(conversationId, from, "Anoté el destino: " + destination + ". Hacemos envíos por Shalom a todo el Perú; en Lima también coordinamos delivery por inDrive. El costo se confirma con un asesor antes del pago.", "delivery_location_confirmed");
    return result;
  }
  if (/^(gracias|muchas gracias|ok|okay|listo|perfecto)$/.test(normalizedText(content))) {
    await sendBotText(conversationId, from, "¡Con gusto! Si necesitas otra información del producto, aquí estoy para ayudarte.", "courtesy_acknowledgement");
    return result;
  }
  await handOffToAdvisor(conversationId, from, "catalog_match_handoff");
  return result;
}
