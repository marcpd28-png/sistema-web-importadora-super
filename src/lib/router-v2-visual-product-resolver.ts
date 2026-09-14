import { prisma } from "@/lib/prisma";
import { discoverExactProducts } from "@/lib/product-discovery";

export type RouterV2VisualHints = {
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  code?: string | null;
  visibleText?: string[];
  confidence?: number | null;
};

type VisualProductMatch = {
  code: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  unitPrice: number;
};

export type RouterV2VisualResolution =
  | { status: "NO_IMAGE_HINTS" }
  | { status: "LOW_CONFIDENCE"; hints: RouterV2VisualHints }
  | { status: "NOT_FOUND"; hints: RouterV2VisualHints }
  | {
      status: "MULTIPLE";
      hints: RouterV2VisualHints;
      matches: VisualProductMatch[];
    }
  | {
      status: "UNIQUE";
      hints: RouterV2VisualHints;
      match: VisualProductMatch;
    };

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveExactCode(code: string) {
  const product = await prisma.product.findFirst({
    where: {
      code: {
        equals: code.trim(),
        mode: "insensitive",
      },
      isVisible: true,
      stockUnits: { gt: 0 },
    },
    select: {
      code: true,
      slug: true,
      name: true,
      brand: true,
      category: true,
      imageUrl: true,
      localImageUrl: true,
      unitPrice: true,
    },
  });

  if (!product) return null;

  return {
    code: product.code,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: product.localImageUrl ?? product.imageUrl ?? null,
    unitPrice: Number(product.unitPrice),
  };
}

export async function resolveRouterV2VisualProduct(
  hints: RouterV2VisualHints | null | undefined,
): Promise<RouterV2VisualResolution> {
  if (!hints) return { status: "NO_IMAGE_HINTS" };

  const confidence = hints.confidence;

  if (
    confidence !== undefined &&
    confidence !== null &&
    confidence < 0.7
  ) {
    return { status: "LOW_CONFIDENCE", hints };
  }

  if (hints.code?.trim()) {
    const exact = await resolveExactCode(hints.code);
    if (exact) {
      return { status: "UNIQUE", hints, match: exact };
    }
  }

  if (!hints.brand?.trim() || !hints.model?.trim()) {
    return { status: "LOW_CONFIDENCE", hints };
  }

  const discovery = await discoverExactProducts({
    brand: hints.brand,
    model: hints.model,
  });

  if (discovery.status === "NOT_FOUND") {
    return { status: "NOT_FOUND", hints };
  }

  let matches = discovery.matches.map((product) => ({
    code: product.code,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: product.imageUrl,
    unitPrice: product.unitPrice,
  }));

  const color = normalize(hints.color);
  if (color) {
    const colorMatches = matches.filter((product) =>
      normalize(`${product.name} ${product.code}`).includes(color),
    );

    if (colorMatches.length > 0) matches = colorMatches;
  }

  if (matches.length === 1) {
    return { status: "UNIQUE", hints, match: matches[0] };
  }

  if (matches.length > 1) {
    return { status: "MULTIPLE", hints, matches };
  }

  return { status: "NOT_FOUND", hints };
}
