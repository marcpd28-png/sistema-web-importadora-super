import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getAutomationConversationContext } from "./messages-service";
import { AutomationCancelledError, rockyOutbox } from "./rocky-outbox";
import { buildPublicUrl } from "./site-url";
import { generateCatalogPdf, isGeneralCatalogRequest, parseCatalogRequest } from "./catalog-pdf";
import { answerShopAssistant } from "./shop-assistant";
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
const SPEAKER_CATALOG_MESSAGE = "¡Claro! Te comparto el catálogo general de parlantes.\n\nPara pedir una opción específica, escríbeme por ejemplo: “catálogo parlantes Bluetooth” o “catálogo parlantes JBL”.";
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

function isGreeting(content: string) {
  const fragments = content.split(/\n+/).filter(fragment => fragment.trim());
  if (fragments.length > 1) return fragments.every(isGreeting);
  const normalized = normalizedText(content).replace(/[!¡?.:,;]/g, "").replace(/\s+/g, " ").trim();
  return /^(hola|ola|buenos dias|buenas tardes|buenas noches|buen dia|saludos|hey)(?:\s+(?:rocky|amigo|amiga))?$/.test(normalized);
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

async function handOffToAdvisor(conversationId: string, recipient: string, source: string) {
  await rockyOutbox.handoff({ conversationId, recipient, content: ADVISOR_MESSAGE, source });
}

async function sendScreenExtenderOptions(conversationId: string, recipient: string) {
  if (!await sendProductSearchResults(conversationId, recipient, "extensor de pantalla")) {
    await handOffToAdvisor(conversationId, recipient, "screen_extender_handoff");
  }
}

async function sendSpeakerCatalogGuidance(conversationId: string, recipient: string) {
  await sendBotText(conversationId, recipient, SPEAKER_CATALOG_MESSAGE, "speaker_catalog_guidance");
  return sendCatalog(conversationId, recipient, "catálogo parlantes");
}

async function sendBotText(conversationId: string, recipient: string, content: string, source: string) {
  await rockyOutbox.enqueue({ conversationId, recipient, content, source });
}

async function sendBotImage(conversationId: string, recipient: string, mediaUrl: string, caption: string, source: string) {
  await rockyOutbox.enqueue({ conversationId, recipient, mediaUrl, content: caption, source, type: "image" });
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
  // Two precise alternatives are easier to compare and prevent a catalog
  // search from turning into a sequence of repetitive bot bubbles.
  const products = (reply.products ?? []).slice(0, 2);
  if (!products.length) return false;

  for (const product of products) {
    const caption = productSearchCaption(product);
    const outboundImage = product.outboundImageUrl ?? product.imageUrl;
    if (outboundImage) {
      const imageUrl = outboundImage.startsWith("http")
        ? outboundImage
        : buildPublicUrl(outboundImage);
      await sendBotImage(conversationId, recipient, imageUrl, caption, "product_search_result");
    } else {
      await sendBotText(conversationId, recipient, caption, "product_search_result_without_image");
    }
  }

  await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.upsert({
    where: { conversationId },
    create: { conversationId, stage: "AWAITING_DELIVERY_DETAILS", deliveryData: { awaitingLimaAddress: true }, shownProducts: products.map((product, index) => ({ position: index + 1, code: product.code, name: product.name, unitPrice: product.unitPriceValue, imageUrl: product.imageUrl })) },
    update: { stage: "AWAITING_DELIVERY_DETAILS", selectedProductCode: products.length === 1 ? products[0].code : null, quantity: null, deliveryData: { awaitingLimaAddress: true }, shownProducts: products.map((product, index) => ({ position: index + 1, code: product.code, name: product.name, unitPrice: product.unitPriceValue, imageUrl: product.imageUrl })) },
  }));

  await sendBotText(conversationId, recipient, PRODUCT_DELIVERY_MESSAGE, "product_search_delivery_options");
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

  if (result.ok && !result.duplicate && result.conversation?.botEnabled) {
    // The durable batch above already includes unanswered fragments.
    if (isGreeting(content)) {
      try {
        // Do not greet before intent classification. A greeting-only message
        // receives the welcome; a greeting followed by a request is handled
        // by that request's dedicated flow instead.
        const welcomeSent = await sendWelcomeIfNeeded(result.conversationId, from);
        if (!welcomeSent) {
          await sendBotText(result.conversationId, from, PRODUCT_PROMPT_MESSAGE, "greeting_product_prompt");
        }
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud greeting response failed:", error);
      }
      return result;
    }

    if (isAdvisorRequest(content)) {
      try {
        await handOffToAdvisor(result.conversationId, from, "advisor_handoff");
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud advisor handoff response failed:", error);
      }
      return result;
    }

    if (isScreenExtenderInquiry(content)) {
      try {
        await sendScreenExtenderOptions(result.conversationId, from);
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud screen extender response failed:", error);
      }
      return result;
    }

    // An explicit catalog request always takes precedence over a regular
    // product inquiry: "catálogo de parlantes" must receive a PDF, not a
    // generic speaker suggestion flow.
    if (await sendCatalog(result.conversationId, from, content)) {
      return result;
    }

    if (isSpeakerInquiry(content)) {
      try {
        if (await sendProductSearchResults(result.conversationId, from, content)) {
          return result;
        }
        await sendSpeakerCatalogGuidance(result.conversationId, from);
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud speaker catalog response failed:", error);
      }
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
          await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({
            where: { conversationId: result.conversationId },
            data: { stage: "AWAITING_PRODUCT_QUERY" },
          }));
          return result;
        }
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud catalog scope response failed:", error);
      }
    }
    const awaitingAddress = salesState?.stage === "AWAITING_DELIVERY_DETAILS"
      && Boolean((salesState.deliveryData as JsonRecord | null)?.awaitingLimaAddress);

    if (awaitingAddress && content.trim()) {
      await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({
        where: { conversationId: result.conversationId },
        data: {
          stage: "AWAITING_PAYMENT_METHOD",
          deliveryData: { limaAddress: content, awaitingLimaAddress: false } as Prisma.InputJsonValue,
        },
      }));
      try {
        await sendPaymentNotice(result.conversationId, from);
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
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
        await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({
          where: { conversationId: result.conversationId },
          data: { stage: "AWAITING_PAYMENT_METHOD", selectedProductCode: code, quantity, unitPrice, total: unitPrice * quantity },
        }));
        await sendPaymentNotice(result.conversationId, from);
        return result;
      }
      if (code && Number.isFinite(unitPrice)) {
        await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({ where: { conversationId: result.conversationId }, data: { stage: "AWAITING_QUANTITY", selectedProductCode: code, unitPrice } }));
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
      await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.update({
        where: { conversationId: result.conversationId },
        data: {
          stage: "AWAITING_PAYMENT_METHOD",
          quantity: requestedQuantity,
          total: unitPrice === null ? null : unitPrice * requestedQuantity,
        },
      }));
      try {
        await sendPaymentNotice(result.conversationId, from);
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
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
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud product price inquiry failed:", error);
      }
    }

    if (isPaymentRequest(content)) {
      try {
        await sendPaymentNotice(result.conversationId, from);
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud payment question failed:", error);
      }
      return result;
    }

    if (isLocationRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, LOCATION_MESSAGE, "store_location");
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud location response failed:", error);
      }
      return result;
    }

    if (isHoursRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, HOURS_MESSAGE, "store_hours");
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud hours response failed:", error);
      }
      return result;
    }

    if (isLimaDeliveryRequest(content)) {
      await rockyOutbox.stageSalesStateWrite(tx => tx.conversationSalesState.upsert({
        where: { conversationId: result.conversationId },
        create: { conversationId: result.conversationId, stage: "AWAITING_DELIVERY_DETAILS", deliveryData: { awaitingLimaAddress: true } },
        update: { stage: "AWAITING_DELIVERY_DETAILS", deliveryData: { awaitingLimaAddress: true } },
      }));
      try {
        await sendBotText(result.conversationId, from, LIMA_DELIVERY_MESSAGE, "lima_delivery_address_request");

      } catch (error) {

        if (error instanceof AutomationCancelledError) throw error;
        console.error("YCloud delivery question failed:", error);
      }
      return result;
    }

    if (isShippingRequest(content)) {
      try {
        await sendBotText(result.conversationId, from, SHIPPING_MESSAGE, "store_shipping");
      } catch (error) {
        if (error instanceof AutomationCancelledError) throw error;
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
      if (error instanceof AutomationCancelledError) throw error;
      console.error("YCloud general product search failed:", error);
    }
  }

  if (result.ok && !result.duplicate && result.conversation?.botEnabled) {
    try {
      const rockyContent = content;

      // Rocky owns interpretation. It receives the customer's recent bubbles
      // as one request, so it can resolve incomplete or split messages using
      // the real product catalog before any escalation is considered.
      if (await sendCatalog(result.conversationId, from, rockyContent)) {
        return result;
      }

      if (await sendProductSearchResults(result.conversationId, from, rockyContent)) {
        return result;
      }

      const rockyReply = await answerShopAssistant({ message: rockyContent });
      if (rockyReply.text) {
        await sendBotText(result.conversationId, from, rockyReply.text, "rocky_catalog_interpretation");
        return result;
      }
    } catch (error) {
      if (error instanceof AutomationCancelledError) throw error;
      console.error("Rocky catalog interpretation failed:", error);
    }

    try {
      await handOffToAdvisor(result.conversationId, from, "catalog_match_handoff");
    } catch (error) {
      if (error instanceof AutomationCancelledError) throw error;
      console.error("Rocky clarification response failed:", error);
    }
  }

  return result;
}
