import type { RouterV2Analysis } from "@/lib/conversation-router-v2";

export type RouterV2ShoppingMode = "WHOLESALE" | "RETAIL";

export type RouterV2CatalogDecision =
  | {
      action: "NONE";
      mode: null;
      patch: Record<string, unknown>;
    }
  | {
      action: "ASK_PURCHASE_MODE";
      mode: null;
      patch: Record<string, unknown>;
    }
  | {
      action: "SEND_WHOLESALE_CATALOG";
      mode: "WHOLESALE";
      patch: Record<string, unknown>;
    }
  | {
      action: "START_RETAIL_DISCOVERY";
      mode: "RETAIL";
      patch: Record<string, unknown>;
    };

type CurrentStateLike = {
  customerData?: unknown;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readBoolean(value: unknown, key: string) {
  const record = asRecord(value);
  return record[key] === true;
}

function readShoppingMode(value: unknown): RouterV2ShoppingMode | null {
  const record = asRecord(value);
  return record.shoppingMode === "WHOLESALE" || record.shoppingMode === "RETAIL"
    ? record.shoppingMode
    : null;
}

function detectShoppingMode(content: string): RouterV2ShoppingMode | null {
  const text = normalize(content);

  if (
    /\b(por mayor|al por mayor|mayorista|mayoreo|compra mayorista|precio mayorista)\b/.test(
      text,
    )
  ) {
    return "WHOLESALE";
  }

  if (
    /\b(por menor|al por menor|minorista|unitario|por unidad|una unidad|unidades sueltas|pocas unidades)\b/.test(
      text,
    )
  ) {
    return "RETAIL";
  }

  return null;
}

function buildModePatch(
  customerData: Record<string, unknown>,
  mode: RouterV2ShoppingMode,
) {
  return {
    customerData: {
      ...customerData,
      catalogPending: false,
      shoppingMode: mode,
    },
  };
}

export function resolveRouterV2CatalogFlow(input: {
  analysis: RouterV2Analysis;
  content: string;
  currentState: CurrentStateLike | null;
}): RouterV2CatalogDecision {
  const customerData = asRecord(input.currentState?.customerData);
  const pendingCatalog = readBoolean(customerData, "catalogPending");
  const currentMode = readShoppingMode(customerData);
  const requestedCatalog = input.analysis.intents.includes("CATALOG_REQUEST");
  const explicitMode = detectShoppingMode(input.content);
  const isBroadRetailSearch =
    !input.analysis.intents.includes("EXACT_PRODUCT") &&
    (input.analysis.intents.includes("PRODUCT_SEARCH") ||
      input.analysis.intents.includes("BRAND_SEARCH"));

  if (requestedCatalog && explicitMode) {
    const patch = buildModePatch(customerData, explicitMode);
    return explicitMode === "WHOLESALE"
      ? { action: "SEND_WHOLESALE_CATALOG", mode: explicitMode, patch }
      : { action: "START_RETAIL_DISCOVERY", mode: explicitMode, patch };
  }

  if (requestedCatalog && currentMode && !explicitMode) {
    const patch = buildModePatch(customerData, currentMode);
    return currentMode === "WHOLESALE"
      ? { action: "SEND_WHOLESALE_CATALOG", mode: currentMode, patch }
      : { action: "START_RETAIL_DISCOVERY", mode: currentMode, patch };
  }

  if (requestedCatalog && !explicitMode) {
    return {
      action: "ASK_PURCHASE_MODE",
      mode: null,
      patch: {
        customerData: {
          ...customerData,
          catalogPending: true,
        },
      },
    };
  }

  if (pendingCatalog) {
    if (!explicitMode) {
      return {
        action: "ASK_PURCHASE_MODE",
        mode: null,
        patch: {
          customerData: {
            ...customerData,
            catalogPending: true,
          },
        },
      };
    }

    const patch = buildModePatch(customerData, explicitMode);
    return explicitMode === "WHOLESALE"
      ? { action: "SEND_WHOLESALE_CATALOG", mode: explicitMode, patch }
      : { action: "START_RETAIL_DISCOVERY", mode: explicitMode, patch };
  }

  if (currentMode === "RETAIL" && isBroadRetailSearch) {
    return {
      action: "START_RETAIL_DISCOVERY",
      mode: "RETAIL",
      patch: buildModePatch(customerData, "RETAIL"),
    };
  }

  return { action: "NONE", mode: null, patch: {} };
}
