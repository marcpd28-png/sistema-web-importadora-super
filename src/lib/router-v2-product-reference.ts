export type ShownProduct = {
  position: number;
  code: string;
  name: string;
  brand?: string | null;
  slug: string;
  unitPrice: number;
  imageUrl?: string | null;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ordinalPositions: Record<string, number> = {
  primero: 1,
  primera: 1,
  segundo: 2,
  segunda: 2,
  tercero: 3,
  tercera: 3,
  cuarto: 4,
  cuarta: 4,
  quinto: 5,
  quinta: 5,
};

export function resolveShownProductReference(
  content: string,
  products: ShownProduct[],
) {
  const text = normalize(content);

  const codeMatch = products.filter(
    (product) => normalize(product.code) === text,
  );

  if (codeMatch.length === 1) {
    return {
      status: "SELECTED" as const,
      matchedBy: "CODE" as const,
      product: codeMatch[0],
    };
  }

  for (const [word, position] of Object.entries(ordinalPositions)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      const product = products.find(
        (item) => item.position === position,
      );

      if (product) {
        return {
          status: "SELECTED" as const,
          matchedBy: "POSITION" as const,
          product,
        };
      }
    }
  }

  const numeric = text.match(/\b(\d{1,4})\b/);

  if (numeric) {
    const number = Number(numeric[1]);

    const byPosition = products.find(
      (product) => product.position === number,
    );

    if (byPosition) {
      return {
        status: "SELECTED" as const,
        matchedBy: "POSITION" as const,
        product: byPosition,
      };
    }

    const byPrice = products.filter(
      (product) => product.unitPrice === number,
    );

    if (byPrice.length === 1) {
      return {
        status: "SELECTED" as const,
        matchedBy: "PRICE" as const,
        product: byPrice[0],
      };
    }

    if (byPrice.length > 1) {
      return {
        status: "AMBIGUOUS" as const,
        matchedBy: "PRICE" as const,
        matches: byPrice,
      };
    }
  }

  const ignored = new Set([
    "el", "la", "los", "las", "de", "del",
    "quiero", "prefiero", "dame", "ese", "esa",
    "este", "esta", "color", "modelo",
  ]);

  const tokens = text
    .split(" ")
    .filter((token) => token && !ignored.has(token));

  const matches = products.filter((product) => {
    const name = normalize(product.name);
    return tokens.length > 0 &&
      tokens.every((token) => name.includes(token));
  });

  if (matches.length === 1) {
    return {
      status: "SELECTED" as const,
      matchedBy: "NAME" as const,
      product: matches[0],
    };
  }

  if (matches.length > 1) {
    return {
      status: "AMBIGUOUS" as const,
      matchedBy: "NAME" as const,
      matches,
    };
  }

  return {
    status: "NO_MATCH" as const,
    matchedBy: null,
    matches: [],
  };
}

export function readShownProducts(
  value: unknown,
): ShownProduct[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is ShownProduct => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return false;
    }

    const product = item as Record<string, unknown>;

    return (
      typeof product.position === "number" &&
      typeof product.code === "string" &&
      typeof product.name === "string" &&
      typeof product.slug === "string" &&
      typeof product.unitPrice === "number"
    );
  });
}

export function shouldResolveShownProductReference(input: {
  stage?: string | null;
  hasProductResolution: boolean;
  shownProducts: ShownProduct[];
  quantity?: number;
  intents: readonly string[];
}) {
  if (input.stage !== "AWAITING_MODEL_SELECTION")
    return false;

  if (input.hasProductResolution)
    return false;

  if (input.shownProducts.length === 0)
    return false;

  if (input.quantity !== undefined)
    return false;

  const blockingIntents = new Set<string>([
    "GREETING",
    "HUMAN_HANDOFF",
    "SUPPORT",
    "COMPLAINT",
    "CATALOG_REQUEST",
    "LOGISTICS_INQUIRY",
    "PAYMENT_METHOD_REQUEST",
    "INVOICE_REQUEST",
    "ORDER_STATUS",
    "PRICE_REQUEST",
    "STOCK_REQUEST",
    "WHOLESALE",
    "PRODUCT_SEARCH",
    "BRAND_SEARCH",
    "QUANTITY",
  ]);

  return !input.intents.some(
    (intent) => blockingIntents.has(intent),
  );
}
