import Link from "next/link";
import {
  Boxes,
  CalendarClock,
  DatabaseZap,
  ImageOff,
  FolderTree,
  Layers3,
  TriangleAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { DashboardPeriod, DashboardTrendProduct } from "@/lib/store";
import { getAdminDashboardData } from "@/lib/store";
import { CHANGE_CODES } from "@/lib/change-codes";
import { cn, formatCompactNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AdminHomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const periodOptions: Array<{
  label: string;
  shortLabel: string;
  value: DashboardPeriod;
  queryValue: string;
}> = [
  { label: "Semanal", shortLabel: "Semana", value: "WEEK", queryValue: "week" },
  { label: "Mensual", shortLabel: "Mes", value: "MONTH", queryValue: "month" },
  { label: "Anual", shortLabel: "Año", value: "YEAR", queryValue: "year" },
];

function parsePeriod(value: string | string[] | undefined): DashboardPeriod {
  const normalized = typeof value === "string" ? value.toUpperCase() : "MONTH";

  if (normalized === "WEEK" || normalized === "MONTH" || normalized === "YEAR") {
    return normalized;
  }

  return "MONTH";
}

function formatDelta(deltaPercent: number | null) {
  if (deltaPercent === null) {
    return "Sin base";
  }

  return `${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}%`;
}

function getDeltaTone(deltaPercent: number | null) {
  if (deltaPercent === null) {
    return "is-neutral";
  }

  return deltaPercent >= 0 ? "is-positive" : "is-negative";
}

function buildProductsHref(extra: Record<string, string> = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }

  return `/admin/products${params.toString() ? `?${params.toString()}` : ""}`;
}

function ProductTrendList({
  emptyCopy,
  maxUnitsSold,
  products,
  title,
  tone,
}: {
  emptyCopy: string;
  maxUnitsSold: number;
  products: DashboardTrendProduct[];
  title: string;
  tone: "positive" | "negative";
}) {
  const Icon = tone === "positive" ? TrendingUp : TrendingDown;

  return (
    <article className="trend-list-card">
      <div className="trend-list-head">
        <div>
          <p className="eyebrow">{tone === "positive" ? "Tendencia positiva" : "Tendencia en caída"}</p>
          <h3>{title}</h3>
        </div>
        <span className={cn("trend-icon-chip", tone === "positive" ? "is-positive" : "is-negative")}>
          <Icon size={18} />
        </span>
      </div>

      {products.length ? (
        <div className="trend-product-list">
          {products.map((product) => (
            <div className="trend-product-item" key={`${product.code}-${product.direction}`}>
              <div className="trend-product-main">
                <div>
                  <strong>{product.name}</strong>
                  <span>
                    {product.code} · stock {product.unitsSold}
                  </span>
                </div>
                <span className={cn("trend-delta-chip", tone === "positive" ? "is-positive" : "is-negative")}>
                  {formatDelta(product.deltaPercent)}
                </span>
              </div>
              <div className="trend-bar-track">
                <span
                  className={cn("trend-bar-fill", tone === "positive" ? "is-positive" : "is-negative")}
                  style={{ width: `${Math.max(12, (product.unitsSold / maxUnitsSold) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{emptyCopy}</p>
      )}
    </article>
  );
}

export default async function AdminHomePage({ searchParams }: AdminHomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const selectedPeriod = parsePeriod(params?.period);
  const data = await getAdminDashboardData(selectedPeriod);
  const completionRate = data.trendAnalysis.forecast.completionRate ?? 0;
  const lastSyncDate = data.dataFreshness.lastSyncAt
    ? new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(data.dataFreshness.lastSyncAt))
    : "Sin sincronizaciones registradas";

  return (
    <div className="stack-lg">
      <section className="panel admin-hero-panel">
        <div className="admin-hero-copy">
          <p className="eyebrow">Dashboard operativo</p>
          <h1>Control center del catálogo</h1>
          <p className="panel-copy">
            Estado comercial, sincronización ERP, campañas y atención al cliente en una sola superficie.
          </p>
        </div>

        <div className="admin-hero-actions">
          <Link className="button button-primary button-chip" href="/admin/erp">
            <DatabaseZap size={16} />
            Sincronizar ERP
          </Link>
          <Link className="button button-secondary button-chip" href="/admin/banners">
            <Boxes size={16} />
            Banners
          </Link>
          <Link className="button button-ghost button-chip" href={buildProductsHref({ issue: "review" })}>
            <TriangleAlert size={16} />
            Revisar productos
          </Link>
          <Link className="button button-ghost button-chip" href={buildProductsHref({ visibility: "visible", photo: "missing" })}>
            <ImageOff size={16} />
            Sin foto visible
          </Link>
        </div>

        <div className="admin-hero-status">
          <span className="admin-status-pill is-positive">{data.dataFreshness.syncedProducts} sincronizados</span>
          <span className="admin-status-pill is-warning">{data.dataFreshness.needsReviewProducts} por revisar</span>
          <span className="admin-status-pill is-negative">{data.dataFreshness.visibleOutOfStockProducts} sin stock visible</span>
          <span className="admin-hero-meta">{lastSyncDate}</span>
        </div>

        <div className="admin-metrics admin-metrics-promoted">
          <Link className="metric-panel metric-panel-link" href="/admin/products">
            <Boxes size={22} />
            <strong>{data.totalProducts}</strong>
            <span>Total de productos</span>
          </Link>
          <Link
            className="metric-panel metric-panel-link"
            href={buildProductsHref({ visibility: "visible", photo: "with-photo" })}
            data-change-code={CHANGE_CODES.ADMIN_VISIBLE_WITH_PHOTO}
          >
            <Layers3 size={22} />
            <strong>{data.visibleWithPhotoProducts}</strong>
            <span>Visibles con foto</span>
          </Link>
          <Link
            className="metric-panel metric-panel-link"
            href={buildProductsHref({ visibility: "visible", photo: "missing" })}
            data-change-code={CHANGE_CODES.ADMIN_REVIEW_ALERTS}
          >
            <ImageOff size={22} />
            <strong>{data.dataFreshness.visibleWithoutPhotoProducts}</strong>
            <span>Visibles sin foto</span>
          </Link>
          <Link className="metric-panel metric-panel-link" href={buildProductsHref({ stock: "low" })}>
            <TriangleAlert size={22} />
            <strong>{data.lowStockProducts}</strong>
            <span>Con stock bajo</span>
          </Link>
          <Link className="metric-panel metric-panel-link" href="/admin/erp">
            <DatabaseZap size={22} />
            <strong>{data.dataFreshness.syncedProducts}</strong>
            <span>Sincronizados ERP</span>
          </Link>
        </div>

        <div className="admin-hero-footnote">
          <span>
            {data.hiddenProducts} ocultos · {data.totalCategories} categorías · {data.dataFreshness.visibleOutOfStockProducts} visibles sin stock
          </span>
          <Link href="/admin/categories">
            <FolderTree size={14} />
            Ver categorías
          </Link>
        </div>
      </section>

      <section className="panel trend-dashboard-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Análisis</p>
            <h2>Sincronización ERP y movimiento del catálogo</h2>
          </div>
        </div>

        <div className="trend-periods">
          {periodOptions.map((option) => (
            <Link
              className={cn("trend-period-chip", data.selectedPeriod === option.value && "is-active")}
              href={`/admin?period=${option.queryValue}`}
              key={option.value}
            >
              {option.shortLabel}
            </Link>
          ))}
        </div>

        <div className="trend-overview-grid">
          <article className="trend-hero-card">
            <div className="trend-card-head">
              <div>
                <p className="eyebrow">{data.trendAnalysis.title}</p>
                <h3>Productos traídos desde ERP</h3>
              </div>
              <span className="trend-icon-chip">
                <DatabaseZap size={18} />
              </span>
            </div>

            <div className="trend-hero-value">
              <strong>{formatCompactNumber(data.trendAnalysis.erpFetched.currentValue)}</strong>
              <span
                className={cn(
                  "trend-delta-chip",
                  getDeltaTone(data.trendAnalysis.erpFetched.deltaPercent),
                )}
              >
                {formatDelta(data.trendAnalysis.erpFetched.deltaPercent)}
              </span>
            </div>

            <div className="trend-progress-card">
              <div className="trend-progress-copy">
                <span>Cobertura ERP</span>
                <strong>{completionRate.toFixed(1)}%</strong>
              </div>
              <div className="trend-progress-track">
                <span className="trend-progress-fill" style={{ width: `${Math.min(100, completionRate)}%` }} />
              </div>
            </div>
          </article>

          <article className="trend-forecast-card">
            <div className="trend-card-head">
              <div>
                <p className="eyebrow">ERP</p>
                <h3>Frescura</h3>
              </div>
              <span className="trend-icon-chip">
                <CalendarClock size={18} />
              </span>
            </div>

            <strong>{data.dataFreshness.sourceLabel}</strong>
            <p className="muted">
              {lastSyncDate} · {data.dataFreshness.lastSyncStatus ?? "sin bitácora"}
            </p>
            <span
              className={cn(
                "trend-delta-chip",
                data.dataFreshness.staleSyncedProducts > 0 ||
                  data.dataFreshness.visibleOutOfStockProducts > 0
                  ? "is-negative"
                  : "is-positive",
              )}
            >
              {data.dataFreshness.staleSyncedProducts} sin refrescar ·{" "}
              {data.dataFreshness.visibleOutOfStockProducts} visibles sin stock
            </span>
          </article>
        </div>

        <div className="trend-lists-grid">
          <ProductTrendList
            emptyCopy="Sin datos."
            maxUnitsSold={data.trendAnalysis.maxUnitsSold}
            products={data.trendAnalysis.topRisingProducts}
            title="Productos recién actualizados por ERP"
            tone="positive"
          />
          <ProductTrendList
            emptyCopy="Sin datos."
            maxUnitsSold={data.trendAnalysis.maxUnitsSold}
            products={data.trendAnalysis.topFallingProducts}
            title="Productos con stock crítico"
            tone="negative"
          />
        </div>
      </section>
    </div>
  );
}
