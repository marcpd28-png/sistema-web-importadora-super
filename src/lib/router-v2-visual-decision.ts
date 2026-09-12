import type { RouterV2VisualResolution } from "@/lib/router-v2-visual-product-resolver";

export function buildRouterV2VisualDecision(
  resolution: RouterV2VisualResolution | null,
) {
  if (!resolution) return null;

  if (
    resolution.status === "NO_IMAGE_HINTS" ||
    resolution.status === "LOW_CONFIDENCE" ||
    resolution.status === "NOT_FOUND"
  ) {
    return {
      action: "ASK_PRODUCT_CLARIFICATION" as const,
      shownProducts: [],
      selectedProductCandidate: null,
    };
  }

  if (resolution.status === "MULTIPLE") {
    return {
      action: "ASK_VARIANT" as const,
      shownProducts: resolution.matches.slice(0, 20).map((product, index) => ({
        position: index + 1,
        code: product.code,
        name: product.name,
        brand: product.brand,
        slug: product.slug,
        unitPrice: product.unitPrice,
        imageUrl: product.imageUrl,
      })),
      selectedProductCandidate: null,
    };
  }

  return {
    action: "PRODUCT_CONFIRMED" as const,
    shownProducts: [
      {
        position: 1,
        code: resolution.match.code,
        name: resolution.match.name,
        brand: resolution.match.brand,
        slug: resolution.match.slug,
        unitPrice: resolution.match.unitPrice,
        imageUrl: resolution.match.imageUrl,
      },
    ],
    selectedProductCandidate: resolution.match,
  };
}
