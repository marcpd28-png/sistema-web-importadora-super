import { prisma } from "@/lib/prisma";
import { createCatalogIndex, type CatalogCandidate } from "./catalog-selection";
import { getCatalogReferenceBrands } from "./catalog-reference-brands";
import { isBotProductAvailable, type BotProductAvailability } from "./bot-product-availability";

export function createCommercialCatalog<T extends CatalogCandidate & BotProductAvailability>(inventory: T[], brands: string[] = []) {
  const products = inventory.filter(product => product.isVisible);
  const index = createCatalogIndex(products, brands);
  const selections = new Map<string, ReturnType<typeof index.select>>();
  return {
    products, index,
    search(query: string, availableOnly = true) {
      // Interpret identity once against all published products. Stock/photo availability
      // must never change the vocabulary or the meaning of the customer's request.
      if (!selections.has(query)) selections.set(query, index.select(query));
      const selection = selections.get(query)!;
      return availableOnly ? { ...selection, products: selection.products.filter(isBotProductAvailable),
        scopes: selection.scopes.map(scope => ({ ...scope, products: scope.products.filter(isBotProductAvailable) })) } : selection;
    },
  };
}

/** One inventory snapshot per request; no stock/price cache or writes to ERP products. */
export async function loadCommercialCatalog() {
  const [products, brands] = await Promise.all([
    prisma.product.findMany({
      where: { isVisible: true },
      select: {
        id: true, code: true, name: true, slug: true, unitLabel: true, unitPrice: true,
        wholesalePrice: true, wholesaleMinQty: true, boxPrice: true, unitsPerBox: true,
        isVisible: true, stockUnits: true, brand: true, category: true, categoryRef: { select: { name: true } },
        imageUrl: true, localImageUrl: true, sourceImageUrl: true, updatedAt: true,
        media: { where: { type: "IMAGE" }, orderBy: { sortOrder: "asc" }, select: { url: true } },
        digitalProfile: { select: { status: true, descriptionShort: true, descriptionFull: true } },
        specifications: { orderBy: { sortOrder: "asc" }, select: { name: true, value: true } },
      },
    }),
    getCatalogReferenceBrands(),
  ]);
  return createCommercialCatalog(products, brands);
}

export type CommercialCatalog = Awaited<ReturnType<typeof loadCommercialCatalog>>;
export type CommercialProduct = CommercialCatalog["products"][number];
