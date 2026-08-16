import type { ComplaintStatus, Prisma, QuoteStatus } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_PAGE_SIZE,
  buildComparisonMetric,
  buildWhere,
  buildMissingProductPhotoWhere,
  buildRealProductPhotoWhere,
  buildSellableProductWhere,
  calculateDeltaPercent,
  mapCatalogMovementProduct,
  mapErpSyncLog,
  mapProduct,
  hasRealProductPhoto,
} from "@/lib/store-shared";
import { getPreferredProductImageUrl } from "@/lib/product-media";
import type {
  AdminProductListItem,
  AdminCategory,
  AdminComplaintDetailView,
  AdminComplaintView,
  AdminComplaintsData,
  AdminQuoteDetailView,
  AdminQuotePdfNotificationView,
  AdminQuotesData,
  AdminQuoteStatusStepView,
  DashboardPeriod,
  DashboardTrendProduct,
  ErpSyncLogView,
  ShopperAccountView,
  ShopperQuoteDetailView,
  ShopperQuoteView,
} from "@/lib/store-types";

const ADMIN_QUOTES_PAGE_SIZE = 10;
const ADMIN_COMPLAINTS_PAGE_SIZE = 10;

function shouldLogAdminPerf() {
  return process.env.NODE_ENV !== "production" || process.env.ADMIN_PERF_LOGS === "true";
}

async function profileAdminStep<T>(label: string, step: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const result = await step();

  if (shouldLogAdminPerf()) {
    console.info(`[admin-perf] ${label}: ${Date.now() - startedAt}ms`);
  }

  return result;
}

function logAdminPayload(
  scope: string,
  payload: unknown,
  startedAt: number,
  recordCount?: number,
) {
  if (!shouldLogAdminPerf()) {
    return;
  }

  const serialized = JSON.stringify(payload);
  const sizeKb = Buffer.byteLength(serialized, "utf8") / 1024;

  console.info(
    `[admin-perf] ${scope}: total=${Date.now() - startedAt}ms records=${recordCount ?? "n/a"} size=${sizeKb.toFixed(1)}KB`,
  );
}

function mapQuoteStatusSteps(value: Prisma.JsonValue | null): AdminQuoteStatusStepView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, Prisma.JsonValue>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    const rawStatus = typeof record.status === "string" ? record.status : "warning";

    if (!text) {
      return [];
    }

    return [
      {
        status:
          rawStatus === "success" || rawStatus === "error" || rawStatus === "warning"
            ? rawStatus
            : "warning",
        text,
      },
    ];
  });
}

function mapQuotePdfNotification(value: Prisma.JsonValue | null): AdminQuotePdfNotificationView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, Prisma.JsonValue>;
  const nestedCustomer =
    record.customer && typeof record.customer === "object" && !Array.isArray(record.customer)
      ? (record.customer as Record<string, Prisma.JsonValue>)
      : null;
  const nestedInternal =
    record.internal && typeof record.internal === "object" && !Array.isArray(record.internal)
      ? (record.internal as Record<string, Prisma.JsonValue>)
      : null;
  const nestedMessage =
    nestedCustomer && typeof nestedCustomer.message === "string"
      ? nestedCustomer.message.trim()
      : nestedInternal && typeof nestedInternal.message === "string"
        ? nestedInternal.message.trim()
        : "";

  return {
    message:
      typeof record.message === "string" && record.message.trim()
        ? record.message.trim()
        : nestedMessage || "Sin detalle de notificación.",
    ok: record.ok === true,
    sent: record.sent === true,
  };
}

function getDashboardPeriodRange(period: DashboardPeriod, offset = 0) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === "WEEK") {
    const day = now.getDay();
    const distanceFromMonday = day === 0 ? 6 : day - 1;
    start.setDate(now.getDate() - distanceFromMonday + offset * 7);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
    return { start, end };
  }

  if (period === "YEAR") {
    start.setFullYear(now.getFullYear() + offset, 0, 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setFullYear(start.getFullYear() + 1);
    return { start, end };
  }

  start.setFullYear(now.getFullYear(), now.getMonth() + offset, 1);
  start.setHours(0, 0, 0, 0);
  end.setTime(start.getTime());
  end.setMonth(start.getMonth() + 1);
  return { start, end };
}

function formatDashboardPeriodTitle(period: DashboardPeriod, range: { start: Date; end: Date }) {
  if (period === "WEEK") {
    const formatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short" });
    const lastDay = new Date(range.end.getTime() - 1);
    return `${formatter.format(range.start)} - ${formatter.format(lastDay)}`;
  }

  if (period === "YEAR") {
    return new Intl.DateTimeFormat("es-PE", { year: "numeric" }).format(range.start);
  }

  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(
    range.start,
  );
}

export async function getRecentErpSyncLogs(limit = 5): Promise<ErpSyncLogView[]> {
  const logs = await prisma.erpSyncLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      source: true,
      trigger: true,
      syncMode: true,
      status: true,
      fetchedCount: true,
      progressTotalCount: true,
      processedCount: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      errorCount: true,
      failedPage: true,
      failedPageMessage: true,
      errorMessage: true,
      cancelRequestedAt: true,
      initiatedByName: true,
      initiatedByEmail: true,
      canceledByName: true,
      canceledByEmail: true,
      startedAt: true,
      finishedAt: true,
      updatedAt: true,
    },
  });

  return logs.map((log) => mapErpSyncLog(log as Parameters<typeof mapErpSyncLog>[0]));
}

function mapComplaintView(
  complaint: {
    id: string;
    claimCode: string;
    kind: string;
    subject: string;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    status: ComplaintStatus;
    createdAt: Date;
    respondedAt: Date | null;
    responseText: string | null;
    responseChannel: string | null;
  },
): AdminComplaintView {
  return {
    id: complaint.id,
    claimCode: complaint.claimCode,
    kind: complaint.kind as AdminComplaintView["kind"],
    subject: complaint.subject,
    customerName: complaint.customerName,
    customerPhone: complaint.customerPhone,
    customerEmail: complaint.customerEmail,
    status: complaint.status,
    createdAt: complaint.createdAt.toISOString(),
    respondedAt: complaint.respondedAt?.toISOString() ?? null,
    responseText: complaint.responseText,
    responseChannel: complaint.responseChannel,
  };
}

export async function getAdminComplaints(input: {
  page?: number;
  status?: ComplaintStatus | "all";
} = {}): Promise<AdminComplaintsData> {
  const startedAt = Date.now();
  const page = Math.max(1, input.page ?? 1);
  const where =
    input.status && input.status !== "all"
      ? {
          status: input.status,
        }
      : undefined;

  const [
    complaints,
    totalResults,
    totalAll,
    totalNew,
    totalInReview,
    totalResponded,
    totalClosed,
  ] = await Promise.all([
    profileAdminStep("complaints.page", () =>
      prisma.complaint.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * ADMIN_COMPLAINTS_PAGE_SIZE,
        take: ADMIN_COMPLAINTS_PAGE_SIZE,
        select: {
          id: true,
          claimCode: true,
          kind: true,
          subject: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          status: true,
          createdAt: true,
          respondedAt: true,
          responseText: true,
          responseChannel: true,
        },
      }),
    ),
    profileAdminStep("complaints.filtered", () => prisma.complaint.count({ where })),
    profileAdminStep("complaints.total", () => prisma.complaint.count()),
    profileAdminStep("complaints.new", () =>
      prisma.complaint.count({ where: { status: "NEW" } }),
    ),
    profileAdminStep("complaints.in-review", () =>
      prisma.complaint.count({ where: { status: "IN_REVIEW" } }),
    ),
    profileAdminStep("complaints.responded", () =>
      prisma.complaint.count({ where: { status: "RESPONDED" } }),
    ),
    profileAdminStep("complaints.closed", () =>
      prisma.complaint.count({ where: { status: "CLOSED" } }),
    ),
  ]);

  const payload = {
    complaints: complaints.map((complaint) => mapComplaintView(complaint)),
    page,
    pageSize: ADMIN_COMPLAINTS_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(totalResults / ADMIN_COMPLAINTS_PAGE_SIZE)),
    totalResults,
    stats: {
      all: totalAll,
      new: totalNew,
      inReview: totalInReview,
      responded: totalResponded,
      closed: totalClosed,
    },
  };

  logAdminPayload("complaints.payload", payload, startedAt, complaints.length);

  return payload;
}

export async function getAdminComplaintById(
  complaintId: string,
): Promise<AdminComplaintDetailView | null> {
  const complaint = await prisma.complaint.findFirst({
    where: { id: complaintId },
    select: {
      id: true,
      claimCode: true,
      kind: true,
      subject: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      documentType: true,
      documentNumber: true,
      orderNumber: true,
      productReference: true,
      detail: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      respondedAt: true,
      responseText: true,
      responseChannel: true,
    },
  });

  if (!complaint) {
    return null;
  }

  return {
    ...mapComplaintView(complaint),
    documentType: complaint.documentType,
    documentNumber: complaint.documentNumber,
    orderNumber: complaint.orderNumber,
    productReference: complaint.productReference,
    detail: complaint.detail,
    updatedAt: complaint.updatedAt.toISOString(),
  };
}

async function getAdminDashboardDataRaw(period: DashboardPeriod = "MONTH") {
  const startedAt = Date.now();
  const currentRange = getDashboardPeriodRange(period, 0);
  const previousRange = getDashboardPeriodRange(period, -1);
  const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const [
    totalProducts,
    visibleProducts,
    visibleWithPhotoProducts,
    needsReviewProducts,
    hiddenProducts,
    lowStockProducts,
    outOfStockProducts,
    hiddenOutOfStockProducts,
    visibleOutOfStockProducts,
    hiddenWithoutPhotoProducts,
    visibleWithoutPhotoProducts,
    productsWithoutPhoto,
    totalCategories,
    settings,
    currentSyncAggregate,
    previousSyncAggregate,
    lastSync,
    syncedProducts,
    neverSyncedProducts,
    staleSyncedProducts,
    recentlySyncedProducts,
    lowAvailabilityProducts,
  ] = await Promise.all([
    profileAdminStep("dashboard.total-products", () => prisma.product.count()),
    profileAdminStep("dashboard.visible-products", () =>
      prisma.product.count({ where: buildSellableProductWhere() }),
    ),
    profileAdminStep("dashboard.visible-with-photo-products", () =>
      prisma.product.count({
        where: {
          AND: [{ isVisible: true }, buildRealProductPhotoWhere()],
        },
      }),
    ),
    profileAdminStep("dashboard.needs-review-products", () =>
      prisma.product.count({
        where: {
          isVisible: true,
          OR: [{ stockUnits: { lte: 0 } }, buildMissingProductPhotoWhere()],
        },
      }),
    ),
    profileAdminStep("dashboard.hidden-products", () => prisma.product.count({ where: { isVisible: false } })),
    profileAdminStep("dashboard.low-stock-products", () =>
      prisma.product.count({ where: { stockUnits: { gt: 0, lte: 12 } } }),
    ),
    profileAdminStep("dashboard.out-of-stock-products", () =>
      prisma.product.count({ where: { stockUnits: { lte: 0 } } }),
    ),
    profileAdminStep("dashboard.hidden-oos-products", () =>
      prisma.product.count({
        where: { syncEnabled: true, isVisible: false, stockUnits: { lte: 0 } },
      }),
    ),
    profileAdminStep("dashboard.visible-oos-products", () =>
      prisma.product.count({
        where: { syncEnabled: true, isVisible: true, stockUnits: { lte: 0 } },
      }),
    ),
    profileAdminStep("dashboard.hidden-without-photo", () =>
      prisma.product.count({
        where: { AND: [{ isVisible: false }, buildMissingProductPhotoWhere()] },
      }),
    ),
    profileAdminStep("dashboard.visible-without-photo", () =>
      prisma.product.count({
        where: { AND: [{ isVisible: true }, buildMissingProductPhotoWhere()] },
      }),
    ),
    profileAdminStep("dashboard.products-without-photo", () =>
      prisma.product.count({ where: buildMissingProductPhotoWhere() }),
    ),
    profileAdminStep("dashboard.total-categories", () => prisma.category.count()),
    profileAdminStep("dashboard.settings", () => prisma.storeSettings.findUnique({ where: { id: 1 } })),
    profileAdminStep("dashboard.current-sync-aggregate", () =>
      prisma.erpSyncLog.aggregate({
        where: {
          startedAt: { gte: currentRange.start, lt: currentRange.end },
          status: "SUCCESS",
        },
        _sum: {
          fetchedCount: true,
          createdCount: true,
          updatedCount: true,
          skippedCount: true,
        },
        _count: true,
      }),
    ),
    profileAdminStep("dashboard.previous-sync-aggregate", () =>
      prisma.erpSyncLog.aggregate({
        where: {
          startedAt: { gte: previousRange.start, lt: previousRange.end },
          status: "SUCCESS",
        },
        _sum: {
          fetchedCount: true,
          createdCount: true,
          updatedCount: true,
          skippedCount: true,
        },
        _count: true,
      }),
    ),
    profileAdminStep("dashboard.last-sync", () =>
      prisma.erpSyncLog.findFirst({
        orderBy: { startedAt: "desc" },
      }),
    ),
    profileAdminStep("dashboard.synced-products", () =>
      prisma.product.count({ where: { syncEnabled: true } }),
    ),
    profileAdminStep("dashboard.never-synced-products", () =>
      prisma.product.count({ where: { lastSyncedAt: null } }),
    ),
    profileAdminStep("dashboard.stale-synced-products", () =>
      prisma.product.count({ where: { syncEnabled: true, lastSyncedAt: { lt: staleDate } } }),
    ),
    profileAdminStep("dashboard.recently-synced-products", () =>
      prisma.product.findMany({
        where: { syncEnabled: true, lastSyncedAt: { not: null } },
        orderBy: [{ lastSyncedAt: "desc" }, { stockUnits: "desc" }],
        take: 4,
        select: {
          code: true,
          name: true,
          stockUnits: true,
          lastSyncedAt: true,
          updatedAt: true,
        },
      }),
    ),
    profileAdminStep("dashboard.low-availability-products", () =>
      prisma.product.findMany({
        where: { isVisible: true, stockUnits: { gt: 0, lte: 12 } },
        orderBy: [{ stockUnits: "asc" }, { lastSyncedAt: "asc" }],
        take: 4,
        select: {
          code: true,
          name: true,
          stockUnits: true,
          lastSyncedAt: true,
          updatedAt: true,
        },
      }),
    ),
  ]);

  const currentFetched = currentSyncAggregate._sum.fetchedCount ?? 0;
  const previousFetched =
    previousSyncAggregate._count > 0 ? previousSyncAggregate._sum.fetchedCount ?? 0 : null;
  const currentTouched =
    (currentSyncAggregate._sum.createdCount ?? 0) +
    (currentSyncAggregate._sum.updatedCount ?? 0);
  const previousTouched =
    previousSyncAggregate._count > 0
      ? (previousSyncAggregate._sum.createdCount ?? 0) +
        (previousSyncAggregate._sum.updatedCount ?? 0)
      : null;
  const currentSkipped = currentSyncAggregate._sum.skippedCount ?? 0;
  const previousSkipped =
    previousSyncAggregate._count > 0 ? previousSyncAggregate._sum.skippedCount ?? 0 : null;
  const risingProducts: DashboardTrendProduct[] = recentlySyncedProducts.map((product) =>
    mapCatalogMovementProduct(product, "RISING", new Date()),
  );
  const fallingProducts: DashboardTrendProduct[] = lowAvailabilityProducts.map((product) =>
    mapCatalogMovementProduct(product, "FALLING", new Date()),
  );
  const trendProducts = [...risingProducts, ...fallingProducts];
  const maxUnitsSold = trendProducts.length
    ? Math.max(...trendProducts.map((product) => product.unitsSold))
    : 1;
  const successfulSyncs = currentSyncAggregate._count;
  const payload = {
    totalProducts,
    visibleProducts,
    visibleWithPhotoProducts,
    needsReviewProducts,
    hiddenProducts,
    lowStockProducts,
    outOfStockProducts,
    totalCategories,
    currencySymbol: settings?.currencySymbol ?? "S/",
    selectedPeriod: period,
    dataFreshness: {
      sourceLabel: lastSync?.source ?? "ERP",
      lastSyncAt: lastSync?.startedAt.toISOString() ?? null,
      lastSyncStatus: lastSync?.status ?? null,
      syncedProducts,
      neverSyncedProducts,
      staleSyncedProducts,
      outOfStockProducts,
      hiddenOutOfStockProducts,
      visibleOutOfStockProducts,
      hiddenWithoutPhotoProducts,
      visibleWithoutPhotoProducts,
      needsReviewProducts,
      productsWithoutPhoto,
    },
    trendAnalysis: {
      title: formatDashboardPeriodTitle(period, currentRange),
      previousTitle:
        previousSyncAggregate._count > 0
          ? formatDashboardPeriodTitle(period, previousRange)
          : null,
      forecast: {
        currentValue: syncedProducts,
        previousValue: totalProducts,
        deltaPercent: calculateDeltaPercent(syncedProducts, totalProducts || null),
        gap: totalProducts - syncedProducts,
        completionRate:
          totalProducts > 0 ? Math.min(100, (syncedProducts / totalProducts) * 100) : null,
      },
      comparisonMetrics: [
        buildComparisonMetric("Traídos del ERP", currentFetched, previousFetched),
        buildComparisonMetric("Creados/actualizados", currentTouched, previousTouched),
        buildComparisonMetric(
          "Sincronizaciones OK",
          successfulSyncs,
          previousSyncAggregate._count || null,
        ),
        buildComparisonMetric("Omitidos", currentSkipped, previousSkipped),
      ],
      topRisingProducts: risingProducts,
      topFallingProducts: fallingProducts,
      maxUnitsSold,
    },
  };

  logAdminPayload(
    "dashboard.payload",
    payload,
    startedAt,
    recentlySyncedProducts.length + lowAvailabilityProducts.length,
  );

  return payload;
}

export const getAdminDashboardData = unstable_cache(
  async (period: DashboardPeriod = "MONTH") => {
    return getAdminDashboardDataRaw(period);
  },
  ["admin-dashboard-key"],
  { revalidate: 600, tags: ["admin-dashboard"] }
);

export const getAdminProductStatsCached = unstable_cache(
  async (staleDateMs: number) => {
    const staleDate = new Date(staleDateMs);
    const [
      totalProducts,
      visibleProductsCount,
      hiddenProductsCount,
      withPhotoProductsCount,
      withoutPhotoProductsCount,
      needsReviewProductsCount,
      lowStockProductsCount,
      outOfStockProductsCount,
      syncedProductsCount,
      unsyncedProductsCount,
      staleSyncedProductsCount,
      featuredProductsCount,
      hiddenWithStockProductsCount,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: buildSellableProductWhere() }),
      prisma.product.count({ where: { isVisible: false } }),
      prisma.product.count({ where: buildRealProductPhotoWhere() }),
      prisma.product.count({ where: buildMissingProductPhotoWhere() }),
      prisma.product.count({
        where: {
          isVisible: true,
          OR: [{ stockUnits: { lte: 0 } }, buildMissingProductPhotoWhere()],
        },
      }),
      prisma.product.count({ where: { stockUnits: { gt: 0, lte: 12 } } }),
      prisma.product.count({ where: { stockUnits: { lte: 0 } } }),
      prisma.product.count({ where: { syncEnabled: true } }),
      prisma.product.count({ where: { syncEnabled: false } }),
      prisma.product.count({ where: { syncEnabled: true, lastSyncedAt: { lt: staleDate } } }),
      prisma.product.count({ where: { isFeatured: true } }),
      prisma.product.count({ where: { isVisible: false, stockUnits: { gt: 0 } } }),
    ]);

    return {
      totalProducts,
      visibleProductsCount,
      hiddenProductsCount,
      withPhotoProductsCount,
      withoutPhotoProductsCount,
      needsReviewProductsCount,
      lowStockProductsCount,
      outOfStockProductsCount,
      syncedProductsCount,
      unsyncedProductsCount,
      staleSyncedProductsCount,
      featuredProductsCount,
      hiddenWithStockProductsCount,
    };
  },
  ["admin-product-stats-key"],
  { revalidate: 600, tags: ["admin-product-stats"] }
);


export async function getAdminProducts(input: {
  query?: string;
  category?: string;
  brand?: string;
  visibility?: "all" | "visible" | "hidden";
  photo?: "all" | "missing" | "with-photo";
  stock?: "all" | "low" | "out";
  featured?: "all" | "only";
  sync?: "all" | "synced" | "unsynced" | "stale";
  issue?: "all" | "review";
  page?: number;
}) {
  const startedAt = Date.now();
  const page = Math.max(1, input.page ?? 1);
  const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
  // CHANGE-CODE: ADM-003
  const baseWhere = buildWhere(input.query, input.category, input.brand, false);
  const photoWhere =
    input.photo === "missing"
      ? buildMissingProductPhotoWhere()
      : input.photo === "with-photo"
        ? buildRealProductPhotoWhere()
        : undefined;
  const baseConditions: Prisma.ProductWhereInput[] = [
    baseWhere,
    ...(input.issue === "review"
      ? [
          {
            isVisible: true,
            OR: [{ stockUnits: { lte: 0 } }, buildMissingProductPhotoWhere()],
          },
        ]
      : []),
    ...(input.visibility === "visible"
      ? [{ isVisible: true }]
      : input.visibility === "hidden"
        ? [{ isVisible: false }]
        : []),
    ...(input.stock === "low" ? [{ stockUnits: { lte: 12 } }] : []),
    ...(input.stock === "out" ? [{ stockUnits: { lte: 0 } }] : []),
    ...(input.featured === "only" ? [{ isFeatured: true }] : []),
    ...(input.sync === "synced"
      ? [{ syncEnabled: true }]
      : input.sync === "unsynced"
        ? [{ syncEnabled: false }]
        : input.sync === "stale"
          ? [{ syncEnabled: true, lastSyncedAt: { lt: staleDate } }]
          : []),
    ...(photoWhere ? [photoWhere] : []),
  ];

  const filtersWhere: Prisma.ProductWhereInput = {
    AND: baseConditions,
  };

  const roundedStaleTime = Math.floor(staleDate.getTime() / 600000) * 600000;
  const stats = await getAdminProductStatsCached(roundedStaleTime);

  const [
    products,
    categories,
    brands,
    totalResults,
  ] = await Promise.all([
    profileAdminStep("products.page", () =>
      prisma.product.findMany({
        where: filtersWhere,
        select: {
          id: true,
          code: true,
          name: true,
          brand: true,
          imageUrl: true,
          sourceImageUrl: true,
          localImageUrl: true,
          unitPrice: true,
          wholesalePrice: true,
          stockUnits: true,
          isVisible: true,
          isFeatured: true,
          lastSyncedAt: true,
          updatedAt: true,
          media: {
            take: 1,
            orderBy: { sortOrder: "asc" },
            select: {
              url: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }, { id: "asc" }],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
    ),
    profileAdminStep("products.categories", () =>
      prisma.category.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      })),
    profileAdminStep("products.brands", () =>
      prisma.product.findMany({
        where: { brand: { not: null } },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
        select: { brand: true },
      })),
    profileAdminStep("products.filtered", () => prisma.product.count({ where: filtersWhere })),
  ]);

  const {
    totalProducts,
    visibleProductsCount,
    hiddenProductsCount,
    withPhotoProductsCount,
    withoutPhotoProductsCount,
    needsReviewProductsCount,
    lowStockProductsCount,
    outOfStockProductsCount,
    syncedProductsCount,
    unsyncedProductsCount,
    staleSyncedProductsCount,
    featuredProductsCount,
    hiddenWithStockProductsCount,
  } = stats;

  const payload = {
    products: products.map((product) => {
      const imageUrl = product.imageUrl?.trim() ?? "";
      const localImageUrl = product.localImageUrl?.trim() ?? "";
      const sourceImageUrl = product.sourceImageUrl?.trim() ?? "";
      const mediaUrl = product.media[0]?.url?.trim() ?? "";
      const hasPhoto = hasRealProductPhoto({
        imageUrl: sourceImageUrl || imageUrl || null,
        localImageUrl: localImageUrl || null,
        media: mediaUrl ? [{ url: mediaUrl }] : [],
      });
      const thumbnailUrl = hasPhoto
        ? getPreferredProductImageUrl({
            localImageUrl,
            imageUrl: sourceImageUrl || imageUrl || null,
            media: mediaUrl ? [{ url: mediaUrl }] : [],
          })
        : null;

      return {
        id: product.id,
        code: product.code,
        name: product.name,
        brand: product.brand,
        imageUrl: getPreferredProductImageUrl({
          localImageUrl,
          imageUrl: sourceImageUrl || imageUrl || null,
          media: mediaUrl ? [{ url: mediaUrl }] : [],
        }),
        sourceImageUrl: sourceImageUrl || null,
        localImageUrl: localImageUrl || null,
        thumbnailUrl,
        unitPrice: Number(product.unitPrice),
        wholesalePrice: product.wholesalePrice === null ? null : Number(product.wholesalePrice),
        stockUnits: product.stockUnits,
        isVisible: product.isVisible,
        isFeatured: product.isFeatured,
        hasPhoto,
        lastSyncedAt: product.lastSyncedAt?.toISOString() ?? null,
        updatedAt: product.updatedAt.toISOString(),
      } satisfies AdminProductListItem;
    }),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
    })),
    brands: brands
      .map((item) => item.brand?.trim())
      .filter((value): value is string => Boolean(value))
      .map((name) => ({ name })),
    stats: {
      totalProducts,
      withPhotoProducts: withPhotoProductsCount,
      withoutPhotoProducts: withoutPhotoProductsCount,
      visibleProducts: visibleProductsCount,
      hiddenProducts: hiddenProductsCount,
      needsReviewProducts: needsReviewProductsCount,
      lowStockProducts: lowStockProductsCount,
      outOfStockProducts: outOfStockProductsCount,
      syncedProducts: syncedProductsCount,
      unsyncedProducts: unsyncedProductsCount,
      staleSyncedProducts: staleSyncedProductsCount,
      featuredProducts: featuredProductsCount,
      hiddenWithStockProducts: hiddenWithStockProductsCount,
    },
    totalResults,
    totalPages: Math.max(1, Math.ceil(totalResults / ADMIN_PAGE_SIZE)),
    pageSize: ADMIN_PAGE_SIZE,
    page,
  };

  logAdminPayload("products.payload", payload, startedAt, products.length);

  return payload;
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      media: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return product ? mapProduct(product) : null;
}

export async function getAdminCategories(): Promise<AdminCategory[]> {
  const categories = await prisma.category.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    productCount: category._count.products,
  }));
}

export async function getShopperAccount(userId: string): Promise<ShopperAccountView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      role: true,
    },
  });

  if (!user || user.role !== "USERSHOP") {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function getShopperQuoteHistory(
  userId: string,
  limit = 6,
): Promise<ShopperQuoteView[]> {
  const quotes = await prisma.quote.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          code: true,
          name: true,
          quantity: true,
          total: true,
        },
      },
    },
  });

  return quotes.map((quote) => ({
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    total: Number(quote.total),
    currencySymbol: quote.currencySymbol,
    createdAt: quote.createdAt.toISOString(),
    itemCount: quote.items.reduce((sum, item) => sum + item.quantity, 0),
    items: quote.items.slice(0, 3).map((item) => ({
      code: item.code,
      name: item.name,
      quantity: item.quantity,
      total: Number(item.total),
    })),
  }));
}

export async function getShopperQuoteById(
  userId: string,
  quoteId: string,
): Promise<ShopperQuoteDetailView | null> {
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      userId,
    },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: {
            include: {
              media: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!quote) {
    return null;
  }

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    total: Number(quote.total),
    currencySymbol: quote.currencySymbol,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    customerName: quote.customerName,
    customerPhone: quote.customerPhone,
    customerEmail: quote.customerEmail,
    customerAddress: quote.customerAddress,
    customerDocumentNumber: quote.customerDocumentNumber,
    customerDocumentType: quote.customerDocumentType,
    errorMessage: quote.errorMessage,
    itemCount: quote.items.reduce((sum, item) => sum + item.quantity, 0),
    items: quote.items.map((item) => ({
      code: item.code,
      name: item.name,
      product:
        item.product && item.product.isVisible && item.product.stockUnits > 0
          ? mapProduct(item.product)
          : null,
      quantity: item.quantity,
      tierLabel: item.tierLabel,
      total: Number(item.total),
      unitPrice: Number(item.unitPrice),
    })),
    note: quote.note,
    statusSteps: mapQuoteStatusSteps(quote.statusSteps),
    whatsappHref: quote.whatsappHref,
  };
}

export async function getAdminQuotes(input: {
  page?: number;
  status?: QuoteStatus | "all";
} = {}): Promise<AdminQuotesData> {
  const startedAt = Date.now();
  const page = Math.max(1, input.page ?? 1);
  const where: Prisma.QuoteWhereInput =
    input.status && input.status !== "all" ? { status: input.status } : {};

  const [
    quotes,
    totalResults,
    totalQuotes,
    pendingQuotes,
    registeredQuotes,
    errorQuotes,
  ] = await Promise.all([
    profileAdminStep("quotes.page", () =>
      prisma.quote.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: ADMIN_QUOTES_PAGE_SIZE,
        skip: (page - 1) * ADMIN_QUOTES_PAGE_SIZE,
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          total: true,
          currencySymbol: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          erpCustomerMode: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              name: true,
            },
          },
          items: {
            take: 4,
            orderBy: { createdAt: "asc" },
            select: {
              code: true,
              name: true,
              quantity: true,
              total: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
    ),
    profileAdminStep("quotes.filtered", () => prisma.quote.count({ where })),
    profileAdminStep("quotes.total", () => prisma.quote.count()),
    profileAdminStep("quotes.pending", () => prisma.quote.count({ where: { status: "PENDING" } })),
    profileAdminStep("quotes.registered", () =>
      prisma.quote.count({ where: { status: "ERP_REGISTERED" } }),
    ),
    profileAdminStep("quotes.error", () => prisma.quote.count({ where: { status: "ERROR" } })),
  ]);

  const payload = {
    quotes: quotes.map((quote) => ({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      status: quote.status,
      total: Number(quote.total),
      currencySymbol: quote.currencySymbol,
      customerName: quote.customerName,
      customerPhone: quote.customerPhone,
      customerEmail: quote.customerEmail,
      erpCustomerMode: quote.erpCustomerMode,
      createdAt: quote.createdAt.toISOString(),
      itemCount: quote._count.items,
      items: quote.items.slice(0, 4).map((item) => ({
        code: item.code,
        name: item.name,
        quantity: item.quantity,
        total: Number(item.total),
      })),
      user: quote.user
        ? {
            email: quote.user.email,
            name: quote.user.name,
          }
        : null,
    })),
    page,
    pageSize: ADMIN_QUOTES_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(totalResults / ADMIN_QUOTES_PAGE_SIZE)),
    totalResults,
    stats: {
      all: totalQuotes,
      pending: pendingQuotes,
      registered: registeredQuotes,
      error: errorQuotes,
    },
  };

  logAdminPayload("quotes.payload", payload, startedAt, quotes.length);

  return payload;
}

export async function getAdminQuoteById(id: string): Promise<AdminQuoteDetailView | null> {
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          code: true,
          externalId: true,
          name: true,
          productId: true,
          quantity: true,
          tierLabel: true,
          total: true,
          unitPrice: true,
        },
      },
    },
  });

  if (!quote) {
    return null;
  }

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    total: Number(quote.total),
    currencySymbol: quote.currencySymbol,
    customerName: quote.customerName,
    customerPhone: quote.customerPhone,
    customerEmail: quote.customerEmail,
    customerAddress: quote.customerAddress,
    customerDocumentNumber: quote.customerDocumentNumber,
    customerDocumentType: quote.customerDocumentType,
    erpCustomerId: quote.erpCustomerId,
    erpCustomerMode: quote.erpCustomerMode,
    erpExternalId: quote.erpExternalId,
    errorMessage: quote.errorMessage,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    itemCount: quote.items.reduce((sum, item) => sum + item.quantity, 0),
    items: quote.items.map((item) => ({
      code: item.code,
      externalId: item.externalId,
      name: item.name,
      productId: item.productId,
      quantity: item.quantity,
      tierLabel: item.tierLabel,
      total: Number(item.total),
      unitPrice: Number(item.unitPrice),
    })),
    note: quote.note,
    pdfNotification: mapQuotePdfNotification(quote.pdfNotification),
    statusSteps: mapQuoteStatusSteps(quote.statusSteps),
    user: quote.user
      ? {
          email: quote.user.email,
          name: quote.user.name,
        }
      : null,
    whatsappHref: quote.whatsappHref,
  };
}
