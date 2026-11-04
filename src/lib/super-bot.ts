import { answerShopAssistant, normalizeAssistantText } from "./shop-assistant";
import {
  CatalogPdfSizeLimitError,
  generateCatalogPdf,
  parseCatalogRequest,
  type CatalogRequest,
  type GeneratedCatalogPdf,
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
  /** Set only by a trusted channel adapter or conversation store. */
  isFirstContact?: boolean;
  hasAttachments?: boolean;
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
  generateCatalogPdf?: (request: CatalogRequest) => Promise<GeneratedCatalogPdf>;
  getMessengerUrl?: () => Promise<string>;
};

function catalogLinkReply(): ShopAssistantReply {
  return {
    text: `Puedes ver nuestro catálogo completo y actualizado en la tienda virtual: ${VIRTUAL_STORE_URL}`,
    quickActions: [
      { label: "Ver tienda virtual", href: VIRTUAL_STORE_URL, accent: true },
    ],
    meta: { intent: "catalog-link", usedOllama: false },
  };
}

function catalogPdfReply(
  request: CatalogRequest,
  catalog: GeneratedCatalogPdf,
): ShopAssistantReply {
  return {
    text: `Aquí tienes el PDF ${request.title.toLowerCase()} (${catalog.productCount} productos): ${catalog.absoluteUrl}`,
    document: {
      deliveryKey: `catalog:${catalog.filename}`,
      filename: catalog.filename,
      mimeType: "application/pdf",
      sizeBytes: catalog.sizeBytes,
      url: catalog.absoluteUrl,
    },
    quickActions: [
      { label: "Abrir PDF", href: catalog.absoluteUrl, accent: true },
      { label: "Ver tienda virtual", href: VIRTUAL_STORE_URL },
    ],
    meta: { intent: "catalog-pdf", usedOllama: false },
  };
}

function catalogPdfFallback(error: unknown): ShopAssistantReply {
  const text = error instanceof CatalogPdfSizeLimitError
    ? `El catálogo solicitado supera el tamaño permitido para enviarlo en un solo PDF. Puedes revisarlo completo en la tienda virtual: ${VIRTUAL_STORE_URL}`
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
    return {
      text: "Para confirmar un pago, un asesor verificará los datos y el pedido antes de que realices cualquier transferencia.",
      quickActions: [contactAction(messengerUrl)],
      meta: { intent: "payment", usedOllama: false },
    };
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

function attachmentOnlyReply(messengerUrl: string): ShopAssistantReply {
  return {
    text: "Recibí tu imagen o archivo. Aún no puedo identificar un producto solo por el adjunto; envíame su código o modelo, o un asesor lo revisará contigo.",
    quickActions: [contactAction(messengerUrl)],
    suggestedPrompts: ["Buscar por código", "Tengo el modelo", "Hablar con un asesor"],
    meta: { intent: "attachment-human-assistance", usedOllama: false },
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
  const createCatalogPdf = dependencies.generateCatalogPdf ?? generateCatalogPdf;
  const getMessengerUrl = dependencies.getMessengerUrl ?? getConfiguredMessengerUrl;

  const finalizeReply = async (input: SuperBotInput, verifiedReply: ShopAssistantReply) => {
    try {
      return await composeLiveReply({
        message: input.message,
        recentMessages: input.recentMessages,
        isFirstContact: input.isFirstContact,
        verifiedReply,
      });
    } catch {
      // A model or integration failure must never replace verified catalog data.
      return verifiedReply;
    }
  };

  return async function answerSuperBot(input: SuperBotInput): Promise<ShopAssistantReply> {
    if (input.hasAttachments && isAttachmentOnlyMessage(input.message)) {
      const messengerUrl = await getMessengerUrl().catch(() => PUBLIC_MESSENGER_URL);
      return finalizeReply(input, attachmentOnlyReply(messengerUrl));
    }

    // A specific request always has priority over a generic catalogue link.
    // This returns exactly one canonical document; the generator coalesces
    // identical concurrent requests and keeps the resulting URL stable.
    const catalogRequest = parseCatalogRequest(input.message);
    if (catalogRequest) {
      try {
        return finalizeReply(input, catalogPdfReply(catalogRequest, await createCatalogPdf(catalogRequest)));
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
    return finalizeReply(input, serviceReply(input.message, messengerUrl) ?? {
      text: "No ubico ese producto. ¿Tienes foto, código o modelo?",
      quickActions: [
        { label: "Explorar catálogo", href: "/?focus=search", accent: true },
        contactAction(messengerUrl),
      ],
      suggestedPrompts: ["Buscar por código", "Ver ofertas", "Hablar con un asesor"],
      meta: { intent: "human-assistance", usedOllama: false },
    });
  };
}

const answerWithDefaultService = createSuperBotService();

export function answerSuperBot(input: SuperBotInput): Promise<ShopAssistantReply> {
  return answerWithDefaultService(input);
}
