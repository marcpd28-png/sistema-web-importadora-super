import { Prisma } from "@prisma/client";
import { mirrorProductImageToLocal } from "@/lib/product-image-storage";
import { prisma } from "@/lib/prisma";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 10;

type RefreshProductImagesInput = {
  afterCode?: string | null;
  batchSize?: number;
  concurrency?: number;
};

export type RefreshProductImagesResult = {
  checked: number;
  errors: number;
  metadataUpdated: number;
  nextCursor: string | null;
  refreshed: number;
};

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function refreshErpProductImages(
  input: RefreshProductImagesInput = {},
): Promise<RefreshProductImagesResult> {
  const batchSize = Math.max(1, Math.floor(input.batchSize ?? DEFAULT_BATCH_SIZE));
  const concurrency = Math.max(
    1,
    Math.floor(input.concurrency ?? DEFAULT_CONCURRENCY),
  );
  const products = await prisma.product.findMany({
    where: {
      syncEnabled: true,
      sourceImageUrl: { not: null },
      ...(input.afterCode ? { code: { gt: input.afterCode } } : {}),
    },
    orderBy: { code: "asc" },
    take: batchSize,
    select: {
      code: true,
      id: true,
      imageUrl: true,
      localImageUrl: true,
      sourceImageContentHash: true,
      sourceImageFingerprint: true,
      sourceImageUrl: true,
      syncHash: true,
    },
  });
  const result: RefreshProductImagesResult = {
    checked: products.length,
    errors: 0,
    metadataUpdated: 0,
    nextCursor:
      products.length === batchSize
        ? products[products.length - 1]?.code ?? null
        : null,
    refreshed: 0,
  };

  for (const chunk of chunkArray(products, concurrency)) {
    const chunkResults = await Promise.all(
      chunk.map(async (product) => {
        const image = await mirrorProductImageToLocal({
          clearWhenSourceMissing: true,
          code: product.code,
          previousContentHash: product.sourceImageContentHash,
          previousLocalUrl: product.localImageUrl,
          previousSourceFingerprint: product.sourceImageFingerprint,
          previousSourceUrl: product.sourceImageUrl,
          sourceUrl: product.sourceImageUrl,
          versionKey: product.syncHash ?? product.code,
        });

        if (image.error) {
          return "error" as const;
        }

        if (!image.metadataChanged) {
          return "unchanged" as const;
        }

        const visualChanged =
          image.mirrored || image.localUrl !== product.localImageUrl;

        if (visualChanged) {
          await prisma.product.update({
            where: { id: product.id },
            data: {
              imageUrl: image.localUrl ?? product.sourceImageUrl,
              localImageUrl: image.localUrl,
              sourceImageContentHash: image.contentHash,
              sourceImageFingerprint: image.sourceFingerprint,
            },
          });

          return "refreshed" as const;
        }

        // Los metadatos del origen no cambian el producto visible. SQL directo
        // evita mover updatedAt y refrescar innecesariamente todos los clientes.
        await prisma.$executeRaw(Prisma.sql`
          UPDATE "Product"
          SET
            "sourceImageContentHash" = ${image.contentHash},
            "sourceImageFingerprint" = ${image.sourceFingerprint}
          WHERE "id" = ${product.id}
        `);

        return "metadata" as const;
      }),
    );

    for (const status of chunkResults) {
      if (status === "error") {
        result.errors += 1;
      } else if (status === "refreshed") {
        result.refreshed += 1;
      } else if (status === "metadata") {
        result.metadataUpdated += 1;
      }
    }
  }

  return result;
}
