import { getBotProductImageUrls } from "@/lib/bot-product-availability";
import { prisma } from "@/lib/prisma";

export type RouterV2RetailProduct = {
  code: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  unitPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number;
};

export async function discoverRouterV2RetailProducts(input: {
  category?: string | null;
  brand?: string | null;
  query?: string | null;
  take?: number;
}) {
  const take = Math.max(1, Math.min(input.take ?? 4, 8));
  const query = input.query?.trim() ?? "";

  const filters: Array<Record<string, unknown>> = [];

  if (input.category?.trim()) {
    const category = input.category.trim();
    filters.push({
      OR: [
        {
          category: {
            contains: category,
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: category,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (input.brand?.trim()) {
    filters.push({
      OR: [
        {
          brand: {
            contains: input.brand.trim(),
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: input.brand.trim(),
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (query) {
    const tokens = query
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, 4);

    if (tokens.length > 0) {
      filters.push({
        AND: tokens.map((token) => ({
          OR: [
            { code: { contains: token, mode: "insensitive" } },
            { name: { contains: token, mode: "insensitive" } },
            { brand: { contains: token, mode: "insensitive" } },
            { category: { contains: token, mode: "insensitive" } },
          ],
        })),
      });
    }
  }

  if (filters.length === 0) {
    return {
      status: "NEEDS_PRODUCT_OR_CATEGORY" as const,
      matches: [] as RouterV2RetailProduct[],
    };
  }

  const products = await prisma.product.findMany({
    where: {
      isVisible: true,
      stockUnits: { gt: 0 },
      AND: filters,
    },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
    select: {
      code: true,
      slug: true,
      name: true,
      brand: true,
      category: true,
      localImageUrl: true,
      sourceImageUrl: true,
      imageUrl: true,
      media: {
        orderBy: { sortOrder: "asc" },
        take: 4,
        where: { type: "IMAGE" },
        select: { url: true },
      },
      unitPrice: true,
      wholesalePrice: true,
      wholesaleMinQty: true,
    },
  });

  const matches = products.filter(product => getBotProductImageUrls(product).length).slice(0, take).map((product) => ({
    code: product.code,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: getBotProductImageUrls(product)[0],
    unitPrice: Number(product.unitPrice),
    wholesalePrice:
      product.wholesalePrice === null ? null : Number(product.wholesalePrice),
    wholesaleMinQty: product.wholesaleMinQty,
  }));

  return {
    status: matches.length > 0 ? ("READY" as const) : ("NOT_FOUND" as const),
    matches,
  };
}
