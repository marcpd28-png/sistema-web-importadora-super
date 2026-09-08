"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Settings, Check, X, GripVertical } from "lucide-react";
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

export type PromoStats = {
  id: string;
  code: string;
  discount: string;
  commission: string;
  creatorName: string;
  uses: number;
  totalGenerated: number;
};

type WidgetId = "coupon_bar" | "payment_donut" | "influencer_donut" | "discount_donut" | "promo_table";

interface WidgetConfig {
  id: WidgetId;
  enabled: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "coupon_bar", enabled: true, order: 0 },
  { id: "payment_donut", enabled: true, order: 1 },
  { id: "influencer_donut", enabled: true, order: 2 },
  { id: "discount_donut", enabled: true, order: 3 },
  { id: "promo_table", enabled: true, order: 4 },
];

const WIDGET_META: Record<WidgetId, { title: string; subtitle: string; icon: string; fullWidth: boolean }> = {
  coupon_bar: { title: "Usos vs Comisiones", subtitle: "Gráfico de Barras", icon: "📊", fullWidth: true },
  payment_donut: { title: "Ventas por Método de Pago", subtitle: "Gráfico Circular", icon: "💳", fullWidth: false },
  influencer_donut: { title: "Ventas por Influencer", subtitle: "Gráfico Circular", icon: "👥", fullWidth: false },
  discount_donut: { title: "Descuentos vs Ingreso Neto", subtitle: "Gráfico Circular", icon: "💰", fullWidth: false },
  promo_table: { title: "Tabla de Rendimiento", subtitle: "Lista Detallada", icon: "📋", fullWidth: true },
};

export function CustomizableDashboard({
  chartsData,
  promoStats,
  children
}: {
  chartsData: ChartsData;
  promoStats: PromoStats[];
  children?: React.ReactNode;
}) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWidgets, setEditingWidgets] = useState<WidgetConfig[]>([]);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("dashboard_prefs");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = DEFAULT_WIDGETS.map(dw => {
          const found = parsed.find((pw: WidgetConfig) => pw.id === dw.id);
          return found ? { ...dw, ...found } : dw;
        });
        setWidgets(merged.sort((a, b) => a.order - b.order));
      } catch (e) {
        setWidgets(DEFAULT_WIDGETS);
      }
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
    
    // Find portal node for settings icon
    const node = document.getElementById("dashboard-settings-portal");
    if (node) setPortalNode(node);
  }, []);

  const handleOpenConfig = () => {
    setEditingWidgets([...widgets]);
    setIsModalOpen(true);
  };

  const handleSaveConfig = () => {
    const finalized = editingWidgets.map((w, idx) => ({ ...w, order: idx }));
    setWidgets(finalized);
    localStorage.setItem("dashboard_prefs", JSON.stringify(finalized));
    setIsModalOpen(false);
  };

  const toggleWidget = (id: WidgetId) => {
    setEditingWidgets(prev => 
      prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w)
    );
  };

  const moveWidget = (index: number, direction: -1 | 1) => {
    const newWidgets = [...editingWidgets];
    if (index + direction < 0 || index + direction >= newWidgets.length) return;
    
    const temp = newWidgets[index];
    newWidgets[index] = newWidgets[index + direction];
    newWidgets[index + direction] = temp;
    
    setEditingWidgets(newWidgets);
  };

  const renderWidgetContent = (id: WidgetId) => {
    const cardStyle: React.CSSProperties = {
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      height: "100%",
    };

    switch (id) {
      case "coupon_bar":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>Comparativa de Códigos</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>📊 Usos vs Comisiones por Cupón</h3>
            </div>
            <CouponBarChart data={chartsData.couponBars} />
          </div>
        );
      case "payment_donut":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>Preferencia del Cliente</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>💳 Ventas por Método de Pago</h3>
            </div>
            <PaymentMethodDonut data={chartsData.paymentMethods} />
          </div>
        );
      case "influencer_donut":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>Aporte de Promotores</p>
              <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>👥 Ventas por Influencer (S/)</h3>
            </div>
            <InfluencerDonut data={chartsData.influencers} />
          </div>
        );
      case "discount_donut":
        return (
          <div style={cardStyle}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>Análisis Financiero</p>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginTop: 12 }}>
        {widgets.filter(w => w.enabled).map(w => (
          <div 
            key={w.id} 
            style={{ 
              gridColumn: WIDGET_META[w.id].fullWidth ? "1 / -1" : "auto",
              minHeight: 300
            }}
          >
            {renderWidgetContent(w.id)}
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div 
          className="cart-quote-overlay"
          style={{ zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div className="cart-quote-overlay-panel" style={{ width: "90%", maxWidth: 500, borderRadius: 16, height: "auto", maxHeight: "85vh", position: "relative" }}>
            <div className="dashboard-config-head" style={{ display: "flex", justifyContent: "space-between", padding: 24 }}>
              <div>
                <h3>Personalizar Dashboard</h3>
                <p className="checkout-step-copy">Activa o reordena los gráficos de tu panel principal.</p>
              </div>
              <button className="icon-button icon-button-close" onClick={() => setIsModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
              {editingWidgets.map((w, index) => {
                const meta = WIDGET_META[w.id];
                return (
                  <div 
                    key={w.id} 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 12, 
                      padding: 12, 
                      background: w.enabled ? "#fff" : "#f9fafb", 
                      border: "1px solid #e5e7eb", 
                      borderRadius: 12,
                      opacity: w.enabled ? 1 : 0.6
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button 
                        className="icon-button" 
                        onClick={() => moveWidget(index, -1)} 
                        disabled={index === 0}
                        style={{ padding: 4, height: "auto" }}
                      >
                        ↑
                      </button>
                      <button 
                        className="icon-button" 
                        onClick={() => moveWidget(index, 1)} 
                        disabled={index === editingWidgets.length - 1}
                        style={{ padding: 4, height: "auto" }}
                      >
                        ↓
                      </button>
                    </div>
                    
                    <div style={{ fontSize: 24, width: 40, textAlign: "center" }}>{meta.icon}</div>
                    
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: "block", fontSize: 14 }}>{meta.title}</strong>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>{meta.subtitle}</span>
                    </div>

                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input 
                        type="checkbox" 
                        checked={w.enabled} 
                        onChange={() => toggleWidget(w.id)} 
                        style={{ width: 18, height: 18, accentColor: "var(--brand-primary)" }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: 24, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button className="button button-ghost" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="button button-primary" onClick={handleSaveConfig}>
                <Check size={16} /> Guardar Preferencias
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
