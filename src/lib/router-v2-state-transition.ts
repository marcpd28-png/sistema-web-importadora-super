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

  if (input.finalAction === "ASK_PRODUCT_CLARIFICATION") {
    patch.stage = "AWAITING_PRODUCT_QUERY";
    patch.shownProducts = null;
    patch.selectedProductCode = null;
    return patch;
  }

  if (input.finalAction === "ASK_VARIANT") {
    patch.stage = "AWAITING_MODEL_SELECTION";

    if (input.productDecision?.action === "ASK_VARIANT") {
      patch.shownProducts =
        input.productDecision.shownProducts ?? [];
      patch.selectedProductCode = null;
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

    if (input.quantity && input.quantity > 0)
      patch.stage = "AWAITING_PRICE_CONFIRMATION";
    else if (input.purchaseIntent)
      patch.stage = "AWAITING_QUANTITY";
    else
      patch.stage = "AWAITING_PURCHASE_CONFIRMATION";
  }

  return patch;
}
