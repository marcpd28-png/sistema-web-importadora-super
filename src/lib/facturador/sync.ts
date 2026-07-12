import { Prisma, type ErpSyncTrigger } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import {
  FacturadorClient,
  FacturadorPageFetchError,
} from "@/lib/facturador/client";
import {
  buildBrandLookup,
  buildCategoryLookup,
  mapFacturadorProduct,
} from "@/lib/facturador/mappers";
import type {
  FacturadorBrand,
  FacturadorCategory,
  SyncableProduct,
} from "@/lib/facturador/types";
import { mirrorProductImageToLocal } from "@/lib/product-image-storage";
import { isBlockedPublicProductCode } from "@/lib/public-product-blocklist";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

const WRITE_BATCH_SIZE = 500;

export type FacturadorSyncMode =
  | "FULL"
  | "STOCK_PRICE"
  | "STOCK_ONLY"
  | "NEW_ONLY"
  | "INCREMENTAL";

export type FacturadorSyncSummary = {
  source: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: Array<{
    externalId: string | null;
    reason: string;
  }>;
};

export type FacturadorSyncOptions = {
  client?: FacturadorClient;
  trigger?: ErpSyncTrigger;
  initiatedByName?: string | null;
  initiatedByEmail?: string | null;
  syncMode?: FacturadorSyncMode;
};

export class ErpSyncCancelledError extends Error {
  constructor(message = "La sincronización fue cancelada desde el panel.") {
    super(message);
    this.name = "ErpSyncCancelledError";
  }
}

export class ErpSyncAlreadyRunningError extends Error {
  constructor(message = "Ya hay una sincronización ERP en ejecución.") {
    super(message);
    this.name = "ErpSyncAlreadyRunningError";
  }
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "No se pudo completar la sincronización con el ERP.";
}

function buildExternalKey(source: string, externalId: string) {
  return `${source}::${externalId}`;
}

export function parseFacturadorSyncMode(value: string | null | undefined): FacturadorSyncMode {
  const normalized = value?.trim().toUpperCase().replace(/-/g, "_") ?? "";

  if (normalized === "STOCK_PRICE" || normalized === "FAST" || normalized === "QUICK") {
    return "STOCK_PRICE";
  }

  if (normalized === "STOCK_ONLY" || normalized === "STOCK" || normalized === "MINUTE") {
    return "STOCK_ONLY";
  }

  if (normalized === "INCREMENTAL") {
    return "INCREMENTAL";
  }

  if (normalized === "NEW_ONLY") {
    return "NEW_ONLY";
  }

  return "FULL";
}

function getExistingProductSnapshot(
  product: Pick<PreparedSyncableProduct, "code" | "externalSource" | "externalId">,
  existingByCode: Map<string, ExistingProductSnapshot>,
  existingByExternal: Map<string, ExistingProductSnapshot>,
) {
  return (
    existingByExternal.get(buildExternalKey(product.externalSource, product.externalId)) ??
    existingByCode.get(product.code) ??
    null
  );
}

function buildProductSyncHash(
  product: Pick<
    SyncableProduct,
    | "code"
    | "slug"
    | "name"
    | "description"
    | "brand"
    | "category"
    | "categoryId"
    | "imageUrl"
    | "unitLabel"
    | "unitPrice"
    | "wholesalePrice"
    | "wholesaleMinQty"
    | "boxPrice"
    | "unitsPerBox"
    | "stockUnits"
    | "isVisible"
    | "isFeatured"
    | "externalSource"
    | "externalId"
    | "externalCode"
    | "syncEnabled"
  >,
) {
  const payload = {
    boxPrice: product.boxPrice ?? null,
    brand: product.brand ?? null,
    category: product.category ?? null,
    categoryId: product.categoryId ?? null,
    code: product.code,
    description: product.description ?? null,
    externalCode: product.externalCode ?? null,
    externalId: product.externalId,
    externalSource: product.externalSource,
    imageUrl: product.imageUrl ?? null,
    isFeatured: product.isFeatured,
    isVisible: product.isVisible,
    name: product.name,
    slug: product.slug,
    stockUnits: product.stockUnits,
    syncEnabled: product.syncEnabled,
    unitLabel: product.unitLabel,
    unitPrice: product.unitPrice,
    unitsPerBox: product.unitsPerBox ?? null,
    wholesaleMinQty: product.wholesaleMinQty,
    wholesalePrice: product.wholesalePrice ?? null,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildProductQuickSyncHash(
  product: Pick<
    SyncableProduct,
    | "code"
    | "externalSource"
    | "externalId"
    | "externalCode"
    | "imageUrl"
    | "stockUnits"
    | "unitPrice"
    | "wholesalePrice"
    | "wholesaleMinQty"
    | "boxPrice"
    | "unitsPerBox"
    | "isVisible"
    | "syncEnabled"
  >,
) {
  const payload = {
    boxPrice: product.boxPrice ?? null,
    code: product.code,
    externalCode: product.externalCode ?? null,
    externalId: product.externalId,
    externalSource: product.externalSource,
    imageUrl: product.imageUrl ?? null,
    isVisible: product.isVisible,
    stockUnits: product.stockUnits,
    syncEnabled: product.syncEnabled,
    unitPrice: product.unitPrice,
    unitsPerBox: product.unitsPerBox ?? null,
    wholesaleMinQty: product.wholesaleMinQty,
    wholesalePrice: product.wholesalePrice ?? null,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildProductStockSyncHash(
  product: Pick<
    SyncableProduct,
    | "code"
    | "externalSource"
    | "externalId"
    | "externalCode"
    | "stockUnits"
    | "isVisible"
    | "syncEnabled"
  >,
) {
  const payload = {
    code: product.code,
    externalCode: product.externalCode ?? null,
    externalId: product.externalId,
    externalSource: product.externalSource,
    isVisible: product.isVisible,
    stockUnits: product.stockUnits,
    syncEnabled: product.syncEnabled,
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function ensureSyncNotCancelled(syncLogId: string) {
  const log = await prisma.erpSyncLog.findUnique({
    where: { id: syncLogId },
    select: { status: true, cancelRequestedAt: true },
  });

  if (!log) {
    throw new ErpSyncCancelledError("La bitácora de sincronización ya no existe.");
  }

  if (log.status === "CANCELED" || log.cancelRequestedAt) {
    throw new ErpSyncCancelledError();
  }
}

async function prepareSyncSlot(client: FacturadorClient) {
  const staleStartedBefore = new Date(Date.now() - client.runningSyncTimeoutMs);

  await prisma.erpSyncLog.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: staleStartedBefore },
    },
    data: {
      status: "ERROR",
      errorMessage: "Sincronización cerrada automáticamente por exceder el tiempo máximo.",
      finishedAt: new Date(),
    },
  });

  const runningSync = await prisma.erpSyncLog.findFirst({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });

  if (runningSync) {
    throw new ErpSyncAlreadyRunningError(
      `Ya hay una sincronización ERP en ejecución desde ${runningSync.startedAt.toISOString()}.`,
    );
  }
}

async function loadIncrementalCheckpoint(source: string) {
  const lastSuccessfulSync = await prisma.erpSyncLog.findFirst({
    where: {
      source,
      status: "SUCCESS",
      finishedAt: { not: null },
    },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });

  return lastSuccessfulSync?.finishedAt ?? null;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => worker(),
    ),
  );

  return results;
}

function getStoredLocalImageUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed || !trimmed.startsWith("/")) {
    return null;
  }

  return trimmed;
}

type WritableProductMediaInput = {
  code: string;
  imageUrl: string | null;
  sourceImageUrl?: string | null;
  localImageUrl?: string | null;
  syncHash: string | null;
  syncQuickHash: string | null;
};

async function resolveWritableProductImages(
  product: WritableProductMediaInput,
  existingSnapshot: ExistingProductSnapshot | null,
) {
  const previousLocalUrl =
    existingSnapshot?.localImageUrl ??
    getStoredLocalImageUrl(existingSnapshot?.imageUrl) ??
    null;
  const sourceImageUrl = product.sourceImageUrl?.trim() ?? product.imageUrl?.trim() ?? null;
  const imageVersionKey = product.syncHash ?? product.syncQuickHash ?? product.code;
  const mirrored = await mirrorProductImageToLocal({
    clearWhenSourceMissing: true,
    code: product.code,
    previousContentHash: existingSnapshot?.sourceImageContentHash,
    sourceUrl: sourceImageUrl,
    versionKey: imageVersionKey ?? product.code,
    previousLocalUrl,
    previousSourceFingerprint: existingSnapshot?.sourceImageFingerprint,
    previousSourceUrl: existingSnapshot?.sourceImageUrl,
  });
  const localImageUrl = mirrored.localUrl;

  return {
    sourceImageUrl,
    localImageUrl,
    imageUrl: localImageUrl ?? sourceImageUrl ?? null,
    sourceImageContentHash: mirrored.contentHash,
    sourceImageFingerprint: mirrored.sourceFingerprint,
    imageMetadataChanged: mirrored.metadataChanged,
  };
}

type PreparedSyncableProduct = SyncableProduct & {
  categoryName: string | null;
};

type WriteAction = "created" | "updated";

type PreparedWritableProduct = SyncableProduct & {
  categoryName: string | null;
  categoryId: string | null;
  sourceImageUrl: string | null;
  localImageUrl: string | null;
  sourceImageContentHash: string | null;
  sourceImageFingerprint: string | null;
  syncHash: string | null;
  syncQuickHash: string | null;
  syncStockHash: string | null;
  writeAction: WriteAction;
};

type ExistingProductSnapshot = {
  id: string;
  imageUrl: string | null;
  localImageUrl: string | null;
  sourceImageContentHash: string | null;
  sourceImageFingerprint: string | null;
  sourceImageUrl: string | null;
  syncEnabled: boolean;
  syncHash: string | null;
  syncQuickHash: string | null;
  syncStockHash: string | null;
};

type ChunkUpsertResult = {
  created: number;
  updated: number;
  skipped: Array<{
    externalId: string | null;
    reason: string;
  }>;
};

async function updateSyncProgress(
  syncLogId: string,
  data: Partial<{
    fetchedCount: number;
    progressTotalCount: number;
    processedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
  }>,
) {
  await prisma.erpSyncLog.updateMany({
    where: { id: syncLogId, status: "RUNNING" },
    data,
  });
}

async function resolveCategoryIds(products: PreparedSyncableProduct[]) {
  const names = Array.from(
    new Set(
      products
        .map((product) => product.categoryName?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!names.length) {
    return new Map<string, string>();
  }

  await prisma.category.createMany({
    data: names.map((name) => ({
      name,
      slug: slugify(name),
    })),
    skipDuplicates: true,
  });

  const categories = await prisma.category.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });

  return new Map(categories.map((category) => [category.name, category.id]));
}

async function loadExistingProductMap(products: PreparedSyncableProduct[]) {
  if (!products.length) {
    return {
      existingByCode: new Map<string, ExistingProductSnapshot>(),
      existingByExternal: new Map<string, ExistingProductSnapshot>(),
    };
  }

  const codes = Array.from(new Set(products.map((product) => product.code)));
  const externalIds = Array.from(
    new Set(
      products
        .map((product) => product.externalId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const conditions: Prisma.ProductWhereInput[] = [];

  if (codes.length) {
    conditions.push({ code: { in: codes } });
  }

  if (externalIds.length) {
    conditions.push({
      externalSource: products[0].externalSource,
      externalId: { in: externalIds },
    });
  }

  const existingProducts = await prisma.product.findMany({
    where: conditions.length ? { OR: conditions } : undefined,
    select: {
      id: true,
      code: true,
      externalSource: true,
      externalId: true,
      imageUrl: true,
      localImageUrl: true,
      sourceImageContentHash: true,
      sourceImageFingerprint: true,
      sourceImageUrl: true,
      syncEnabled: true,
      syncHash: true,
      syncQuickHash: true,
      syncStockHash: true,
    },
  });

  const existingByCode = new Map<string, ExistingProductSnapshot>();
  const existingByExternal = new Map<string, ExistingProductSnapshot>();

  for (const product of existingProducts) {
    const snapshot = {
      id: product.id,
      imageUrl: product.imageUrl,
      localImageUrl: product.localImageUrl ?? getStoredLocalImageUrl(product.imageUrl),
      sourceImageContentHash: product.sourceImageContentHash,
      sourceImageFingerprint: product.sourceImageFingerprint,
      sourceImageUrl: product.sourceImageUrl,
      syncEnabled: product.syncEnabled,
      syncHash: product.syncHash,
      syncQuickHash: product.syncQuickHash,
      syncStockHash: product.syncStockHash,
    };
    existingByCode.set(product.code, snapshot);

    if (product.externalSource && product.externalId) {
      existingByExternal.set(
        buildExternalKey(product.externalSource, product.externalId),
        snapshot,
      );
    }
  }

  return {
    existingByCode,
    existingByExternal,
  };
}

export async function syncFacturadorProducts(options: FacturadorSyncOptions = {}) {
  const client = options.client ?? new FacturadorClient();
  const syncMode = options.syncMode ?? "FULL";
  const isQuickMode = syncMode === "STOCK_PRICE";
  const isStockOnlyMode = syncMode === "STOCK_ONLY";
  const isNewOnlyMode = syncMode === "NEW_ONLY";
  const isIncrementalMode = syncMode === "INCREMENTAL";
  await prepareSyncSlot(client);
  const syncedAt = new Date();
  const syncLog = await prisma.erpSyncLog.create({
    data: {
      source: client.source,
      trigger: options.trigger ?? "SCRIPT",
      syncMode,
      status: "RUNNING",
      fetchedCount: 0,
      progressTotalCount: 0,
      processedCount: 0,
      errorCount: 0,
      initiatedByName: options.initiatedByName ?? null,
      initiatedByEmail: options.initiatedByEmail ?? null,
      startedAt: syncedAt,
    },
    select: { id: true },
  });

  try {
    await ensureSyncNotCancelled(syncLog.id);

    const incrementalCheckpoint =
      isIncrementalMode && client.supportsIncrementalProductSync()
        ? await loadIncrementalCheckpoint(client.source)
        : null;

    if (isIncrementalMode && !client.supportsIncrementalProductSync()) {
      throw new Error(
        "El modo incremental real requiere FACTURADOR_SYNC_UPDATED_SINCE_PARAM para filtrar solo cambios del ERP.",
      );
    }

    const shouldLoadReferenceData = !isQuickMode && !isStockOnlyMode;

    const categories = shouldLoadReferenceData
      ? await client.getCategories()
      : ([] as FacturadorCategory[]);
    const brands = shouldLoadReferenceData ? await client.getBrands() : ([] as FacturadorBrand[]);
    const products = await client.getProducts({
      updatedSince:
        isIncrementalMode && incrementalCheckpoint ? incrementalCheckpoint : null,
      pageConcurrency: isQuickMode || isStockOnlyMode ? null : 1,
      pageDelayMs: isQuickMode || isStockOnlyMode ? null : 1000,
    });
    const categoryLookup = buildCategoryLookup(categories);
    const brandLookup = buildBrandLookup(brands);
    const summary: FacturadorSyncSummary = {
      source: client.source,
      fetched: products.length,
      created: 0,
      updated: 0,
      skipped: [],
    };
  let processedCount = 0;
  let errorCount = 0;
  const preparedProducts: PreparedSyncableProduct[] = [];
    const seenExternalKeys = new Set<string>();
    const seenCodes = new Set<string>();
    const syncedExternalIds = new Set<string>();

    for (const item of products) {
      const mapped = mapFacturadorProduct(
        item,
        {
          categories: categoryLookup,
          brands: brandLookup,
        },
        client.source,
        syncedAt,
      );

      if (!mapped.ok) {
        summary.skipped.push({
          externalId: mapped.externalId,
          reason: mapped.reason,
        });
        continue;
      }

      const externalKey = buildExternalKey(
        mapped.product.externalSource,
        mapped.product.externalId,
      );

      if (seenExternalKeys.has(externalKey) || seenCodes.has(mapped.product.code)) {
        summary.skipped.push({
          externalId: mapped.product.externalId,
          reason: "Producto duplicado dentro del mismo lote de sincronización.",
        });
        continue;
      }

      seenExternalKeys.add(externalKey);
      seenCodes.add(mapped.product.code);
      syncedExternalIds.add(mapped.product.externalId);

      preparedProducts.push({
        ...mapped.product,
        categoryName: mapped.categoryName,
      });
    }

    await ensureSyncNotCancelled(syncLog.id);
    const { existingByCode, existingByExternal } = await loadExistingProductMap(preparedProducts);
    await updateSyncProgress(syncLog.id, {
      fetchedCount: summary.fetched,
      progressTotalCount: preparedProducts.length,
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: summary.skipped.length,
      errorCount: 0,
    });
    let productsToWrite = preparedProducts;

    if (isQuickMode) {
      productsToWrite = preparedProducts.filter((product) => {
        const existingSnapshot = getExistingProductSnapshot(
          product,
          existingByCode,
          existingByExternal,
        );

        if (!existingSnapshot) {
          summary.skipped.push({
            externalId: product.externalId,
            reason: "Producto no existe localmente; omitido en sincronización rápida.",
          });
          return false;
        }

        return true;
      });
    } else if (isNewOnlyMode) {
      productsToWrite = preparedProducts.filter((product) => {
        const existingSnapshot = getExistingProductSnapshot(
          product,
          existingByCode,
          existingByExternal,
        );

        if (existingSnapshot) {
          summary.skipped.push({
            externalId: product.externalId,
            reason: "Producto ya vinculado. Omitido en modo solo nuevos.",
          });
          return false;
        }

        return true;
      });
    }

    const categoryIdsByName = isQuickMode
      ? new Map<string, string>()
      : await resolveCategoryIds(productsToWrite);

    const writeChunks = chunkArray(productsToWrite, WRITE_BATCH_SIZE);

    for (const chunk of writeChunks) {
      await ensureSyncNotCancelled(syncLog.id);

      const resolvedProducts = (
        await mapWithConcurrency(
          chunk,
          10,
          async (product) => {
            const categoryId = product.categoryName
              ? categoryIdsByName.get(product.categoryName) ?? null
              : null;
            const existingSnapshot =
              existingByExternal.get(
                buildExternalKey(product.externalSource, product.externalId),
              ) ?? existingByCode.get(product.code);

            if (isBlockedPublicProductCode(product.code)) {
              if (!existingSnapshot) {
                summary.skipped.push({
                  externalId: product.externalId,
                  reason: "Producto bloqueado para storefront. Omitido por regla interna.",
                });
                return null;
              }

              const hiddenProduct = {
                ...product,
                categoryId,
                imageUrl: product.imageUrl ?? null,
                isVisible: false,
                sourceImageUrl: existingSnapshot.sourceImageUrl ?? product.imageUrl ?? null,
                localImageUrl:
                  existingSnapshot.localImageUrl ??
                  getStoredLocalImageUrl(existingSnapshot.imageUrl) ??
                  null,
                sourceImageContentHash: existingSnapshot.sourceImageContentHash,
                sourceImageFingerprint: existingSnapshot.sourceImageFingerprint,
                stockUnits: 0,
                syncEnabled: false,
              };

              return {
                ...hiddenProduct,
                imageUrl: hiddenProduct.localImageUrl ?? hiddenProduct.sourceImageUrl ?? null,
                syncHash: buildProductSyncHash(hiddenProduct),
                syncQuickHash: buildProductQuickSyncHash(hiddenProduct),
                syncStockHash: buildProductStockSyncHash(hiddenProduct),
                writeAction: existingSnapshot ? ("updated" as const) : ("created" as const),
              };
            }

            if (existingSnapshot && existingSnapshot.syncEnabled === false) {
              summary.skipped.push({
                externalId: product.externalId,
                reason: "Producto bloqueado localmente. Omitido hasta reactivación manual.",
              });
              return null;
            }

            if (!existingSnapshot && isQuickMode) {
              summary.skipped.push({
                externalId: product.externalId,
                reason: "Producto no existe localmente; omitido en sincronización rápida.",
              });
              return null;
            }

            if (isStockOnlyMode) {
              const syncStockHash = buildProductStockSyncHash(product);
              const sourceImageUrl =
                existingSnapshot?.sourceImageUrl ?? product.imageUrl ?? null;
              const localImageUrl =
                existingSnapshot?.localImageUrl ??
                getStoredLocalImageUrl(existingSnapshot?.imageUrl) ??
                null;

              if (existingSnapshot && existingSnapshot.syncStockHash === syncStockHash) {
                summary.skipped.push({
                  externalId: product.externalId,
                  reason: "Sin cambios de stock respecto al último sync de stock.",
                });
                return null;
              }

              return {
                ...product,
                categoryId: null,
                sourceImageUrl,
                localImageUrl,
                imageUrl: localImageUrl ?? sourceImageUrl,
                sourceImageContentHash:
                  existingSnapshot?.sourceImageContentHash ?? null,
                sourceImageFingerprint:
                  existingSnapshot?.sourceImageFingerprint ?? null,
                syncHash: existingSnapshot?.syncHash ?? null,
                syncQuickHash: existingSnapshot?.syncQuickHash ?? null,
                syncStockHash,
                writeAction: "updated" as const,
              };
            }

            if (isQuickMode) {
              const syncQuickHash = buildProductQuickSyncHash(product);

              if (existingSnapshot && existingSnapshot.syncQuickHash === syncQuickHash) {
                summary.skipped.push({
                  externalId: product.externalId,
                  reason: "Sin cambios de stock/precio respecto al último sync rápido.",
                });
                return null;
              }

              const sourceImageChanged =
                (existingSnapshot?.sourceImageUrl?.trim() ?? "") !==
                (product.imageUrl?.trim() ?? "");
              const imageResolution = sourceImageChanged
                ? await resolveWritableProductImages(
                    {
                      ...product,
                      syncHash: existingSnapshot?.syncHash ?? null,
                      syncQuickHash,
                    },
                    existingSnapshot ?? null,
                  )
                : {
                    imageUrl:
                      existingSnapshot?.localImageUrl ??
                      existingSnapshot?.sourceImageUrl ??
                      product.imageUrl ??
                      null,
                    localImageUrl: existingSnapshot?.localImageUrl ?? null,
                    sourceImageContentHash:
                      existingSnapshot?.sourceImageContentHash ?? null,
                    sourceImageFingerprint:
                      existingSnapshot?.sourceImageFingerprint ?? null,
                    sourceImageUrl:
                      existingSnapshot?.sourceImageUrl ?? product.imageUrl ?? null,
                  };

              return {
                ...product,
                categoryId,
                sourceImageUrl: imageResolution.sourceImageUrl,
                localImageUrl: imageResolution.localImageUrl,
                imageUrl: imageResolution.imageUrl,
                sourceImageContentHash:
                  imageResolution.sourceImageContentHash,
                sourceImageFingerprint:
                  imageResolution.sourceImageFingerprint,
                syncHash: existingSnapshot?.syncHash ?? null,
                syncQuickHash,
                syncStockHash: buildProductStockSyncHash(product),
                writeAction: "updated" as const,
              };
            }

            const syncHash = buildProductSyncHash({
              ...product,
              categoryId,
            });
            const syncQuickHash = buildProductQuickSyncHash(product);
            const writeAction: WriteAction = existingSnapshot ? "updated" : "created";
            const imageResolution = await resolveWritableProductImages(
              {
                ...product,
                syncHash,
                syncQuickHash,
              },
              existingSnapshot ?? null,
            );

            if (
              existingSnapshot &&
              existingSnapshot.syncHash === syncHash &&
              !imageResolution.imageMetadataChanged
            ) {
              summary.skipped.push({
                externalId: product.externalId,
                reason: "Sin cambios reales respecto al último sync.",
              });
              return null;
            }

            return {
              ...product,
              categoryId,
              sourceImageUrl: imageResolution.sourceImageUrl,
              localImageUrl: imageResolution.localImageUrl,
              imageUrl: imageResolution.imageUrl,
              sourceImageContentHash:
                imageResolution.sourceImageContentHash,
              sourceImageFingerprint:
                imageResolution.sourceImageFingerprint,
              syncHash,
              syncQuickHash,
              syncStockHash: buildProductStockSyncHash(product),
              writeAction,
            };
          },
        )
      ).filter(Boolean) as PreparedWritableProduct[];

      const result = await upsertProductChunk(resolvedProducts, syncMode);
      summary.created += result.created;
      summary.updated += result.updated;
      summary.skipped.push(...result.skipped);
      processedCount += chunk.length;
      errorCount += result.skipped.length;

      await updateSyncProgress(syncLog.id, {
        processedCount,
        createdCount: summary.created,
        updatedCount: summary.updated,
        skippedCount: summary.skipped.length,
        errorCount,
      });
    }

    if (
      syncMode === "FULL" &&
      client.isFullProductSync() &&
      client.shouldHideMissingProducts() &&
      syncedExternalIds.size > 0
    ) {
      await prisma.product.updateMany({
        where: {
          syncEnabled: true,
          externalSource: client.source,
          externalId: { notIn: Array.from(syncedExternalIds) },
        },
        data: {
          isVisible: false,
          stockUnits: 0,
        },
      });
    }

    const completed = await prisma.erpSyncLog.updateMany({
      where: {
        id: syncLog.id,
        status: "RUNNING",
        cancelRequestedAt: null,
      },
      data: {
        status: "SUCCESS",
        fetchedCount: summary.fetched,
        createdCount: summary.created,
        updatedCount: summary.updated,
        skippedCount: summary.skipped.length,
        skippedPreview: summary.skipped.slice(0, 15) as Prisma.JsonArray,
        finishedAt: new Date(),
      },
    });

    if (completed.count === 0) {
      throw new ErpSyncCancelledError();
    }

    return summary;
  } catch (error) {
    if (error instanceof ErpSyncCancelledError) {
      await prisma.erpSyncLog.updateMany({
        where: { id: syncLog.id, status: "RUNNING" },
        data: {
          status: "CANCELED",
          errorMessage: error.message,
          finishedAt: new Date(),
        },
      });

      throw error;
    }

    const pageError =
      error instanceof FacturadorPageFetchError
        ? error
        : error instanceof Error
          ? null
          : null;

    await prisma.erpSyncLog.updateMany({
      where: { id: syncLog.id, status: "RUNNING" },
      data: {
        status: "ERROR",
        errorMessage: normalizeErrorMessage(error),
        failedPage: pageError?.page ?? null,
        failedPageMessage: pageError?.message ?? null,
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}

async function upsertProductChunk(
  products: Array<PreparedWritableProduct>,
  syncMode: FacturadorSyncMode,
): Promise<ChunkUpsertResult> {
  if (!products.length) {
    return {
      created: 0,
      updated: 0,
      skipped: [],
    };
  }

  const rows = products.map((product) => buildProductRow(product));
  const isQuickMode = syncMode === "STOCK_PRICE";
  const isStockOnlyMode = syncMode === "STOCK_ONLY";

  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Product" (
        "id",
        "code",
        "slug",
        "name",
        "description",
        "brand",
        "category",
        "categoryId",
        "imageUrl",
        "sourceImageUrl",
        "localImageUrl",
        "sourceImageFingerprint",
        "sourceImageContentHash",
        "unitLabel",
        "unitPrice",
        "wholesalePrice",
        "wholesaleMinQty",
        "boxPrice",
        "unitsPerBox",
        "stockUnits",
        "isVisible",
        "isFeatured",
        "createdAt",
        "updatedAt",
        "externalSource",
        "externalId",
        "externalCode",
        "syncEnabled",
        "lastSyncedAt",
        "syncHash",
        "syncQuickHash",
        "syncStockHash"
      )
      VALUES ${Prisma.join(rows)}
      ON CONFLICT ("code") DO UPDATE
      SET
        ${isStockOnlyMode
          ? Prisma.sql`
              "stockUnits" = EXCLUDED."stockUnits",
              "isVisible" = EXCLUDED."isVisible",
              "syncEnabled" = EXCLUDED."syncEnabled",
              "lastSyncedAt" = EXCLUDED."lastSyncedAt",
              "syncStockHash" = EXCLUDED."syncStockHash",
              "updatedAt" = CURRENT_TIMESTAMP
            `
          : isQuickMode
          ? Prisma.sql`
              "unitPrice" = EXCLUDED."unitPrice",
              "wholesalePrice" = EXCLUDED."wholesalePrice",
              "wholesaleMinQty" = EXCLUDED."wholesaleMinQty",
              "boxPrice" = EXCLUDED."boxPrice",
              "unitsPerBox" = EXCLUDED."unitsPerBox",
              "stockUnits" = EXCLUDED."stockUnits",
              "imageUrl" = EXCLUDED."imageUrl",
              "sourceImageUrl" = EXCLUDED."sourceImageUrl",
              "localImageUrl" = EXCLUDED."localImageUrl",
              "sourceImageFingerprint" = EXCLUDED."sourceImageFingerprint",
              "sourceImageContentHash" = EXCLUDED."sourceImageContentHash",
              "isVisible" = EXCLUDED."isVisible",
              "syncEnabled" = EXCLUDED."syncEnabled",
              "lastSyncedAt" = EXCLUDED."lastSyncedAt",
              "syncQuickHash" = EXCLUDED."syncQuickHash",
              "syncStockHash" = EXCLUDED."syncStockHash",
              "updatedAt" = CURRENT_TIMESTAMP
            `
          : Prisma.sql`
              "slug" = EXCLUDED."slug",
              "name" = EXCLUDED."name",
              "description" = EXCLUDED."description",
              "brand" = EXCLUDED."brand",
              "category" = EXCLUDED."category",
              "categoryId" = EXCLUDED."categoryId",
              "imageUrl" = EXCLUDED."imageUrl",
              "sourceImageUrl" = EXCLUDED."sourceImageUrl",
              "localImageUrl" = EXCLUDED."localImageUrl",
              "sourceImageFingerprint" = EXCLUDED."sourceImageFingerprint",
              "sourceImageContentHash" = EXCLUDED."sourceImageContentHash",
              "unitLabel" = EXCLUDED."unitLabel",
              "unitPrice" = EXCLUDED."unitPrice",
              "wholesalePrice" = EXCLUDED."wholesalePrice",
              "wholesaleMinQty" = EXCLUDED."wholesaleMinQty",
              "boxPrice" = EXCLUDED."boxPrice",
              "unitsPerBox" = EXCLUDED."unitsPerBox",
              "stockUnits" = EXCLUDED."stockUnits",
              "isVisible" = EXCLUDED."isVisible",
              "isFeatured" = EXCLUDED."isFeatured",
              "externalSource" = EXCLUDED."externalSource",
              "externalId" = EXCLUDED."externalId",
              "externalCode" = EXCLUDED."externalCode",
              "syncEnabled" = EXCLUDED."syncEnabled",
              "lastSyncedAt" = EXCLUDED."lastSyncedAt",
              "syncHash" = EXCLUDED."syncHash",
              "syncQuickHash" = EXCLUDED."syncQuickHash",
              "syncStockHash" = EXCLUDED."syncStockHash",
              "updatedAt" = CURRENT_TIMESTAMP
            `}
    `);

    return {
      created: products.filter((product) => product.writeAction === "created").length,
      updated: products.filter((product) => product.writeAction === "updated").length,
      skipped: [],
    };
  } catch (error) {
    const skipped: ChunkUpsertResult["skipped"] = [];
    let created = 0;
    let updated = 0;

    for (const product of products) {
      try {
        const createData = buildPrismaProductCreateData(product);
        const updateData = buildPrismaProductUpdateData(product, syncMode);
        await prisma.product.upsert({
          where: { code: product.code },
          create: createData,
          update: updateData,
        });

        if (product.writeAction === "created") {
          created += 1;
        } else {
          updated += 1;
        }
      } catch (itemError) {
        skipped.push({
          externalId: product.externalId,
          reason: normalizeErrorMessage(itemError ?? error),
        });
      }
    }

    return { created, updated, skipped };
  }
}

function buildProductRow(
  product: PreparedWritableProduct,
) {
  return Prisma.sql`(
    ${randomUUID()},
    ${product.code},
    ${product.slug},
    ${product.name},
    ${product.description},
    ${product.brand},
    ${product.category},
    ${product.categoryId},
    ${product.imageUrl},
    ${product.sourceImageUrl ?? product.imageUrl ?? null},
    ${product.localImageUrl ?? null},
    ${product.sourceImageFingerprint},
    ${product.sourceImageContentHash},
    ${product.unitLabel},
    ${product.unitPrice},
    ${product.wholesalePrice},
    ${product.wholesaleMinQty},
    ${product.boxPrice},
    ${product.unitsPerBox},
    ${product.stockUnits},
    ${product.isVisible},
    ${product.isFeatured},
    ${product.lastSyncedAt},
    ${product.lastSyncedAt},
    ${product.externalSource},
    ${product.externalId},
    ${product.externalCode},
    ${product.syncEnabled},
    ${product.lastSyncedAt},
    ${product.syncHash},
    ${product.syncQuickHash},
    ${product.syncStockHash}
  )`;
}

function buildPrismaProductCreateData(product: PreparedWritableProduct) {
  return {
    code: product.code,
    slug: product.slug,
    name: product.name,
    description: product.description,
    brand: product.brand,
    category: product.category,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    sourceImageUrl: product.sourceImageUrl ?? product.imageUrl ?? null,
    localImageUrl: product.localImageUrl ?? null,
    sourceImageFingerprint: product.sourceImageFingerprint,
    sourceImageContentHash: product.sourceImageContentHash,
    unitLabel: product.unitLabel,
    unitPrice: new Prisma.Decimal(product.unitPrice),
    wholesalePrice: product.wholesalePrice === null ? null : new Prisma.Decimal(product.wholesalePrice),
    wholesaleMinQty: product.wholesaleMinQty,
    boxPrice: product.boxPrice === null ? null : new Prisma.Decimal(product.boxPrice),
    unitsPerBox: product.unitsPerBox,
    stockUnits: product.stockUnits,
    isVisible: product.isVisible,
    isFeatured: product.isFeatured,
    externalSource: product.externalSource,
    externalId: product.externalId,
    externalCode: product.externalCode,
    syncEnabled: product.syncEnabled,
    lastSyncedAt: product.lastSyncedAt,
    syncHash: product.syncHash,
    syncQuickHash: product.syncQuickHash,
    syncStockHash: product.syncStockHash,
  };
}

function buildPrismaProductUpdateData(
  product: PreparedWritableProduct,
  syncMode: FacturadorSyncMode,
) {
  if (syncMode === "STOCK_PRICE") {
    return {
      unitPrice: new Prisma.Decimal(product.unitPrice),
      wholesalePrice:
        product.wholesalePrice === null ? null : new Prisma.Decimal(product.wholesalePrice),
      wholesaleMinQty: product.wholesaleMinQty,
      boxPrice: product.boxPrice === null ? null : new Prisma.Decimal(product.boxPrice),
      unitsPerBox: product.unitsPerBox,
      stockUnits: product.stockUnits,
      imageUrl: product.imageUrl,
      sourceImageUrl: product.sourceImageUrl,
      localImageUrl: product.localImageUrl,
      sourceImageFingerprint: product.sourceImageFingerprint,
      sourceImageContentHash: product.sourceImageContentHash,
      isVisible: product.isVisible,
      syncEnabled: product.syncEnabled,
      lastSyncedAt: product.lastSyncedAt,
      syncQuickHash: product.syncQuickHash,
      syncStockHash: product.syncStockHash,
    };
  }

  if (syncMode === "STOCK_ONLY") {
    return {
      stockUnits: product.stockUnits,
      isVisible: product.isVisible,
      syncEnabled: product.syncEnabled,
      lastSyncedAt: product.lastSyncedAt,
      syncStockHash: product.syncStockHash,
    };
  }

  return {
    ...buildPrismaProductCreateData(product),
    sourceImageUrl: product.sourceImageUrl ?? product.imageUrl ?? null,
    localImageUrl: product.localImageUrl ?? null,
    syncStockHash: product.syncStockHash,
  };
}
