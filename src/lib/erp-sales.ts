import { FacturadorClient } from "@/lib/facturador/client";
import type { FacturadorRecord } from "@/lib/facturador/types";
import type { CatalogSalesSummary } from "@/lib/store-types";

type ErpBestSellerMetric = {
  code: string;
  firstRank: number;
  rotationUnits: number;
  units15: number;
};

type ErpBestSellerSnapshot = {
  codes: string[];
  generatedAt: string | null;
  hasDatedSales: boolean;
  hasRealSales: boolean;
  hasUnitSales: boolean;
  metrics: ErpBestSellerMetric[];
  summary: CatalogSalesSummary;
};

const SALES_LOOKBACK_DAYS = 15;
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const SNAPSHOT_ERROR_TTL_MS = 30 * 1000;
const SNAPSHOT_WAIT_BUDGET_MS = 4000;

const CODE_KEYS = [
  "internal_id",
  "item_id",
  "item_code",
  "barcode",
  "code",
  "codigo",
  "codigo_interno",
  "item_code_erp",
  "product_code",
  "sku",
];

const UNIT_KEYS = [
  "total_sold",
  "total_sales_quantity",
  "sale_quantity",
  "quantity",
  "qty",
  "quantity_sold",
  "sold_quantity",
  "units_sold",
  "total_quantity",
  "total_units",
  "cantidad",
  "cantidad_vendida",
];

const DATE_KEYS = [
  "date",
  "date_of_issue",
  "sale_date",
  "fecha",
  "fecha_de_emision",
  "fecha_emision",
  "emission_date",
];

const emptySummary: CatalogSalesSummary = {
  generatedAt: null,
  hasDatedSales: false,
  hasRealSales: false,
  hasUnitSales: false,
  insights: [
    { label: "15 días", value: "Sin ventas ERP" },
    { label: "Rotación", value: "Sin unidades" },
  ],
  source: "fallback",
};

const emptySnapshot: ErpBestSellerSnapshot = {
  codes: [],
  generatedAt: null,
  hasDatedSales: false,
  hasRealSales: false,
  hasUnitSales: false,
  metrics: [],
  summary: emptySummary,
};

let cachedSnapshot:
  | {
      expiresAt: number;
      limit: number;
      value: ErpBestSellerSnapshot;
    }
  | null = null;
let snapshotRefreshPromise: Promise<ErpBestSellerSnapshot> | null = null;

export async function getErpBestSellerSnapshot(limit: number): Promise<ErpBestSellerSnapshot> {
  const now = Date.now();

  if (cachedSnapshot && cachedSnapshot.expiresAt > now && cachedSnapshot.limit >= limit) {
    return sliceSnapshot(cachedSnapshot.value, limit);
  }

  if (cachedSnapshot) {
    void refreshBestSellerSnapshot(Math.max(limit, cachedSnapshot.limit));
    return sliceSnapshot(cachedSnapshot.value, limit);
  }

  const refresh = refreshBestSellerSnapshot(limit);
  const snapshot = await Promise.race([
    refresh,
    sleep(SNAPSHOT_WAIT_BUDGET_MS).then(() => null),
  ]);

  return snapshot ? sliceSnapshot(snapshot, limit) : emptySnapshot;
}

function refreshBestSellerSnapshot(limit: number) {
  if (!snapshotRefreshPromise) {
    snapshotRefreshPromise = loadBestSellerSnapshot(limit)
      .then((snapshot) => {
        cachedSnapshot = {
          expiresAt: Date.now() + SNAPSHOT_TTL_MS,
          limit,
          value: snapshot,
        };

        return snapshot;
      })
      .catch(() => {
        cachedSnapshot = {
          expiresAt: Date.now() + SNAPSHOT_ERROR_TTL_MS,
          limit,
          value: emptySnapshot,
        };

        return emptySnapshot;
      })
      .finally(() => {
        snapshotRefreshPromise = null;
      });
  }

  return snapshotRefreshPromise;
}

async function loadBestSellerSnapshot(limit: number) {
  try {
    const client = new FacturadorClient();
    const result = await getProductSalesRecords(client, SALES_LOOKBACK_DAYS);
    return buildBestSellerSnapshot(result.records, limit, new Date(), result.periodBound);
  } catch {
    return emptySnapshot;
  }
}

function sliceSnapshot(snapshot: ErpBestSellerSnapshot, limit: number): ErpBestSellerSnapshot {
  return {
    ...snapshot,
    codes: snapshot.codes.slice(0, limit),
    metrics: snapshot.metrics.slice(0, limit),
  };
}

async function getProductSalesRecords(client: FacturadorClient, days: number) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const productReportPath = process.env.FACTURADOR_PRODUCT_SALES_REPORT_PATH?.trim();
  const reportPaths = [
    productReportPath,
    "/reports/general-sale",
  ].filter((value): value is string => Boolean(value));

  for (const path of reportPaths) {
    try {
      const payload = await client.request(path, {
        body: {
          date_end: formatDate(endDate),
          date_start: formatDate(startDate),
          month_end: formatMonth(endDate),
          month_start: formatMonth(startDate),
          period: "date",
        },
        method: "POST",
        retry: false,
      });
      const reportRecords = extractProductSaleRecords(payload);

      if (reportRecords.length) {
        const snapshot = buildBestSellerSnapshot(reportRecords, 1, new Date(), true);
        if (snapshot.hasRealSales) return { records: reportRecords, periodBound: true };
      }
    } catch {
      // Continue with the next configured ERP report source.
    }
  }

  // This endpoint also exposes inventory. Only explicit sales counters may be used,
  // never stock, a default cart quantity, price, or the endpoint's row order.
  const products = await client.getSalesProducts();
  const records = products.flatMap(record => {
    const sold = getFirstNumber(record, ["total_sold", "total_sales_quantity", "sale_quantity", "quantity_sold", "sold_quantity", "units_sold", "cantidad_vendida"]);
    return sold !== null ? [{ ...record, quantity: sold, date: undefined, date_of_issue: undefined, sale_date: undefined }] : [];
  });
  return { records, periodBound: false };
}

export function buildBestSellerSnapshot(records: FacturadorRecord[], limit: number, now = new Date(), periodBound = false): ErpBestSellerSnapshot {
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - SALES_LOOKBACK_DAYS);

  const metricsByCode = new Map<string, ErpBestSellerMetric>();
  let hasDatedSales = periodBound;
  let hasUnitSales = false;

  records.forEach((record, index) => {
    const code = getFirstString(record, CODE_KEYS);

    if (!code) {
      return;
    }

    const units = getFirstNumber(record, UNIT_KEYS);
    const saleDate = getFirstDate(record, DATE_KEYS);
    const safeUnits = units === null ? 0 : Math.max(0, units);
    if (isCancelledSale(record)) return;

    if (units !== null) {
      hasUnitSales = true;
    }

    if (saleDate) {
      hasDatedSales = true;
    }

    const metric = metricsByCode.get(code) ?? {
      code,
      firstRank: index,
      rotationUnits: 0,
      units15: 0,
    };

    metric.firstRank = Math.min(metric.firstRank, index);
    metric.rotationUnits += safeUnits;

    if ((saleDate && saleDate >= lookbackStart && saleDate <= now) || (!saleDate && periodBound)) {
      metric.units15 += safeUnits;
    }

    metricsByCode.set(code, metric);
  });

  const metrics = Array.from(metricsByCode.values()).filter(metric => hasDatedSales ? metric.units15 > 0 : metric.rotationUnits > 0).sort((left, right) => {
    if (hasDatedSales && hasUnitSales) {
      return (
        right.units15 - left.units15 ||
        right.rotationUnits - left.rotationUnits ||
        left.firstRank - right.firstRank
      );
    }

    if (hasUnitSales) {
      return right.rotationUnits - left.rotationUnits || left.firstRank - right.firstRank;
    }

    return left.firstRank - right.firstRank;
  });

  const codes = metrics.slice(0, limit).map((metric) => metric.code);
  const generatedAt = now.toISOString();
  const totalUnits15 = metrics.reduce((sum, metric) => sum + metric.units15, 0);
  const topRotationUnits = metrics[0]?.rotationUnits ?? 0;
  const hasRealSales = hasUnitSales && metrics.length > 0;

  return {
    codes: hasRealSales ? codes : [],
    generatedAt,
    hasDatedSales,
    hasRealSales,
    hasUnitSales,
    metrics,
    summary: {
      generatedAt,
      hasDatedSales,
      hasRealSales,
      hasUnitSales,
      insights: [
        {
          label: hasDatedSales ? "15 días" : "Acumulado ERP",
          value: hasRealSales ? `${formatCompactUnits(hasDatedSales ? totalUnits15 : metrics.reduce((sum, metric) => sum + metric.rotationUnits, 0))} und.` : "Sin ventas ERP",
        },
        {
          label: "Rotación",
          value: hasRealSales ? `${formatCompactUnits(topRotationUnits)} und. top` : "Sin unidades",
        },
      ],
      source: hasRealSales ? "erp" : "fallback",
    },
  };
}

export function extractProductSaleRecords(payload: unknown) {
  const records: FacturadorRecord[] = [];
  collectProductSaleRecords(payload, records, null);
  return records;
}

function collectProductSaleRecords(value: unknown, records: FacturadorRecord[], inheritedDate: Date | null) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectProductSaleRecords(item, records, inheritedDate);
    }

    return;
  }

  const record = value as FacturadorRecord;
  if (isCancelledSale(record)) return;
  const recordDate = getFirstDate(record, DATE_KEYS) ?? inheritedDate;
  // A document code/total must not mask its individual product lines.
  const lines = record.items ?? record.details;
  if (Array.isArray(lines)) {
    collectProductSaleRecords(lines, records, recordDate);
    return;
  }
  const nestedItem = record.item && typeof record.item === "object" && !Array.isArray(record.item) ? record.item as FacturadorRecord : null;
  const saleRecord = nestedItem ? { ...nestedItem, ...record, internal_id: nestedItem.internal_id ?? nestedItem.code, item_id: record.item_id ?? nestedItem.id } : record;

  if (hasProductSaleShape(saleRecord)) {
    records.push(recordDate ? { ...saleRecord, date_of_issue: recordDate.toISOString() } : saleRecord);
    return;
  }

  for (const nestedValue of Object.values(record)) {
    collectProductSaleRecords(nestedValue, records, recordDate);
  }
}

function hasProductSaleShape(record: FacturadorRecord) {
  return Boolean(getFirstString(record, CODE_KEYS) && getFirstNumber(record, UNIT_KEYS));
}

function isCancelledSale(record: FacturadorRecord) {
  const flag = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";
  return flag(record.is_cancelled) || flag(record.is_annulled) || /cancel|anulad|void/i.test(String(record.status ?? ""));
}

function getFirstString(record: FacturadorRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getFirstNumber(record: FacturadorRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.replace(",", ".").trim();
      if (!normalized) continue;
      const parsed = Number(normalized);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getFirstDate(record: FacturadorRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

function formatCompactUnits(value: number) {
  return new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
