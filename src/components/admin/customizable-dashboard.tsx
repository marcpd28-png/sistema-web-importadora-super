"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Settings } from "lucide-react";
import { MobileDisclosure } from "./mobile-disclosure";
import { CouponBarChart, PaymentMethodDonut, InfluencerDonut, DiscountVsNetDonut } from "./promo-charts";
import { formatCurrency } from "@/lib/utils";
import { UsersRound } from "lucide-react";

export type ChartsData = {
  couponBars: any[];
  paymentMethods: any[];
  influencers: any[];
  discountVsNet: any[];
  exportRows: any[];
};

import { QrScansCard, QuotesTotalCard, TopProductList } from "./analytics-widgets";
import { FunnelChart, CategoryRevenueChart, QuotesVsOrdersChart, TopPromotersChart, PeakHoursChart } from "./advanced-dashboard-charts";
import { QrCode, ShoppingCart } from "lucide-react";
import {
  DASHBOARD_PREFERENCES_KEY,
  DASHBOARD_WIDGET_META,
  DEFAULT_DASHBOARD_PREFERENCES,
  LEGACY_DASHBOARD_PREFERENCES_KEY,
  parseDashboardPreferences,
  type DashboardPreferences,
  type DashboardWidgetId,
} from "@/lib/dashboard-preferences";

export type PromoStats = {
  id: string;
  code: string;
  discount: string;
  commission: string;
  creatorName: string;
  uses: number;
  totalGenerated: number;
};

export function CustomizableDashboard({
  chartsData,
  promoStats,
  storeData,
  children
}: {
  chartsData: ChartsData;
  promoStats: PromoStats[];
  storeData: any;
  children?: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState<DashboardPreferences>(DEFAULT_DASHBOARD_PREFERENCES);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const loadPreferences = () => setPreferences(parseDashboardPreferences(
      localStorage.getItem(DASHBOARD_PREFERENCES_KEY),
      localStorage.getItem(LEGACY_DASHBOARD_PREFERENCES_KEY),
    ));
    queueMicrotask(loadPreferences);
    window.addEventListener("pageshow", loadPreferences);
    
    // Find portal node for settings icon
    const node = document.getElementById("dashboard-settings-portal");
    if (node) queueMicrotask(() => setPortalNode(node));
    return () => window.removeEventListener("pageshow", loadPreferences);
  }, []);

  const handleOpenConfig = () => {
    window.location.assign("/admin/dashboard-settings");
  };

  const renderWidgetContent = (id: DashboardWidgetId) => {
    const cardStyle: React.CSSProperties = {
      background: "var(--surface-strong)", color: "var(--foreground)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      height: "100%",
    };

    switch (id) {
      case "qr_scans":
        return <QrScansCard data={storeData} />;
      case "quotes_total":
        return <QuotesTotalCard data={storeData} />;
      case "top_scanned":
        return (
          <TopProductList
            emptyCopy="Sin datos de escaneo en este periodo."
            maxCount={storeData.storeAnalysis.topScannedProducts.length ? Math.max(...storeData.storeAnalysis.topScannedProducts.map((p: any) => p.count)) : 1}
            products={storeData.storeAnalysis.topScannedProducts}
            title="Fichas Técnicas más Escaneadas"
            subtitle="Interés del Consumidor"
            metricLabel="vistas"
            icon={QrCode}
          />
        );
      case "top_quoted":
        return (
          <TopProductList
            emptyCopy="Sin cotizaciones en este periodo."
            maxCount={storeData.storeAnalysis.topQuotedProducts.length ? Math.max(...storeData.storeAnalysis.topQuotedProducts.map((p: any) => p.count)) : 1}
            products={storeData.storeAnalysis.topQuotedProducts}
            title="Productos más Solicitados"
            subtitle="Comportamiento de Compra"
            metricLabel="uds"
            icon={ShoppingCart}
          />
        );
      case "coupon_bar":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Comparativa de Códigos</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>📊 Usos vs Comisiones por Cupón</h3>
            </div>
            <CouponBarChart data={chartsData.couponBars} />
          </div>
        );
      case "payment_donut":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Preferencia del Cliente</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>💳 Ventas por Método de Pago</h3>
            </div>
            <PaymentMethodDonut data={chartsData.paymentMethods} />
          </div>
        );
      case "influencer_donut":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Aporte de Promotores</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>👥 Ventas por Influencer (S/)</h3>
            </div>
            <InfluencerDonut data={chartsData.influencers} />
          </div>
        );
      case "discount_donut":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Análisis Financiero</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>💰 Descuentos vs Ingreso Neto</h3>
            </div>
            <DiscountVsNetDonut data={chartsData.discountVsNet} />
          </div>
        );
      case "promo_table":
        return (
          <article className="admin-users-list-card" style={{ width: "100%" }}>
            <div className="product-section-head">
              <div>
                <p className="eyebrow">Marketing y Afiliados</p>
                <h2>Rendimiento de Cupones</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Promotor</th>
                    <th>Descuento</th>
                    <th>Usos Totales</th>
                    <th>Ganancia Generada</th>
                  </tr>
                </thead>
                <tbody>
                  {promoStats.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "16px" }}>
                        No hay datos de cupones.
                      </td>
                    </tr>
                  ) : null}
                  {promoStats.map(promo => (
                    <tr key={promo.id}>
                      <td data-label="Código"><strong style={{ color: "var(--brand-primary)" }}>{promo.code}</strong></td>
                      <td data-label="Promotor">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <UsersRound size={14} /><span>{promo.creatorName}</span>
                        </div>
                      </td>
                      <td data-label="Descuento"><span className="badge badge-success">{promo.discount}</span></td>
                      <td data-label="Usos"><strong>{promo.uses}</strong></td>
                      <td data-label="Ganancia"><strong style={{ color: "var(--brand-success)" }}>{formatCurrency(promo.totalGenerated, "PEN")}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        );
      
      case "advanced_funnel":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Rendimiento General</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>🔻 Embudo de Conversión</h3>
            </div>
            <FunnelChart data={[]} />
          </div>
        );
      case "advanced_category":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Inventario Múltiple</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>📦 Ventas por Categoría</h3>
            </div>
            <CategoryRevenueChart data={[]} />
          </div>
        );
      case "advanced_quotes_orders":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Evolución Mensual</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>📈 Cotizaciones vs Órdenes Cerradas</h3>
            </div>
            <QuotesVsOrdersChart data={[]} />
          </div>
        );
      case "advanced_promoters":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Influencers Activos</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>🏆 Top Promotores (Ventas)</h3>
            </div>
            <TopPromotersChart data={[]} />
          </div>
        );
      case "advanced_heatmap":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: 1 }}>Intención de Compra</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>🔥 Horas Pico de Transacciones</h3>
            </div>
            <PeakHoursChart data={[]} />
          </div>
        );

      default:
        return null;
    }
  };

  const settingsButton = (
    <button 
      onClick={handleOpenConfig} 
      className="icon-button" 
      title="Personalizar Dashboard"
      style={{ width: 26, height: 26, background: "var(--brand-primary)", color: "white", borderRadius: "50%", padding: 0, display: "inline-flex", justifyContent: "center", alignItems: "center" }}
    >
      <Settings size={14} />
    </button>
  );

  return (
    <div className="stack-lg">
      {portalNode ? createPortal(settingsButton, portalNode) : null}

      {children}

      <div className={`dashboard-widgets-grid density-${preferences.density} columns-${preferences.columns}`}>
        {preferences.widgets.filter(w => w.enabled).map((w, index) => (
          <div 
            key={w.id} 
            className="dashboard-widget-slot"
            style={{ 
              gridColumn: DASHBOARD_WIDGET_META[w.id].fullWidth ? "1 / -1" : "auto",
              order: index,
              minHeight: 300
            }}
          >
            <MobileDisclosure title={DASHBOARD_WIDGET_META[w.id].title}>
              {renderWidgetContent(w.id)}
            </MobileDisclosure>
          </div>
        ))}
      </div>

    </div>
  );
}
