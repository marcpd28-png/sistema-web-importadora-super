import type { discoverExactProducts } from "@/lib/product-discovery";

type ProductResolution =
  Awaited<ReturnType<typeof discoverExactProducts>>;

export function buildRouterV2ProductDecision(
  resolution: ProductResolution | null,
) {
  if (!resolution) return null;

  const shownProducts = resolution.matches
    .slice(0, 20)
    .map((product, index) => ({
      position: index + 1,
      code: product.code,
      name: product.name,
      brand: product.brand,
      slug: product.slug,
      unitPrice: product.unitPrice,
      imageUrl: product.imageUrl,
    }));

  if (resolution.status === "NOT_FOUND") {
    return {
      action: "ASK_PRODUCT_CLARIFICATION" as const,
      shownProducts: [],
      selectedProductCandidate: null,
    };
  }

  if (resolution.status === "MULTIPLE") {
    return {
      action: "ASK_VARIANT" as const,
      shownProducts,
      selectedProductCandidate: null,
    };
  }

  return {
    action: "PRODUCT_CONFIRMED" as const,
    shownProducts,
    selectedProductCandidate:
      resolution.matches[0] ?? null,
  };
}
