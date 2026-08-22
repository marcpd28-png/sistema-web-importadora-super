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
  QrCode,
  ShoppingCart,
  MessageCircle,
  FileText,
  MousePointerClick
} from "lucide-react";
import type { DashboardPeriod } from "@/lib/store";
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

function TopProductList({
  emptyCopy,
  maxCount,
  products,
  title,
  subtitle,
  metricLabel,
  icon: Icon,
}: {
  emptyCopy: string;
  maxCount: number;
  products: Array<{ name: string; code: string; count: number }>;
  title: string;
  subtitle: string;
  metricLabel: string;
  icon: any;
}) {
  return (
    <article className="trend-list-card">
      <div className="trend-list-head">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h3>{title}</h3>
        </div>
        <span className="trend-icon-chip">
          <Icon size={18} />
        </span>
      </div>

      {products.length ? (
        <div className="trend-product-list">
          {products.map((product) => (
            <div className="trend-product-item" key={product.code}>
              <div className="trend-product-main">
                <div>
                  <strong style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {product.name}
                  </strong>
                  <span>{product.code}</span>
                </div>
                <span className="trend-delta-chip is-neutral" style={{ fontWeight: "700" }}>
                  {product.count} {metricLabel}
                </span>
              </div>
              <div className="trend-bar-track">
                <span
                  className="trend-bar-fill"
                  style={{
                    width: `${Math.max(12, (product.count / (maxCount || 1)) * 100)}%`,
                    background: "linear-gradient(to right, #2320DA, #0ea5e9)"
                  }}
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
            <p className="eyebrow">Análisis de la Tienda</p>
            <h2>Comportamiento del Consumidor e Interacciones QR</h2>
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
          {/* Card 1: QR Scans & Interactions */}
          <article className="trend-hero-card">
            <div className="trend-card-head">
              <div>
                <p className="eyebrow">{data.storeAnalysis.title}</p>
                <h3>Escaneos de Códigos QR</h3>
              </div>
              <span className="trend-icon-chip">
                <QrCode size={18} />
              </span>
            </div>

            <div className="trend-hero-value">
              <strong>{formatCompactNumber(data.storeAnalysis.scans.currentValue)}</strong>
              <span
                className={cn(
                  "trend-delta-chip",
                  getDeltaTone(data.storeAnalysis.scans.deltaPercent),
                )}
              >
                {formatDelta(data.storeAnalysis.scans.deltaPercent)}
              </span>
            </div>

            <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
              <div style={{ padding: "8px", background: "#f8fafc", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "600" }}>WhatsApp</span>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>{data.storeAnalysis.interactions.whatsapp}</span>
              </div>
              <div style={{ padding: "8px", background: "#f8fafc", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "600" }}>Videos</span>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>{data.storeAnalysis.interactions.videoPlay}</span>
              </div>
              <div style={{ padding: "8px", background: "#f8fafc", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "600" }}>PDFs Abiertos</span>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>{data.storeAnalysis.interactions.documentOpen}</span>
              </div>
              <div style={{ padding: "8px", background: "#f8fafc", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "600" }}>Añadidos Carrito</span>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>{data.storeAnalysis.interactions.addToCart}</span>
              </div>
            </div>
          </article>

          {/* Card 2: Quotes & Sales Orders */}
          <article className="trend-forecast-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div className="trend-card-head" style={{ marginBottom: "12px" }}>
                <div>
                  <p className="eyebrow">Cotizaciones</p>
                  <h3>Total Valorizado</h3>
                </div>
                <span className="trend-icon-chip">
                  <ShoppingCart size={18} />
                </span>
              </div>

              <div className="trend-hero-value" style={{ marginBottom: "12px" }}>
                <strong style={{ fontSize: "28px" }}>
                  {data.currencySymbol}{formatCompactNumber(data.storeAnalysis.quotesTotal.currentValue)}
                </strong>
                <span
                  className={cn(
                    "trend-delta-chip",
                    getDeltaTone(data.storeAnalysis.quotesTotal.deltaPercent),
                  )}
                  style={{ marginLeft: "8px" }}
                >
                  {formatDelta(data.storeAnalysis.quotesTotal.deltaPercent)}
                </span>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: "11px", color: "#64748b", margin: 0, fontWeight: "600" }}>Pedidos Solicitados</p>
                  <strong style={{ fontSize: "16px", color: "#0f172a" }}>{data.storeAnalysis.quotesCount.currentValue}</strong>
                </div>
                <span
                  className={cn(
                    "trend-delta-chip",
                    getDeltaTone(data.storeAnalysis.quotesCount.deltaPercent),
                  )}
                >
                  {formatDelta(data.storeAnalysis.quotesCount.deltaPercent)}
                </span>
              </div>
            </div>
          </article>
        </div>

        <div className="trend-lists-grid">
          <TopProductList
            emptyCopy="Sin datos de escaneo en este periodo."
            maxCount={data.storeAnalysis.topScannedProducts.length ? Math.max(...data.storeAnalysis.topScannedProducts.map((p: any) => p.count)) : 1}
            products={data.storeAnalysis.topScannedProducts}
            title="Fichas Técnicas más Escaneadas"
            subtitle="Interés del Consumidor"
            metricLabel="vistas"
            icon={QrCode}
          />
          <TopProductList
            emptyCopy="Sin cotizaciones en este periodo."
            maxCount={data.storeAnalysis.topQuotedProducts.length ? Math.max(...data.storeAnalysis.topQuotedProducts.map((p: any) => p.count)) : 1}
            products={data.storeAnalysis.topQuotedProducts}
            title="Productos más Solicitados"
            subtitle="Comportamiento de Compra"
            metricLabel="uds"
            icon={ShoppingCart}
          />
        </div>
      </section>
    </div>
  );
}
