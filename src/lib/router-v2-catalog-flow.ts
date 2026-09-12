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

export function resolveRouterV2CatalogFlow(input: {
  analysis: RouterV2Analysis;
  content: string;
  currentState: CurrentStateLike | null;
}): RouterV2CatalogDecision {
  const customerData = asRecord(input.currentState?.customerData);
  const pendingCatalog = readBoolean(customerData, "catalogPending");
  const requestedCatalog = input.analysis.intents.includes("CATALOG_REQUEST");
  const mode = detectShoppingMode(input.content);

  if (!requestedCatalog && !pendingCatalog) {
    return { action: "NONE", mode: null, patch: {} };
  }

  if (!mode) {
    if (!requestedCatalog) {
      return { action: "NONE", mode: null, patch: {} };
    }

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

  const patch = {
    customerData: {
      ...customerData,
      catalogPending: false,
      shoppingMode: mode,
    },
  };

  if (mode === "WHOLESALE") {
    return {
      action: "SEND_WHOLESALE_CATALOG",
      mode,
      patch,
    };
  }

  return {
    action: "START_RETAIL_DISCOVERY",
    mode,
    patch,
  };
}
