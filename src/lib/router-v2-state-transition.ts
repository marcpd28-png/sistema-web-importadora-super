import type { ShownProduct } from "@/lib/router-v2-product-reference";

type ProductDecision = {
  action: string;
  shownProducts?: ShownProduct[];
  selectedProductCandidate?: { code: string } | null;
} | null;

type ProductReference = {
  status: string;
  product?: ShownProduct;
  matches?: ShownProduct[];
} | null;

function reindexProducts(products: ShownProduct[]) {
  return products.map((product, index) => ({
    ...product,
    position: index + 1,
  }));
}

export function buildRouterV2DecisionStatePatch(input: {
  basePatch: Record<string, unknown>;
  finalAction: string;
  productDecision: ProductDecision;
  productReference: ProductReference;
  quantity?: number | null;
  purchaseIntent?: boolean;
}) {
  const patch: Record<string, unknown> = {
    ...input.basePatch,
  };

  if (["ASK_PRODUCT_CLARIFICATION", "PRODUCT_OUT_OF_STOCK", "PRODUCT_UNAVAILABLE", "PRODUCT_NO_PHOTO", "PRODUCT_OUT_OF_STOCK_NO_PHOTO"].includes(input.finalAction)) {
    patch.stage = "AWAITING_PRODUCT_QUERY";
    patch.shownProducts = null;
    patch.selectedProductCode = null;
    patch.quantity = null;
    patch.unitPrice = null;
    patch.priceTier = null;
    patch.total = null;
    patch.purchaseIntent = false;
    return patch;
  }

  if (input.finalAction === "ASK_VARIANT") {
    patch.stage = "AWAITING_MODEL_SELECTION";

    if (input.productDecision?.action === "ASK_VARIANT") {
      patch.quantity = input.quantity ?? null;
      patch.shownProducts =
        input.productDecision.shownProducts ?? [];
      patch.selectedProductCode = null;
      patch.unitPrice = null;
      patch.priceTier = null;
      patch.total = null;
    }

    return patch;
  }

  if (
    input.finalAction === "ASK_VARIANT_CLARIFICATION" &&
    input.productReference?.status === "AMBIGUOUS"
  ) {
    patch.stage = "AWAITING_MODEL_SELECTION";
    patch.shownProducts = reindexProducts(
      input.productReference.matches ?? [],
    );
    return patch;
  }

  if (input.finalAction === "PRODUCT_CONFIRMED") {
    const selected =
      input.productReference?.status === "SELECTED"
        ? input.productReference.product
        : input.productDecision?.action === "PRODUCT_CONFIRMED"
          ? input.productDecision.selectedProductCandidate
          : null;

    if (!selected?.code)
      return patch;

    patch.selectedProductCode = selected.code;
    patch.shownProducts = null;
    patch.quantity = input.quantity ?? null;
    // A previous product's quote must not become this product's price.
    patch.unitPrice = null;
    patch.priceTier = null;
    patch.total = null;

    if (input.quantity && input.quantity > 0)
      patch.stage = "AWAITING_PRICE_CONFIRMATION";
    else if (input.purchaseIntent)
      patch.stage = "AWAITING_QUANTITY";
    else
      patch.stage = "AWAITING_PURCHASE_CONFIRMATION";
  }

  return patch;
}
