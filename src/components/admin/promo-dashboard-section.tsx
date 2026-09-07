"use client";

import { Tag, UsersRound } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ExportExcelButton } from "./export-excel-button";
import Link from "next/link";

type PromoStats = {
  id: string;
  code: string;
  discount: string;
  commission: string;
  creatorName: string;
  uses: number;
  totalGenerated: number;
};

export function PromoDashboardSection({ promos }: { promos: PromoStats[] }) {
  // Data for Excel
  const exportData = promos.map(p => ({
    "Código": p.code,
    "Promotor": p.creatorName,
    "Descuento al Cliente": p.discount,
    "Comisión Promotor": p.commission,
    "Usos (Órdenes Pagadas)": p.uses,
    "Ganancia Total Generada (S/)": p.totalGenerated
  }));

  return (
    <article className="admin-users-list-card" style={{ marginTop: "32px", width: "100%" }}>
      <div className="product-section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="eyebrow">Marketing y Afiliados</p>
          <h2>Rendimiento de Cupones</h2>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <ExportExcelButton data={exportData} filename="Reporte_Cupones.xlsx" label="Exportar Excel" />
          <Link href="/admin/cupones" className="button button-primary" style={{ height: "36px" }}>
            Gestionar Cupones
          </Link>
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
            {promos.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "16px" }}>
                  No hay datos de cupones.
                </td>
              </tr>
            ) : null}
            {promos.map(promo => (
              <tr key={promo.id}>
                <td data-label="Código">
                  <strong style={{ color: "var(--brand-primary)" }}>{promo.code}</strong>
                </td>
                <td data-label="Promotor">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <UsersRound size={14} />
                    <span>{promo.creatorName}</span>
                  </div>
                </td>
                <td data-label="Descuento">
                  <span className="badge badge-success">{promo.discount}</span>
                </td>
                <td data-label="Usos">
                  <strong>{promo.uses}</strong>
                </td>
                <td data-label="Ganancia">
                  <strong style={{ color: "var(--brand-success)" }}>
                    {formatCurrency(promo.totalGenerated, "PEN")}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
