import { unstable_cache } from "next/cache";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { buildSellableProductWhere } from "@/lib/store-shared";
import { getPreferredProductImageUrl } from "@/lib/product-media";
import type { CategoryOption } from "@/lib/store-types";
import { getStorefrontCategorySlug, STOREFRONT_CATEGORIES, STOREFRONT_FAMILIES } from "@/lib/storefront-taxonomy";

export const getStorefrontIndex = cache(unstable_cache(async () => {
  const rows = await prisma.product.findMany({
    where: buildSellableProductWhere(),
    select: { id: true, code: true, name: true, slug: true, brand: true, category: true,
      categoryRef: { select: { slug: true } }, externalCode: true, externalId: true,
      unitPrice: true, stockUnits: true, isFeatured: true, updatedAt: true,
      imageUrl: true, localImageUrl: true,
      media: { where: { type: "IMAGE" }, orderBy: { sortOrder: "asc" }, select: { url: true } },
    }, orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
  });
  return rows.map(row => ({ ...row, unitPrice: Number(row.unitPrice), updatedAt: row.updatedAt.toISOString(),
    storefrontCategory: getStorefrontCategorySlug(row), image: getPreferredProductImageUrl(row) }));
}, ["storefront-index-v1"], { revalidate: 60, tags: ["categories", "products"] }));

export const getStorefrontCategories = cache(async (): Promise<CategoryOption[]> => {
  const products = await getStorefrontIndex();
  return STOREFRONT_CATEGORIES.flatMap(([slug, name, family]) => {
    const items = products.filter(p => p.storefrontCategory === slug);
    if (!items.length) return [];
    const representative = items.find(p => p.stockUnits > 0 && p.image) ?? items[0];
    return [{ id: slug, slug, name, parentSlug: `familia-${family}`,
      parentName: STOREFRONT_FAMILIES.find(([key]) => key === family)![1],
      productCount: items.length, imageUrl: representative.image }];
  });
});

export function getStorefrontFamilies(categories: CategoryOption[]): CategoryOption[] {
  return STOREFRONT_FAMILIES.flatMap(([key, name]) => {
    const leaves = categories.filter(c => c.parentSlug === `familia-${key}`);
    return leaves.length ? [{ id: `familia-${key}`, slug: `familia-${key}`, name,
      productCount: leaves.reduce((sum, c) => sum + (c.productCount ?? 0), 0), imageUrl: leaves[0].imageUrl }] : [];
  });
}
