import type { RouterV2Analysis } from "@/lib/conversation-router-v2";

type CurrentSalesState = {
  category?: string | null;
  brand?: string | null;
  quantity?: number | null;
  selectedProductCode?: string | null;
  customerData?: unknown;
  deliveryData?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function buildRouterV2SalesStatePatch(
  analysis: RouterV2Analysis,
  currentState: CurrentSalesState | null,
) {
  const patch: Record<string, unknown> = {};

  if (
    analysis.slots.category &&
    analysis.slots.category !== currentState?.category
  ) {
    patch.category = analysis.slots.category;
  }

  if (
    analysis.slots.brand &&
    analysis.slots.brand !== currentState?.brand
  ) {
    patch.brand = analysis.slots.brand;
  }

  if (
    analysis.slots.quantity &&
    analysis.slots.quantity !== currentState?.quantity
  ) {
    patch.quantity = analysis.slots.quantity;
  }

  if (analysis.slots.customerCity) {
    patch.customerData = {
      ...asRecord(currentState?.customerData),
      city: analysis.slots.customerCity,
    };
  }

  if (analysis.slots.deliveryMethod) {
    patch.deliveryData = {
      ...asRecord(currentState?.deliveryData),
      method: analysis.slots.deliveryMethod,
    };
  }

  return patch;
}

function readStringField(
  value: unknown,
  key: string,
): string | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];

  return typeof field === "string" && field.trim()
    ? field
    : null;
}

export function buildRouterV2MergedContext(
  analysis: RouterV2Analysis,
  currentState: CurrentSalesState | null,
) {
  return {
    category:
      analysis.slots.category ??
      currentState?.category ??
      null,

    brand:
      analysis.slots.brand ??
      currentState?.brand ??
      null,

    selectedProductCode:
      currentState?.selectedProductCode ??
      null,

    quantity:
      analysis.slots.quantity ??
      currentState?.quantity ??
      null,

    customerCity:
      analysis.slots.customerCity ??
      readStringField(currentState?.customerData, "city") ??
      null,

    deliveryMethod:
      analysis.slots.deliveryMethod ??
      readStringField(currentState?.deliveryData, "method") ??
      null,

    purchaseIntent:
      analysis.slots.purchaseIntent ?? false,

    mediaReference:
      analysis.slots.mediaReference ?? false,
  };
}
