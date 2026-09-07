"use client";

import {
  CouponBarChart,
  PaymentMethodDonut,
  InfluencerDonut,
  DiscountVsNetDonut,
  type CouponBarData,
  type DonutData,
} from "./promo-charts";
import { ExportExcelButton } from "./export-excel-button";
import Link from "next/link";

export type ChartsData = {
  couponBars: CouponBarData[];
  paymentMethods: DonutData[];
  influencers: DonutData[];
  discountVsNet: DonutData[];
  exportRows: any[];
};

export function PromoChartsSection({ data }: { data: ChartsData }) {
  const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const headStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  };

  return (
    <section style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Section header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6366f1", letterSpacing: 1, margin: 0 }}>
            Analytics · Marketing
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>
            Rendimiento de Cupones y Promotores
          </h2>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <ExportExcelButton
            data={data.exportRows}
            filename="Reporte_Cupones_Completo.xlsx"
            label="Exportar Excel"
          />
          <Link href="/admin/cupones" className="button button-primary" style={{ height: 36 }}>
            Gestionar Cupones
          </Link>
        </div>
      </div>

      {/* Row 1: Full-width bar chart */}
      <div style={cardStyle}>
        <div style={headStyle}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>
              Comparativa de Códigos
            </p>
            <h3 style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>📊 Usos vs Comisiones por Cupón</h3>
          </div>
        </div>
        <CouponBarChart data={data.couponBars} />
      </div>

      {/* Row 2: Three donuts side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {/* Donut 1 — Payment method */}
        <div style={cardStyle}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>
              Preferencia del Cliente
            </p>
            <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>💳 Ventas por Método de Pago</h3>
          </div>
          <PaymentMethodDonut data={data.paymentMethods} />
        </div>

        {/* Donut 2 — Influencer */}
        <div style={cardStyle}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>
              Aporte de Promotores
            </p>
            <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>👥 Ventas por Influencer (S/)</h3>
          </div>
          <InfluencerDonut data={data.influencers} />
        </div>

        {/* Donut 3 — Discount vs Net */}
        <div style={cardStyle}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: 1 }}>
              Análisis Financiero
            </p>
            <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>💰 Descuentos vs Ingreso Neto</h3>
          </div>
          <DiscountVsNetDonut data={data.discountVsNet} />
        </div>
      </div>
    </section>
  );
}
