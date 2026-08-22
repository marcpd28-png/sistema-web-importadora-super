import { Prisma, type ComplaintStatus, type ComplaintType, type QuoteStatus } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_PAGE_SIZE,
  GENERIC_PRODUCT_PHOTO_URLS,
  buildWhere,
  buildMissingProductPhotoWhere,
  buildRealProductPhotoWhere,
  calculateDeltaPercent,
  mapCatalogMovementProduct,
  mapErpSyncLog,
  mapProduct,
  hasRealProductPhoto,
} from "@/lib/store-shared";
import { getPreferredProductImageUrl } from "@/lib/product-media";
import { BLOCKED_PUBLIC_PRODUCT_CODES } from "@/lib/public-product-blocklist";
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
const ADMIN_GENERIC_PRODUCT_PHOTO_URLS = [...GENERIC_PRODUCT_PHOTO_URLS, ""];

type AdminInventoryStats = {
  totalProducts: number;
  visibleProductsCount: number;
  hiddenProductsCount: number;
  withPhotoProductsCount: number;
  withoutPhotoProductsCount: number;
  needsReviewProductsCount: number;
  lowStockProductsCount: number;
  outOfStockProductsCount: number;
  syncedProductsCount: number;
  unsyncedProductsCount: number;
  neverSyncedProductsCount: number;
  staleSyncedProductsCount: number;
  featuredProductsCount: number;
  hiddenWithStockProductsCount: number;
  visibleWithPhotoProductsCount: number;
  hiddenOutOfStockProductsCount: number;
  visibleOutOfStockProductsCount: number;
  hiddenWithoutPhotoProductsCount: number;
  visibleWithoutPhotoProductsCount: number;
};

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

function buildBlockedAdminProductCodesSql() {
  if (!BLOCKED_PUBLIC_PRODUCT_CODES.length) {
    return Prisma.sql`true`;
  }

  return Prisma.sql`pf.code NOT IN (${Prisma.join(BLOCKED_PUBLIC_PRODUCT_CODES)})`;
}

async function getAdminInventoryStats(staleDate: Date): Promise<AdminInventoryStats> {
  const [stats] = await prisma.$queryRaw<AdminInventoryStats[]>(Prisma.sql`
    WITH product_flags AS (
      SELECT
        p.id,
        p.code,
        p."isVisible",
        p."stockUnits",
        p."syncEnabled",
        p."lastSyncedAt",
        p."isFeatured",
        (
          (
            p."localImageUrl" IS NOT NULL
            AND p."localImageUrl" NOT IN (${Prisma.join(ADMIN_GENERIC_PRODUCT_PHOTO_URLS)})
          )
          OR (
            p."imageUrl" IS NOT NULL
            AND p."imageUrl" NOT IN (${Prisma.join(ADMIN_GENERIC_PRODUCT_PHOTO_URLS)})
          )
          OR EXISTS (
            SELECT 1
            FROM "ProductMedia" pm
            WHERE pm."productId" = p.id
              AND pm.url NOT IN (${Prisma.join(ADMIN_GENERIC_PRODUCT_PHOTO_URLS)})
          )
        ) AS "hasRealPhoto",
        (
          (
            p."localImageUrl" IS NULL
            OR p."localImageUrl" = ''
            OR p."localImageUrl" IN (${Prisma.join(ADMIN_GENERIC_PRODUCT_PHOTO_URLS)})
            OR lower(p."localImageUrl") LIKE '%imagen-no-disponible%'
            OR lower(p."localImageUrl") LIKE '%no-image%'
          )
          OR (
            p."imageUrl" IS NULL
            OR p."imageUrl" = ''
            OR p."imageUrl" IN (${Prisma.join(ADMIN_GENERIC_PRODUCT_PHOTO_URLS)})
            OR lower(p."imageUrl") LIKE '%imagen-no-disponible%'
            OR lower(p."imageUrl") LIKE '%no-image%'
            OR lower(p."imageUrl") LIKE '%placeholder%'
            OR lower(p."imageUrl") LIKE '%sin-foto%'
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "ProductMedia" pm
          WHERE pm."productId" = p.id
            AND pm.url NOT IN (${Prisma.join(ADMIN_GENERIC_PRODUCT_PHOTO_URLS)})
        ) AS "isMissingPhoto"
      FROM "Product" p
    )
    SELECT
      (COUNT(*))::int AS "totalProducts",
      (COUNT(*) FILTER (WHERE pf."isVisible" = true AND ${buildBlockedAdminProductCodesSql()} AND pf."hasRealPhoto"))::int AS "visibleProductsCount",
      (COUNT(*) FILTER (WHERE pf."isVisible" = false))::int AS "hiddenProductsCount",
      (COUNT(*) FILTER (WHERE pf."hasRealPhoto"))::int AS "withPhotoProductsCount",
      (COUNT(*) FILTER (WHERE pf."isMissingPhoto"))::int AS "withoutPhotoProductsCount",
      (COUNT(*) FILTER (WHERE pf."isVisible" = true AND (pf."stockUnits" <= 0 OR pf."isMissingPhoto")))::int AS "needsReviewProductsCount",
      (COUNT(*) FILTER (WHERE pf."stockUnits" > 0 AND pf."stockUnits" <= 12))::int AS "lowStockProductsCount",
      (COUNT(*) FILTER (WHERE pf."stockUnits" <= 0))::int AS "outOfStockProductsCount",
      (COUNT(*) FILTER (WHERE pf."syncEnabled" = true))::int AS "syncedProductsCount",
      (COUNT(*) FILTER (WHERE pf."syncEnabled" = false))::int AS "unsyncedProductsCount",
      (COUNT(*) FILTER (WHERE pf."lastSyncedAt" IS NULL))::int AS "neverSyncedProductsCount",
      (COUNT(*) FILTER (WHERE pf."syncEnabled" = true AND pf."lastSyncedAt" < ${staleDate}))::int AS "staleSyncedProductsCount",
      (COUNT(*) FILTER (WHERE pf."isFeatured" = true))::int AS "featuredProductsCount",
      (COUNT(*) FILTER (WHERE pf."isVisible" = false AND pf."stockUnits" > 0))::int AS "hiddenWithStockProductsCount",
      (COUNT(*) FILTER (WHERE pf."isVisible" = true AND pf."hasRealPhoto"))::int AS "visibleWithPhotoProductsCount",
      (COUNT(*) FILTER (WHERE pf."syncEnabled" = true AND pf."isVisible" = false AND pf."stockUnits" <= 0))::int AS "hiddenOutOfStockProductsCount",
      (COUNT(*) FILTER (WHERE pf."syncEnabled" = true AND pf."isVisible" = true AND pf."stockUnits" <= 0))::int AS "visibleOutOfStockProductsCount",
      (COUNT(*) FILTER (WHERE pf."isVisible" = false AND pf."isMissingPhoto"))::int AS "hiddenWithoutPhotoProductsCount",
      (COUNT(*) FILTER (WHERE pf."isVisible" = true AND pf."isMissingPhoto"))::int AS "visibleWithoutPhotoProductsCount"
    FROM product_flags pf
  `);

  return stats;
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
    sheetNumber: string;
    type: ComplaintType;
    reason: string;
    names: string;
    lastNames: string;
    phone: string;
    email: string;
    status: ComplaintStatus;
    createdAt: Date;
    repliedAt: Date | null;
    adminReply: string | null;
    repliedByEmail: string | null;
    assignedToName?: string | null;
    assignedToEmail?: string | null;
  },
): AdminComplaintView {
  return {
    id: complaint.id,
    claimCode: complaint.sheetNumber,
    kind: complaint.type,
    subject: complaint.reason,
    customerName: `${complaint.names} ${complaint.lastNames}`,
    customerPhone: complaint.phone,
    customerEmail: complaint.email,
    status: complaint.status,
    createdAt: complaint.createdAt.toISOString(),
    respondedAt: complaint.repliedAt?.toISOString() ?? null,
    responseText: complaint.adminReply,
    responseChannel: complaint.repliedByEmail ? "Email" : null,
    assignedToName: complaint.assignedToName ?? null,
    assignedToEmail: complaint.assignedToEmail ?? null,
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
          sheetNumber: true,
          type: true,
          reason: true,
          names: true,
          lastNames: true,
          phone: true,
          email: true,
          status: true,
          createdAt: true,
          repliedAt: true,
          adminReply: true,
          repliedByEmail: true,
          assignedToName: true,
          assignedToEmail: true,
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
    include: {
      internalNotes: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!complaint) {
    return null;
  }

  const parsedAttachments = Array.isArray(complaint.attachments)
    ? (complaint.attachments as string[])
    : typeof complaint.attachments === "string"
    ? JSON.parse(complaint.attachments)
    : [];

  return {
    ...mapComplaintView({
      id: complaint.id,
      sheetNumber: complaint.sheetNumber,
      type: complaint.type,
      reason: complaint.reason,
      names: complaint.names,
      lastNames: complaint.lastNames,
      phone: complaint.phone,
      email: complaint.email,
      status: complaint.status,
      createdAt: complaint.createdAt,
      repliedAt: complaint.repliedAt,
      adminReply: complaint.adminReply,
      repliedByEmail: complaint.repliedByEmail,
    }),
    documentType: complaint.documentType,
    documentNumber: complaint.documentNumber,
    orderNumber: complaint.orderNumber,
    productReference: complaint.productName,
    detail: complaint.facts,
    updatedAt: complaint.updatedAt.toISOString(),

    // Nuevos campos detallados del Libro de Reclamaciones
    names: complaint.names,
    lastNames: complaint.lastNames,
    email: complaint.email,
    phone: complaint.phone,
    address: complaint.address,
    department: complaint.department,
    province: complaint.province,
    district: complaint.district,
    isMinor: complaint.isMinor,
    repNames: complaint.repNames,
    repDocumentType: complaint.repDocumentType,
    repDocumentNumber: complaint.repDocumentNumber,
    isPurchaseRelated: complaint.isPurchaseRelated,
    invoiceNumber: complaint.invoiceNumber,
    purchaseDate: complaint.purchaseDate?.toISOString() ?? null,
    productName: complaint.productName,
    productBrand: complaint.productBrand,
    productModel: complaint.productModel,
    productSku: complaint.productSku,
    productSerial: complaint.productSerial,
    purchaseAmount: complaint.purchaseAmount ? Number(complaint.purchaseAmount) : null,
    purchaseChannel: complaint.purchaseChannel,
    paymentMethod: complaint.paymentMethod,
    type: complaint.type,
    reason: complaint.reason,
    subReason: complaint.subReason,
    facts: complaint.facts,
    request: complaint.request,
    expiryDate: complaint.expiryDate.toISOString(),
    attachments: parsedAttachments,
    assignedToName: complaint.assignedToName,
    assignedToEmail: complaint.assignedToEmail,
    internalNotes: (complaint.internalNotes || []).map((note) => ({
      id: note.id,
      authorName: note.authorName,
      authorEmail: note.authorEmail,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    })),
  };
}

async function getAdminDashboardDataRaw(period: DashboardPeriod = "MONTH") {
  const startedAt = Date.now();
  const currentRange = getDashboardPeriodRange(period, 0);
  const previousRange = getDashboardPeriodRange(period, -1);
  const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const [
    inventoryStats,
    totalCategories,
    settings,
    currentQuotes,
    previousQuotes,
    qrScansCurrent,
    qrScansPrevious,
    qrInteractionsCurrent,
    topScannedProductsRaw,
    topQuotedProductsRaw,
  ] = await Promise.all([
    profileAdminStep("dashboard.inventory-stats", () => getAdminInventoryStats(staleDate)),
    profileAdminStep("dashboard.total-categories", () => prisma.category.count()),
    profileAdminStep("dashboard.settings", () => prisma.storeSettings.findUnique({ where: { id: 1 } })),
    profileAdminStep("dashboard.current-quotes", () =>
      prisma.quote.aggregate({
        where: {
          createdAt: { gte: currentRange.start, lt: currentRange.end },
        },
        _count: true,
        _sum: { total: true },
      })
    ),
    profileAdminStep("dashboard.previous-quotes", () =>
      prisma.quote.aggregate({
        where: {
          createdAt: { gte: previousRange.start, lt: previousRange.end },
        },
        _count: true,
        _sum: { total: true },
      })
    ),
    profileAdminStep("dashboard.current-scans", () =>
      prisma.qrAnalyticsLog.count({
        where: {
          eventType: "QR_OPEN",
          timestamp: { gte: currentRange.start, lt: currentRange.end },
        },
      })
    ),
    profileAdminStep("dashboard.previous-scans", () =>
      prisma.qrAnalyticsLog.count({
        where: {
          eventType: "QR_OPEN",
          timestamp: { gte: previousRange.start, lt: previousRange.end },
        },
      })
    ),
    profileAdminStep("dashboard.interactions", () =>
      prisma.qrAnalyticsLog.groupBy({
        by: ["eventType"],
        where: {
          eventType: { in: ["VIDEO_PLAY", "ADD_TO_CART_FROM_QR", "DOCUMENT_OPEN", "WHATSAPP_FROM_QR"] },
          timestamp: { gte: currentRange.start, lt: currentRange.end },
        },
        _count: true,
      })
    ),
    profileAdminStep("dashboard.top-scanned", () =>
      prisma.qrAnalyticsLog.groupBy({
        by: ["productId"],
        where: {
          eventType: "QR_OPEN",
          timestamp: { gte: currentRange.start, lt: currentRange.end },
        },
        _count: true,
        orderBy: {
          _count: {
            productId: "desc",
          },
        },
        take: 5,
      })
    ),
    profileAdminStep("dashboard.top-quoted", () =>
      prisma.quoteItem.groupBy({
        by: ["productId"],
        where: {
          quote: {
            createdAt: { gte: currentRange.start, lt: currentRange.end },
          },
        },
        _sum: {
          quantity: true,
        },
        orderBy: {
          _sum: {
            quantity: "desc",
          },
        },
        take: 5,
      })
    ),
  ]);

  const {
    totalProducts,
    visibleProductsCount: visibleProducts,
    visibleWithPhotoProductsCount: visibleWithPhotoProducts,
    needsReviewProductsCount: needsReviewProducts,
    hiddenProductsCount: hiddenProducts,
    lowStockProductsCount: lowStockProducts,
    outOfStockProductsCount: outOfStockProducts,
    hiddenOutOfStockProductsCount: hiddenOutOfStockProducts,
    visibleOutOfStockProductsCount: visibleOutOfStockProducts,
    hiddenWithoutPhotoProductsCount: hiddenWithoutPhotoProducts,
    visibleWithoutPhotoProductsCount: visibleWithoutPhotoProducts,
    withoutPhotoProductsCount: productsWithoutPhoto,
    syncedProductsCount: syncedProducts,
    neverSyncedProductsCount: neverSyncedProducts,
    staleSyncedProductsCount: staleSyncedProducts,
  } = inventoryStats;

  // Resolve product info for top lists
  const scannedProductIds = topScannedProductsRaw.map((p) => p.productId).filter((id): id is string => !!id);
  const quotedProductIds = topQuotedProductsRaw.map((p) => p.productId).filter((id): id is string => !!id);

  const [scannedProductsInfo, quotedProductsInfo] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: scannedProductIds } },
      select: { id: true, name: true, code: true },
    }),
    prisma.product.findMany({
      where: { id: { in: quotedProductIds } },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const scannedProductsMap = new Map(scannedProductsInfo.map((p) => [p.id, p]));
  const quotedProductsMap = new Map(quotedProductsInfo.map((p) => [p.id, p]));

  const topScannedProducts = topScannedProductsRaw.map((item) => {
    const info = scannedProductsMap.get(item.productId);
    return {
      id: item.productId,
      name: info?.name ?? "Producto desconocido",
      code: info?.code ?? "",
      count: item._count,
    };
  });

  const topQuotedProducts = topQuotedProductsRaw
    .filter((item) => !!item.productId)
    .map((item) => {
      const productId = item.productId as string;
      const info = quotedProductsMap.get(productId);
      return {
        id: productId,
        name: info?.name ?? "Producto desconocido",
        code: info?.code ?? "",
        count: item._sum.quantity ?? 0,
      };
    });

  const interactionsMap = new Map(qrInteractionsCurrent.map((i) => [i.eventType, i._count]));
  const whatsappCount = interactionsMap.get("WHATSAPP_FROM_QR") ?? 0;
  const videoPlayCount = interactionsMap.get("VIDEO_PLAY") ?? 0;
  const documentOpenCount = interactionsMap.get("DOCUMENT_OPEN") ?? 0;
  const addToCartCount = interactionsMap.get("ADD_TO_CART_FROM_QR") ?? 0;

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
      sourceLabel: "Tienda y Comportamiento",
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "Activo",
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
    storeAnalysis: {
      title: formatDashboardPeriodTitle(period, currentRange),
      previousTitle: formatDashboardPeriodTitle(period, previousRange),
      scans: {
        currentValue: qrScansCurrent,
        previousValue: qrScansPrevious,
        deltaPercent: calculateDeltaPercent(qrScansCurrent, qrScansPrevious),
      },
      quotesCount: {
        currentValue: currentQuotes._count,
        previousValue: previousQuotes._count,
        deltaPercent: calculateDeltaPercent(currentQuotes._count, previousQuotes._count),
      },
      quotesTotal: {
        currentValue: Number(currentQuotes._sum.total ?? 0),
        previousValue: previousQuotes._sum.total ? Number(previousQuotes._sum.total) : null,
        deltaPercent: calculateDeltaPercent(
          Number(currentQuotes._sum.total ?? 0),
          previousQuotes._sum.total ? Number(previousQuotes._sum.total) : null
        ),
      },
      interactions: {
        whatsapp: whatsappCount,
        videoPlay: videoPlayCount,
        documentOpen: documentOpenCount,
        addToCart: addToCartCount,
      },
      topScannedProducts,
      topQuotedProducts,
    },
  };

  logAdminPayload(
    "dashboard.payload",
    payload,
    startedAt,
    topScannedProductsRaw.length + topQuotedProductsRaw.length,
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
    const stats = await getAdminInventoryStats(staleDate);

    return {
      totalProducts: stats.totalProducts,
      visibleProductsCount: stats.visibleProductsCount,
      hiddenProductsCount: stats.hiddenProductsCount,
      withPhotoProductsCount: stats.withPhotoProductsCount,
      withoutPhotoProductsCount: stats.withoutPhotoProductsCount,
      needsReviewProductsCount: stats.needsReviewProductsCount,
      lowStockProductsCount: stats.lowStockProductsCount,
      outOfStockProductsCount: stats.outOfStockProductsCount,
      syncedProductsCount: stats.syncedProductsCount,
      unsyncedProductsCount: stats.unsyncedProductsCount,
      staleSyncedProductsCount: stats.staleSyncedProductsCount,
      featuredProductsCount: stats.featuredProductsCount,
      hiddenWithStockProductsCount: stats.hiddenWithStockProductsCount,
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
