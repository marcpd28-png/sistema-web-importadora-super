export const routerV2Intents = [
  "GREETING",
  "CATALOG_REQUEST",
  "PRODUCT_SEARCH",
  "BRAND_SEARCH",
  "EXACT_PRODUCT",
  "PRICE_REQUEST",
  "STOCK_REQUEST",
  "WHOLESALE",
  "PURCHASE_INTENT",
  "QUANTITY",
  "LOGISTICS_INQUIRY",
  "PAYMENT_METHOD_REQUEST",
  "INVOICE_REQUEST",
  "ORDER_STATUS",
  "SUPPORT",
  "COMPLAINT",
  "HUMAN_HANDOFF",
  "MEDIA_REFERENCE",
] as const;

export type RouterV2Intent =
  (typeof routerV2Intents)[number];

export type RouterV2Analysis = {
  normalizedContent: string;
  intents: RouterV2Intent[];
  slots: {
    category?: string;
    brand?: string;
    model?: string;
    quantity?: number;
    customerCity?: string;
    deliveryMethod?: string;
    mediaReference?: boolean;
    purchaseIntent?: boolean;
  };
  nextAction:
    | "HUMAN_HANDOFF"
    | "SEND_CATALOG"
    | "RESOLVE_PRODUCT"
    | "ANSWER_LOGISTICS"
    | "ANSWER_PAYMENT"
    | "ANSWER_ORDER_STATUS"
    | "CONTINUE_SALES_FLOW";
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function add(
  list: RouterV2Intent[],
  intent: RouterV2Intent,
) {
  if (!list.includes(intent)) list.push(intent);
}

export function analyzeRouterV2Message(input: {
  content?: string | null;
  messageType?: string | null;
  mediaUrl?: string | null;
}): RouterV2Analysis {
  const text = normalize(input.content ?? "");
  const intents: RouterV2Intent[] = [];
  const slots: RouterV2Analysis["slots"] = {};

  if (/\b(hola|ola|hl|buenas)\b/.test(text))
    add(intents, "GREETING");

  if (/\b(catalogo|pdf|lista de productos)\b/.test(text))
    add(intents, "CATALOG_REQUEST");

  if (/\b(precio|costo|cuanto cuesta|cuanto sale|a cuanto)\b/.test(text))
    add(intents, "PRICE_REQUEST");

  if (/\b(stock|disponible|hay|tienen|lo tienes)\b/.test(text))
    add(intents, "STOCK_REQUEST");

  if (/\b(por mayor|mayorista|precio por cantidad|por caja)\b/.test(text))
    add(intents, "WHOLESALE");

  if (/\b(quiero comprar|quiero adquirir|me interesa adquirir|deseo comprar|me llevo)\b/.test(text)) {
    add(intents, "PURCHASE_INTENT");
    slots.purchaseIntent = true;
  }

  if (/\b(delivery|envio|enviar|provincia|shalom|olva|agencia|recojo)\b/.test(text))
    add(intents, "LOGISTICS_INQUIRY");

  if (/\b(yape|plin|tarjeta|transferencia|depositar|forma de pago)\b/.test(text))
    add(intents, "PAYMENT_METHOD_REQUEST");

  if (/\b(factura|boleta|ruc|comprobante)\b/.test(text))
    add(intents, "INVOICE_REQUEST");

  if (/\b(mi pedido|estado del pedido|seguimiento|tracking|no llega|ya salio)\b/.test(text))
    add(intents, "ORDER_STATUS");

  if (/\b(no funciona|falla|fallado|garantia|averia)\b/.test(text))
    add(intents, "SUPPORT");

  if (/\b(reclamo|queja|devolucion)\b/.test(text))
    add(intents, "COMPLAINT");

  if (/\b(asesor|vendedor|atencion humana|hablar con alguien)\b/.test(text))
    add(intents, "HUMAN_HANDOFF");

  const brandMatch = text.match(
    /\b(jbl|sony|xiaomi|tronsmart|zealot|aiwa|halion|soundcore|anker)\b/,
  );

  if (brandMatch) {
    slots.brand = brandMatch[1].toUpperCase();
    add(intents, "BRAND_SEARCH");
  }

  const categoryMatch = text.match(
    /\b(parlante|parlantes|microfono|microfonos|audifono|audifonos|tablet|tablets|scooter|scooters)\b/,
  );

  if (categoryMatch) {
    slots.category = categoryMatch[1];
    add(intents, "PRODUCT_SEARCH");
  }

  const quantityMatch = text.match(
    /\b(?:quiero|comprar|necesito|dame)\s+(\d{1,5})\b/,
  );

  if (quantityMatch) {
    slots.quantity = Number(quantityMatch[1]);
    add(intents, "QUANTITY");
  }

  if (slots.brand) {
    const brandLower = slots.brand.toLowerCase();
    const afterBrand = text.split(brandLower)[1]?.trim();

    const modelMatch = afterBrand?.match(
      /^([a-z]+\s*\d+[a-z0-9-]*)/,
    );

    if (modelMatch) {
      slots.model = modelMatch[1].toUpperCase();
      add(intents, "EXACT_PRODUCT");
    }
  }

  const cities = [
    "lima",
    "trujillo",
    "arequipa",
    "chiclayo",
    "piura",
    "cusco",
    "ica",
  ];

  for (const city of cities) {
    if (
      new RegExp(
        `\\b(?:para|soy de|envio a|enviar a)\\s+${city}\\b`,
      ).test(text)
    ) {
      slots.customerCity =
        city.charAt(0).toUpperCase() + city.slice(1);
    }
  }

  if (
    input.mediaUrl ||
    ["IMAGE", "VIDEO", "DOCUMENT"].includes(
      (input.messageType ?? "").toUpperCase(),
    ) ||
    /\b(este|ese|esta|esa)\b/.test(text)
  ) {
    slots.mediaReference = true;
    add(intents, "MEDIA_REFERENCE");
  }

  let nextAction: RouterV2Analysis["nextAction"] =
    "CONTINUE_SALES_FLOW";

  if (
    intents.includes("HUMAN_HANDOFF") ||
    intents.includes("SUPPORT") ||
    intents.includes("COMPLAINT")
  )
    nextAction = "HUMAN_HANDOFF";
  else if (intents.includes("ORDER_STATUS"))
    nextAction = "ANSWER_ORDER_STATUS";
  else if (intents.includes("CATALOG_REQUEST"))
    nextAction = "SEND_CATALOG";
  else if (
    intents.includes("PRODUCT_SEARCH") ||
    intents.includes("BRAND_SEARCH") ||
    intents.includes("EXACT_PRODUCT") ||
    intents.includes("MEDIA_REFERENCE")
  )
    nextAction = "RESOLVE_PRODUCT";
  else if (intents.includes("LOGISTICS_INQUIRY"))
    nextAction = "ANSWER_LOGISTICS";
  else if (
    intents.includes("PAYMENT_METHOD_REQUEST") ||
    intents.includes("INVOICE_REQUEST")
  )
    nextAction = "ANSWER_PAYMENT";

  return {
    normalizedContent: text,
    intents,
    slots,
    nextAction,
  };
}
