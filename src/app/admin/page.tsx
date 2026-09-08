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
import { prisma } from "@/lib/prisma";

import { CustomizableDashboard } from "@/components/admin/customizable-dashboard";
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

  const promosData = await prisma.promoCode.findMany({
    include: {
      creator: true,
      orders: {
        where: { status: "PAID" },
        select: { commissionAmount: true, discountAmount: true, total: true },
      },
      _count: {
        select: { orders: { where: { status: "PAID" } } }
      }
    },
    orderBy: { createdAt: "desc" },
  });

  const promoStats = promosData.map(p => ({
    id: p.id,
    code: p.code,
    creatorName: p.creator ? p.creator.name : "Sin asignar",
    discount: p.discountType === "PERCENTAGE" ? `${Number(p.discountValue)}%` : `S/ ${Number(p.discountValue)}`,
    commission: p.commissionType === "PERCENTAGE" ? `${Number(p.commissionValue)}%` : `S/ ${Number(p.commissionValue)}`,
    uses: p._count.orders,
    totalGenerated: p.orders.reduce((sum: number, order: any) => sum + Number(order.commissionAmount), 0),
  }));

  // ── Charts data ─────────────────────────────────────────────────────────────
  // 1. Bar chart: usos y comisiones por cupón
  const couponBars = promosData.map(p => ({
    code: p.code,
    usos: p._count.orders,
    comisiones: p.orders.reduce((s: number, o: any) => s + Number(o.commissionAmount), 0),
  }));

  // 2. Donut: ventas por método de pago
  const paymentOrders = await prisma.order.groupBy({
    by: ["paymentMethod"],
    where: { status: "PAID" },
    _count: { _all: true },
  });
  const paymentMethods = paymentOrders.map(p => ({
    name: p.paymentMethod || "Sin especificar",
    value: p._count._all,
  }));

  // 3. Donut: ventas (S/) por influencer
  const influencerMap: Record<string, number> = {};
  for (const p of promosData) {
    const creatorName = p.creator ? p.creator.name : "Sin promotor";
    const totalSales = p.orders.reduce((s: number, o: any) => s + Number(o.total), 0);
    influencerMap[creatorName] = (influencerMap[creatorName] || 0) + totalSales;
  }
  const influencers = Object.entries(influencerMap).map(([name, value]) => ({ name, value }));

  // 4. Donut: descuentos vs comisiones vs ingreso neto
  const allPaidOrders = await prisma.order.aggregate({
    where: { status: "PAID" },
    _sum: { total: true, discountAmount: true, commissionAmount: true },
  });
  const grossTotal = Number(allPaidOrders._sum.total || 0);
  const totalDiscount = Number(allPaidOrders._sum.discountAmount || 0);
  const totalCommission = Number(allPaidOrders._sum.commissionAmount || 0);
  const netIncome = grossTotal - totalDiscount - totalCommission;
  const discountVsNet = [
    { name: "Ingreso Neto", value: Math.max(0, netIncome) },
    { name: "Descuentos Dados", value: totalDiscount },
    { name: "Comisiones Pagadas", value: totalCommission },
  ].filter(d => d.value > 0);

  // Export rows for Excel
  const exportRows = promoStats.map(p => ({
    "Código": p.code,
    "Promotor": p.creatorName,
    "Descuento al Cliente": p.discount,
    "Comisión Promotor": p.commission,
    "Usos Totales": p.uses,
    "Comisiones Generadas (S/)": p.totalGenerated,
  }));

  const chartsData = { couponBars, paymentMethods, influencers, discountVsNet, exportRows };

  return (
    <CustomizableDashboard chartsData={chartsData} promoStats={promoStats as any} storeData={data}>
      
      <section className="panel admin-hero-panel">
        <div className="admin-hero-copy">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><p className="eyebrow" style={{ margin: 0 }}>Dashboard operativo</p><span id="dashboard-settings-portal"></span></div>
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

        

        
      </section>
      
    </CustomizableDashboard>
  );
}
