import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { FacturadorClient } from "../src/lib/facturador/client";
import { buildBrandLookup, buildCategoryLookup, mapFacturadorProduct } from "../src/lib/facturador/mappers";
import { mirrorProductImageToLocal } from "../src/lib/product-image-storage";

loadEnvConfig(process.cwd());

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function matchesQuery(record: Record<string, unknown>, query: string) {
  const normalizedQuery = normalizeText(query);

  const candidates = [
    "internal_id",
    "item_code",
    "barcode",
    "code",
    "id",
    "item_id",
    "name",
    "description",
    "full_description",
  ]
    .map((key) => {
      const value = record[key];
      return typeof value === "string" ? value.trim().toLowerCase() : "";
    })
    .filter(Boolean);

  return candidates.some((candidate) => candidate === normalizedQuery || candidate.includes(normalizedQuery));
}

async function main() {
  const query = process.argv.slice(2).join(" ").trim() || process.env.ERP_PRODUCT_QUERY?.trim();

  if (!query) {
    throw new Error("Debes pasar un código o texto de búsqueda. Ejemplo: npm run sync:facturador-product -- L771");
  }

  const client = new FacturadorClient();
  const [categories, brands, products] = await Promise.all([
    client.getCategories().catch(() => []),
    client.getBrands().catch(() => []),
    client.searchProducts(query),
  ]);

  const product = products.find((item) => matchesQuery(item, query));

  if (!product) {
    throw new Error(`No se encontró el producto ${query} en el ERP.`);
  }

  const mapped = mapFacturadorProduct(
    product,
    {
      categories: buildCategoryLookup(categories),
      brands: buildBrandLookup(brands),
    },
    client.source,
    new Date(),
  );

  if (!mapped.ok) {
    throw new Error(mapped.reason);
  }

  const mirror = await mirrorProductImageToLocal({
    code: mapped.product.code,
    sourceUrl: mapped.product.imageUrl,
    versionKey: String(Date.now()),
    previousLocalUrl: null,
  });

  const imageUrl = mirror.localUrl ?? mapped.product.imageUrl;
  const now = new Date();

  await prisma.product.upsert({
    where: { code: mapped.product.code },
    create: {
      code: mapped.product.code,
      slug: mapped.product.slug,
      name: mapped.product.name,
      description: mapped.product.description,
      brand: mapped.product.brand,
      category: mapped.product.category,
      categoryId: mapped.product.categoryId,
      imageUrl,
      sourceImageUrl: mapped.product.imageUrl,
      localImageUrl: mirror.localUrl ?? null,
      unitLabel: mapped.product.unitLabel,
      unitPrice: new Prisma.Decimal(mapped.product.unitPrice),
      wholesalePrice:
        mapped.product.wholesalePrice === null ? null : new Prisma.Decimal(mapped.product.wholesalePrice),
      wholesaleMinQty: mapped.product.wholesaleMinQty,
      boxPrice: mapped.product.boxPrice === null ? null : new Prisma.Decimal(mapped.product.boxPrice),
      unitsPerBox: mapped.product.unitsPerBox,
      stockUnits: mapped.product.stockUnits,
      isVisible: mapped.product.isVisible,
      isFeatured: mapped.product.isFeatured,
      externalSource: mapped.product.externalSource,
      externalId: mapped.product.externalId,
      externalCode: mapped.product.externalCode,
      syncEnabled: mapped.product.syncEnabled,
      lastSyncedAt: now,
      syncHash: null,
      syncQuickHash: null,
      syncStockHash: null,
    },
    update: {
      slug: mapped.product.slug,
      name: mapped.product.name,
      // Preserve the store's editorial description on ERP updates.
      brand: mapped.product.brand,
      category: mapped.product.category,
      categoryId: mapped.product.categoryId,
      imageUrl,
      sourceImageUrl: mapped.product.imageUrl,
      localImageUrl: mirror.localUrl ?? null,
      unitLabel: mapped.product.unitLabel,
      unitPrice: new Prisma.Decimal(mapped.product.unitPrice),
      wholesalePrice:
        mapped.product.wholesalePrice === null ? null : new Prisma.Decimal(mapped.product.wholesalePrice),
      wholesaleMinQty: mapped.product.wholesaleMinQty,
      boxPrice: mapped.product.boxPrice === null ? null : new Prisma.Decimal(mapped.product.boxPrice),
      unitsPerBox: mapped.product.unitsPerBox,
      stockUnits: mapped.product.stockUnits,
      isVisible: mapped.product.isVisible,
      isFeatured: mapped.product.isFeatured,
      externalSource: mapped.product.externalSource,
      externalId: mapped.product.externalId,
      externalCode: mapped.product.externalCode,
      syncEnabled: mapped.product.syncEnabled,
      lastSyncedAt: now,
    },
  });

  console.log(
    JSON.stringify(
      {
        query,
        code: mapped.product.code,
        name: mapped.product.name,
        imageUrl,
        localImageUrl: mirror.localUrl ?? null,
        mirrored: mirror.mirrored,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
