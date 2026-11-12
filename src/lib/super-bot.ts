import { answerShopAssistant, normalizeAssistantText } from "./shop-assistant";
import {
  CatalogPdfImageCoverageError,
  CatalogPdfProductCoverageError,
  CatalogPdfSizeLimitError,
  generateCatalogPdfBundle,
  parseCatalogRequest,
  parseSecurityCameraPurchaseCatalogRequest,
  type CatalogRequest,
  type GeneratedCatalogPdf,
  type GeneratedCatalogPdfBundle,
} from "./catalog-pdf";
import { isCatalogRequest } from "./catalog-intent";
import type { ShopAssistantReply } from "./shop-assistant-types";
import { getConfiguredMessengerUrl } from "./messenger-url";
import {
  composeLiveSuperBotReply,
  type SuperBotLiveReplyInput,
} from "./super-bot-live-ai";
import { PUBLIC_MESSENGER_URL } from "./utils";

export type SuperBotInput = {
  message: string;
  productContextCode?: string | null;
  contextCategorySlug?: string | null;
  recentMessages?: Array<{ role: "assistant" | "user"; text: string }>;
  /** Product cards the trusted channel already displayed to this customer. */
  shownProductCodes?: string[];
  /** Set only by a trusted channel adapter or conversation store. */
  isFirstContact?: boolean;
  hasAttachments?: boolean;
  /** Internal channel policy; never sourced from customer input. */
  catalogPdfMaxBytes?: number;
};

function contactAction(href: string) {
  return { label: "Hablar con un asesor", href, accent: true } as const;
}

const VIRTUAL_STORE_URL = "https://tiendavirtualsuper.com/";

export function isCatalogLinkRequest(message: string) {
  return isCatalogRequest(message);
}

type SuperBotDependencies = {
  answerShopAssistant?: (input: SuperBotInput) => Promise<ShopAssistantReply>;
  composeLiveReply?: (input: SuperBotLiveReplyInput) => Promise<ShopAssistantReply>;
  /** Preferred complete-collection contract. */
  generateCatalogPdfBundle?: (request: CatalogRequest, options?: { maxBytes?: number }) => Promise<GeneratedCatalogPdfBundle>;
  /** Compatibility injection for callers/tests still producing one file. */
  generateCatalogPdf?: (request: CatalogRequest) => Promise<GeneratedCatalogPdf>;
  getMessengerUrl?: () => Promise<string>;
};

function catalogLinkReply(): ShopAssistantReply {
  return {
    // With 2,000+ frequently changing SKUs, an encapsulated general PDF
    // would be stale, large, and hard to browse on mobile. The store is the
    // canonical complete catalogue; a buying walkthrough can be attached
    // later only after operations provides an approved, durable video URL.
    text: `El catálogo completo y actualizado está en la tienda virtual: ${VIRTUAL_STORE_URL}`,
    quickActions: [
      { label: "Ver tienda virtual", href: VIRTUAL_STORE_URL, accent: true },
    ],
    meta: { intent: "catalog-link", usedOllama: false },
  };
}

function paymentAndAdvisorReply(messengerUrl: string): ShopAssistantReply {
  return {
    text: "Puedes pagar con tarjeta o Yape por Culqi, transferencia Interbank o Plin. Un asesor continuará la atención para confirmar tu pedido.",
    quickActions: [contactAction(messengerUrl)],
    meta: { intent: "payment", usedOllama: false },
  };
}

function isProductInterestMessage(message: string) {
  const text = normalizeAssistantText(message);
  return /\b(me interesa|me interesan|lo quiero|la quiero|los quiero|las quiero|quiero ese|quiero esa|dame ese|dame esa|voy a llevar|lo llevare|comprar ese|comprar esa)\b/.test(text);
}

/**
 * Product facts live in the card. Keep the accompanying copy intentionally
 * short, whether it came directly from the deterministic catalogue service
 * or was later refined by the optional live model.
 */
function makeProductReplyVisualFirst(reply: ShopAssistantReply): ShopAssistantReply {
  if (!reply.products?.length) return reply;
  // A product card paired with a server-calculated quantity quote is not a
  // discovery carousel. Its amount, wholesale threshold, and total must stay
  // visible verbatim; replacing it with the generic visual-card prompt loses
  // the answer the customer explicitly requested.
  if (
    reply.contextProductCode &&
    /\b(?:total estimado|aplica mayorista|para mayorista necesitas|precio unitario)\b/i.test(reply.text)
  ) return reply;
  // The catalogue service has already calculated this exact count. Keep it
  // intact instead of replacing it with generic prose after visual cards.
  if (/^(?:Tenemos \d+ productos(?: [^.]+)? en stock\. ¿Quieres ver el catálogo completo\?|Aquí van \d+ más\. ¿Quieres ver el siguiente lote\?)$/.test(reply.text)) return reply;
  const hasMore = reply.channelActions?.some((action) => action.kind === "show-more");
  return {
    ...reply,
    text: hasMore ? "Mira las opciones. ¿Cuál buscas o quieres ver más?" : "Mira las opciones. ¿Cuál buscas?",
  };
}

function wantsAllShownProducts(input: SuperBotInput) {
  if (!input.shownProductCodes?.length) return false;
  if (!/^(si|claro|dale|ok|okay|de acuerdo|quiero verlos|si quiero verlos)([!. ]|$)/.test(normalizeAssistantText(input.message))) return false;
  return (input.recentMessages ?? []).some((message) =>
    // A catalogue-complete confirmation is a distinct document action. It
    // must never be reinterpreted as pagination merely because its response
    // is an affirmative word. Pagination is only for the explicit next-lot
    // prompt emitted after a previous page.
    message.role === "assistant" && /quieres ver el siguiente lote/.test(normalizeAssistantText(message.text)),
  );
}

function catalogPdfReply(
  request: CatalogRequest,
  catalog: GeneratedCatalogPdfBundle,
): ShopAssistantReply {
  const documents = catalog.documents.map((document) => ({
    deliveryKey: `catalog:${document.filename}`,
    filename: document.filename,
    mimeType: "application/pdf" as const,
    sizeBytes: document.sizeBytes,
    url: document.absoluteUrl,
  }));
  const firstDocument = documents[0];
  if (!firstDocument) throw new Error("El catálogo no contiene documentos para entregar.");
  const text = request.source === "security-camera-purchase"
    ? documents.length === 1
      ? `¡Por supuesto! Te comparto el catálogo completo de cámaras de seguridad (${catalog.productCount} productos): ${firstDocument.url}`
      : `¡Por supuesto! Te comparto el catálogo completo de cámaras de seguridad (${catalog.productCount} productos) en ${documents.length} PDFs. Te los envío en orden.`
    : documents.length === 1
    ? `Aquí tienes el PDF ${request.title.toLowerCase()} (${catalog.productCount} productos): ${firstDocument.url}`
    : `Preparé ${request.title.toLowerCase()} completo (${catalog.productCount} productos) en ${documents.length} PDFs. Te los envío en orden.`;

  return {
    text,
    // Keep the first document for legacy channels, but `documents` is the
    // complete contract used by Telegram and every modern adapter.
    document: firstDocument,
    documents,
    quickActions: [
      { label: documents.length === 1 ? "Abrir PDF" : "Abrir primera parte", href: firstDocument.url, accent: true },
      { label: "Ver tienda virtual", href: VIRTUAL_STORE_URL },
    ],
    meta: { intent: "catalog-pdf", usedOllama: false },
  };
}

function catalogPdfFallback(error: unknown): ShopAssistantReply {
  const text = error instanceof CatalogPdfImageCoverageError || error instanceof CatalogPdfProductCoverageError
    ? `No pude preparar un PDF completo porque falta una foto verificable o cambió un producto del catálogo. Puedes revisarlo completo en la tienda virtual: ${VIRTUAL_STORE_URL}`
    : error instanceof CatalogPdfSizeLimitError
      ? `No pude preparar una de las partes del catálogo dentro del tamaño permitido. Puedes revisarlo completo en la tienda virtual: ${VIRTUAL_STORE_URL}`
      : `No pude preparar el catálogo solicitado como PDF. Puedes revisarlo completo en la tienda virtual: ${VIRTUAL_STORE_URL}`;

  return {
    text,
    quickActions: [
      { label: "Ver tienda virtual", href: VIRTUAL_STORE_URL, accent: true },
    ],
    meta: { intent: "catalog-link", usedOllama: false },
  };
}

function hasAnyIntent(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function serviceReply(message: string, messengerUrl: string): ShopAssistantReply | null {
  const text = normalizeAssistantText(message);

  if (/^(hola|ola|hey|buenos dias|buenas tardes|buenas noches|buen dia)$/.test(text)) {
    return {
      text: "¡Hola! Soy Super Bot. Puedo consultar el catálogo actualizado, precios, stock, compras por mayor y opciones de entrega.",
      quickActions: [
        { label: "Explorar catálogo", href: "/?focus=search", accent: true },
        { label: "Ver ofertas", href: "/?featured=1" },
      ],
      suggestedPrompts: ["Busca un producto", "¿Qué ofertas hay?", "¿Cómo hago mi pedido?"],
      meta: { intent: "welcome", usedOllama: false },
    };
  }

  if (hasAnyIntent(text, ["horario", "hora atienden", "a que hora", "abren", "cierran"])) {
    return {
      text: "Atendemos todos los días de 8:00 a. m. a 8:00 p. m., incluidos domingos.",
      quickActions: [contactAction(messengerUrl)],
      meta: { intent: "hours", usedOllama: false },
    };
  }

  if (hasAnyIntent(text, ["ubicacion", "direccion", "donde estan", "donde queda", "como llego", "mapa"])) {
    return {
      text: "Nuestra tienda está en Av. Abancay 752, Cercado de Lima. Ubicación: https://www.google.com/maps/search/?api=1&query=Avenida+Abancay+752%2C+Centro+de+Lima",
      quickActions: [contactAction(messengerUrl)],
      meta: { intent: "location", usedOllama: false },
    };
  }

  if (hasAnyIntent(text, ["envio", "envios", "delivery", "entrega", "despacho", "shalom", "provincia", "agencia"])) {
    return {
      text: "Hacemos envíos a todo el Perú. En Lima también coordinamos delivery; el costo y la cobertura se confirman antes del pago.",
      quickActions: [contactAction(messengerUrl)],
      meta: { intent: "shipping", usedOllama: false },
    };
  }

  if (hasAnyIntent(text, ["pago", "pagos", "pagar", "transferencia", "yape", "plin", "deposito", "banco"])) {
    return paymentAndAdvisorReply(messengerUrl);
  }

  if (hasAnyIntent(text, ["asesor", "asesora", "humano", "persona", "representante", "vendedor", "vendedora"])) {
    return {
      text: "Claro. Un asesor puede continuar contigo por Messenger.",
      quickActions: [contactAction(messengerUrl)],
      meta: { intent: "human-assistance", usedOllama: false },
    };
  }

  return null;
}

function pendingAdvisorReply(intent: "attachment-human-assistance" | "human-assistance"): ShopAssistantReply {
  return {
    // A missing verified answer must not be turned into a plausible-sounding
    // response by a channel or an optional model. The transport owns the
    // durable handoff and intentionally sends nothing to the customer.
    text: "",
    meta: { intent, usedOllama: false, requiresAdvisor: true },
  };
}

function isAttachmentOnlyMessage(message: string) {
  const normalized = normalizeAssistantText(message);
  return !normalized || /^(imagen|foto|archivo|adjunto|media|documento|video|audio)$/.test(normalized);
}

/**
 * The only customer-response core. It reads commercial facts from the
 * verified catalog first and has no knowledge of phone numbers, provider
 * APIs, delivery queues, or channel-specific credentials. Web, Messenger and
 * Telegram adapters can therefore use the exact same decision path.
 */
export function createSuperBotService(dependencies: SuperBotDependencies = {}) {
  const getShopAssistantReply = dependencies.answerShopAssistant ?? answerShopAssistant;
  const composeLiveReply = dependencies.composeLiveReply ?? composeLiveSuperBotReply;
  const createCatalogPdfBundle: (request: CatalogRequest, options?: { maxBytes?: number }) => Promise<GeneratedCatalogPdfBundle> = dependencies.generateCatalogPdfBundle
    ?? (dependencies.generateCatalogPdf
      ? async (request: CatalogRequest, options?: { maxBytes?: number }) => {
        const document = await dependencies.generateCatalogPdf!(request);
        if (options?.maxBytes && document.sizeBytes > options.maxBytes) {
          throw new CatalogPdfSizeLimitError();
        }
        return { documents: [document], productCount: document.productCount };
      }
      : generateCatalogPdfBundle);
  const getMessengerUrl = dependencies.getMessengerUrl ?? getConfiguredMessengerUrl;

  const finalizeReply = async (input: SuperBotInput, verifiedReply: ShopAssistantReply) => {
    const visualReply = makeProductReplyVisualFirst(verifiedReply);
    try {
      const composed = await composeLiveReply({
        message: input.message,
        recentMessages: input.recentMessages,
        isFirstContact: input.isFirstContact,
        verifiedReply: visualReply,
      });
      const visualComposed = makeProductReplyVisualFirst(composed);
      return /^(?:Tenemos \d+ productos(?: [^.]+)? en stock\. ¿Quieres ver el catálogo completo\?|Aquí van \d+ más\. ¿Quieres ver el siguiente lote\?)$/.test(visualReply.text)
        ? { ...visualComposed, text: visualReply.text }
        : visualComposed;
    } catch {
      // A model or integration failure must never replace verified catalog data.
      return visualReply;
    }
  };

  return async function answerSuperBot(input: SuperBotInput): Promise<ShopAssistantReply> {
    if (input.hasAttachments && isAttachmentOnlyMessage(input.message)) {
      return pendingAdvisorReply("attachment-human-assistance");
    }

    // An affirmative reply to the bounded visual catalogue means “next page”,
    // not payment. The original search lives in trusted customer history and
    // shownProductCodes advances the page without relying on visible captions.
    if (wantsAllShownProducts(input)) {
      return finalizeReply(input, await getShopAssistantReply({
        ...input,
        message: "Muéstrame más opciones",
      }));
    }

    // A positive selection is the handoff moment. It is intentionally handled
    // before another catalogue lookup so a short "lo quiero" cannot repeat
    // cards instead of explaining the available payment paths.
    if (isProductInterestMessage(input.message)) {
      const messengerUrl = await getMessengerUrl().catch(() => PUBLIC_MESSENGER_URL);
      return finalizeReply(input, paymentAndAdvisorReply(messengerUrl));
    }

    // A specific request always has priority over a generic catalogue link.
    // It returns a manifest-checked complete bundle; the bridge delivers each
    // part idempotently and never selects just the first document.
    const catalogRequest = parseCatalogRequest(input.message)
      ?? parseSecurityCameraPurchaseCatalogRequest(input.message);
    if (catalogRequest) {
      try {
        return finalizeReply(input, catalogPdfReply(catalogRequest, await createCatalogPdfBundle(catalogRequest, {
          maxBytes: input.catalogPdfMaxBytes,
        })));
      } catch (error) {
        return finalizeReply(input, catalogPdfFallback(error));
      }
    }

    if (isCatalogLinkRequest(input.message)) {
      return finalizeReply(input, catalogLinkReply());
    }

    const catalogReply = await getShopAssistantReply(input);
    if (catalogReply.text.trim() || catalogReply.products?.length || catalogReply.searchClarification?.length) {
      return finalizeReply(input, catalogReply);
    }

    const messengerUrl = await getMessengerUrl().catch(() => PUBLIC_MESSENGER_URL);
    const knownServiceReply = serviceReply(input.message, messengerUrl);
    // Asking directly for a person is also an explicit handoff, not an
    // automatic acknowledgement that could leave the customer waiting.
    if (knownServiceReply?.meta?.intent === "human-assistance") {
      return pendingAdvisorReply("human-assistance");
    }
    if (knownServiceReply) return finalizeReply(input, knownServiceReply);

    return pendingAdvisorReply("human-assistance");
  };
}

const answerWithDefaultService = createSuperBotService();

export function answerSuperBot(input: SuperBotInput): Promise<ShopAssistantReply> {
  return answerWithDefaultService(input);
}
