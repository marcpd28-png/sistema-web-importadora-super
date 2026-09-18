import { getBotProductImageUrls, isBotProductAvailable } from "@/lib/bot-product-availability";
import { prisma } from "@/lib/prisma";
import { resolveProductBrand } from "@/lib/product-discovery";
import { matchProductIdentities, productQueryTokens, type ProductIdentity } from "@/lib/router-v2-product-query";

// Only identity is cached. Visibility, stock and commercial data are read fresh.
let identityCache: { expires: number; products: ProductIdentity[] } | null = null;
async function loadIdentities() {
  if (identityCache && identityCache.expires > Date.now()) return identityCache.products;
  const products = await prisma.product.findMany({
    select: { id: true, code: true, externalCode: true, name: true, brand: true, category: true },
  });
  identityCache = { expires: Date.now() + 30_000, products };
  return products;
}

export type RouterV2UnavailableReason = "OUT_OF_STOCK" | "NOT_PUBLIC" | "NO_PHOTO" | "OUT_OF_STOCK_NO_PHOTO";

export function unavailableProductAction(reason: RouterV2UnavailableReason) {
  if (reason === "OUT_OF_STOCK") return "PRODUCT_OUT_OF_STOCK" as const;
  if (reason === "NO_PHOTO") return "PRODUCT_NO_PHOTO" as const;
  if (reason === "OUT_OF_STOCK_NO_PHOTO") return "PRODUCT_OUT_OF_STOCK_NO_PHOTO" as const;
  return "PRODUCT_UNAVAILABLE" as const;
}

export async function resolveRouterV2TextProduct(query: string) {
  const tokens = productQueryTokens(query);
  const empty = {
    count: 0,
    matches: [] as Array<{
      id: string; code: string; slug: string; name: string; brand: string | null;
      category: string | null; imageUrl: string | null; unitPrice: number;
      wholesalePrice: number | null; wholesaleMinQty: number; available: boolean; productUrl: string;
    }>,
    unavailableReason: null as RouterV2UnavailableReason | null,
    queryLabel: tokens.join(" "),
  };
  if (!tokens.length) return { ...empty, status: "NO_QUERY" as const };

  const identity = matchProductIdentities(query, await loadIdentities());
  empty.queryLabel = identity.tokens.join(" ");
  if (!identity.matches.length) return { ...empty, status: "NOT_FOUND" as const };
  const ids = identity.matches.map((product) => product.id);

  const availability = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, isVisible: true, stockUnits: true, localImageUrl: true, sourceImageUrl: true, imageUrl: true,
      media: { where: { type: "IMAGE" }, orderBy: { sortOrder: "asc" }, select: { url: true } } },
  });
  const availableIds = availability.filter(isBotProductAvailable).map((product) => product.id);
  if (!availableIds.length) {
    // No hidden name, SKU, price, image or URL crosses the resolver boundary.
    const visible = availability.filter(product => product.isVisible);
    return {
      ...empty,
      status: "UNAVAILABLE" as const,
      unavailableReason: !visible.length ? "NOT_PUBLIC" as const
        : visible.some(product => product.stockUnits > 0) ? "NO_PHOTO" as const
        : visible.every(product => !getBotProductImageUrls(product).length) ? "OUT_OF_STOCK_NO_PHOTO" as const
        : "OUT_OF_STOCK" as const,
    };
  }

  const rows = await prisma.product.findMany({
    where: { id: { in: availableIds }, isVisible: true, stockUnits: { gt: 0 } },
    orderBy: [{ isFeatured: "desc" }, { stockUnits: "desc" }, { id: "asc" }],
    take: 20,
    select: {
      id: true, code: true, slug: true, name: true, brand: true, category: true,
      imageUrl: true, localImageUrl: true, sourceImageUrl: true,
      media: { orderBy: { sortOrder: "asc" }, where: { type: "IMAGE" }, select: { url: true } },
      unitPrice: true, wholesalePrice: true, wholesaleMinQty: true,
    },
  });
  if (!rows.length) return { ...empty, status: "UNAVAILABLE" as const, unavailableReason: "NOT_PUBLIC" as const };
  const matches = rows.filter(product => getBotProductImageUrls(product).length).map((product) => ({
    id: product.id, code: product.code, slug: product.slug, name: product.name,
    brand: resolveProductBrand(product), category: product.category,
    imageUrl: getBotProductImageUrls(product)[0],
    unitPrice: Number(product.unitPrice),
    wholesalePrice: product.wholesalePrice === null ? null : Number(product.wholesalePrice),
    wholesaleMinQty: product.wholesaleMinQty, available: true,
    productUrl: `/producto/${product.slug}`,
  }));
  if (!matches.length) return { ...empty, status: "UNAVAILABLE" as const, unavailableReason: "NO_PHOTO" as const };
  return {
    ...empty,
    status: matches.length === 1 && !identity.ambiguousSpelling ? "UNIQUE" as const : "MULTIPLE" as const,
    count: matches.length,
    matches,
  };
}
