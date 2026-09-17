import { resolveRouterV2TextProduct, type RouterV2UnavailableReason } from "@/lib/router-v2-text-product-resolver";

export type RouterV2VisualHints = {
  brand?: string | null; model?: string | null; color?: string | null;
  code?: string | null; visibleText?: string[]; confidence?: number | null;
};

type VisualProductMatch = {
  code: string; slug: string; name: string; brand: string | null;
  category: string | null; imageUrl: string | null; unitPrice: number;
};

export type RouterV2VisualResolution =
  | { status: "NO_IMAGE_HINTS" }
  | { status: "LOW_CONFIDENCE"; hints: RouterV2VisualHints }
  | { status: "NOT_FOUND"; hints: RouterV2VisualHints }
  | { status: "UNAVAILABLE"; unavailableReason: RouterV2UnavailableReason }
  | { status: "MULTIPLE"; hints: RouterV2VisualHints; matches: VisualProductMatch[] }
  | { status: "UNIQUE"; hints: RouterV2VisualHints; match: VisualProductMatch };

export async function resolveRouterV2VisualProduct(
  hints: RouterV2VisualHints | null | undefined,
): Promise<RouterV2VisualResolution> {
  if (!hints) return { status: "NO_IMAGE_HINTS" };
  if (hints.confidence != null && hints.confidence < 0.7) return { status: "LOW_CONFIDENCE", hints };

  const query = hints.code?.trim() || (hints.brand?.trim() && hints.model?.trim()
    ? [hints.brand, hints.model, hints.color].filter(Boolean).join(" ") : null);
  if (!query) return { status: "LOW_CONFIDENCE", hints };
  const result = await resolveRouterV2TextProduct(query);
  if (result.status === "UNAVAILABLE") return { status: "UNAVAILABLE", unavailableReason: result.unavailableReason! };
  if (result.status === "UNIQUE") return { status: "UNIQUE", hints, match: result.matches[0] };
  if (result.status === "MULTIPLE") return { status: "MULTIPLE", hints, matches: result.matches };
  return { status: "NOT_FOUND", hints };
}
