import React from "react";
import { QrCode, ShoppingCart } from "lucide-react";
import { cn, formatCompactNumber } from "@/lib/utils";

export function getDeltaTone(deltaPercent: number | null) {
  if (deltaPercent === null) {
    return "is-neutral";
  }
  return deltaPercent >= 0 ? "is-positive" : "is-negative";
}

export function formatDelta(deltaPercent: number | null) {
  if (deltaPercent === null) {
    return "Sin base";
  }
  return `${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}%`;
}

export function TopProductList({
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
    <article className="trend-list-card" style={{ height: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px" }}>
      <div className="trend-list-head" style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--brand-primary)", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>{subtitle}</p>
          <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--brand-night)" }}>{title}</h3>
        </div>
        <span className="trend-icon-chip" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(99, 102, 241, 0.1)", color: "var(--brand-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={20} />
        </span>
      </div>

      {products.length ? (
        <div className="trend-product-list" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {products.map((product) => (
            <div className="trend-product-item" key={product.code} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="trend-product-main" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: "0.9rem" }}>
                    {product.name}
                  </strong>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>{product.code}</span>
                </div>
                <span className="trend-delta-chip is-neutral" style={{ fontWeight: "700", background: "#f1f5f9", padding: "4px 8px", borderRadius: 999, fontSize: "0.75rem" }}>
                  {product.count} {metricLabel}
                </span>
              </div>
              <div className="trend-progress-track" style={{ height: 6, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                <div
                  className="trend-progress-bar"
                  style={{ width: `${(product.count / maxCount) * 100}%`, height: "100%", background: "var(--brand-primary)", borderRadius: 999 }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="trend-empty" style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
          <p>{emptyCopy}</p>
        </div>
      )}
    </article>
  );
}

export function QrScansCard({ data }: { data: any }) {
  return (
    <article className="trend-hero-card" style={{ height: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div className="trend-card-head" style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p className="eyebrow" style={{ color: "var(--brand-primary)", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>{data.storeAnalysis.title}</p>
            <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--brand-night)" }}>Escaneos de Códigos QR</h3>
          </div>
          <span className="trend-icon-chip" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(99, 102, 241, 0.1)", color: "var(--brand-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <QrCode size={20} />
          </span>
        </div>

        <div className="trend-hero-value" style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <strong style={{ fontSize: "2.5rem", color: "var(--brand-night)", lineHeight: 1 }}>{formatCompactNumber(data.storeAnalysis.scans.currentValue)}</strong>
          <span
            className={cn(
              "trend-delta-chip",
              getDeltaTone(data.storeAnalysis.scans.deltaPercent),
            )}
            style={{ padding: "4px 8px", borderRadius: 999, fontSize: "0.85rem", fontWeight: 600, background: getDeltaTone(data.storeAnalysis.scans.deltaPercent) === "is-negative" ? "#fee2e2" : "#dcfce7", color: getDeltaTone(data.storeAnalysis.scans.deltaPercent) === "is-negative" ? "#ef4444" : "#10b981" }}
          >
            {formatDelta(data.storeAnalysis.scans.deltaPercent)}
          </span>
        </div>
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
  );
}

export function QuotesTotalCard({ data }: { data: any }) {
  return (
    <article className="trend-forecast-card" style={{ height: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div className="trend-card-head" style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p className="eyebrow" style={{ color: "var(--brand-primary)", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>Cotizaciones</p>
            <h3 style={{ margin: 0, fontSize: "1.25rem", color: "var(--brand-night)" }}>Total Valorizado</h3>
          </div>
          <span className="trend-icon-chip" style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(99, 102, 241, 0.1)", color: "var(--brand-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShoppingCart size={20} />
          </span>
        </div>

        <div className="trend-hero-value" style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <strong style={{ fontSize: "2.5rem", color: "var(--brand-night)", lineHeight: 1 }}>
            {data.currencySymbol}{formatCompactNumber(data.storeAnalysis.quotesTotal.currentValue)}
          </strong>
          <span
            className={cn(
              "trend-delta-chip",
              getDeltaTone(data.storeAnalysis.quotesTotal.deltaPercent),
            )}
            style={{ padding: "4px 8px", borderRadius: 999, fontSize: "0.85rem", fontWeight: 600, background: getDeltaTone(data.storeAnalysis.quotesTotal.deltaPercent) === "is-negative" ? "#fee2e2" : "#dcfce7", color: getDeltaTone(data.storeAnalysis.quotesTotal.deltaPercent) === "is-negative" ? "#ef4444" : "#10b981" }}
          >
            {formatDelta(data.storeAnalysis.quotesTotal.deltaPercent)}
          </span>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px", marginTop: "16px" }}>
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
            style={{ padding: "4px 8px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600, background: getDeltaTone(data.storeAnalysis.quotesCount.deltaPercent) === "is-negative" ? "#fee2e2" : "#dcfce7", color: getDeltaTone(data.storeAnalysis.quotesCount.deltaPercent) === "is-negative" ? "#ef4444" : "#10b981" }}
          >
            {formatDelta(data.storeAnalysis.quotesCount.deltaPercent)}
          </span>
        </div>
      </div>
    </article>
  );
}
