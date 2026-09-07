// Script to add deliveryType field to QuoteDraft and insert delivery UI in QuoteForm
const fs = require('fs');

let code = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');

// 1. Add deliveryType and address to QuoteDraft type
code = code.replace(
  `type QuoteDraft = {
  name: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  note: string;
};`,
  `type DeliveryType = "DELIVERY" | "PICKUP" | "PROVINCE";

type QuoteDraft = {
  name: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  note: string;
  deliveryType: DeliveryType;
  address: string;
  district: string;
};`
);

// 2. Add deliveryType, address, district to buildInitialQuoteDraft output
// Find buildInitialQuoteDraft and add missing fields
code = code.replace(
  /const buildInitialQuoteDraft[^}]+}\s*};/s,
  (match) => {
    if (match.includes('deliveryType')) return match;
    return match.replace(
      /note: [^,\n}]+[,\n]/,
      (m) => m + `  deliveryType: "DELIVERY",\n  address: "",\n  district: "",\n`
    );
  }
);

// 3. Insert the delivery selector block BEFORE the optional data <details> block in QuoteForm
const detailsBlock = `        <details className="cart-quote-details">`;
const deliveryUI = `        {/* ── Delivery Type Selector ── */}
        <div style={{ marginBottom: "4px" }}>
          <span style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "10px", color: "#374151" }}>
            ¿Cómo recibirás tu pedido?
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {(["DELIVERY", "PICKUP", "PROVINCE"] as DeliveryType[]).map((type) => {
              const labels: Record<DeliveryType, { icon: string; title: string; subtitle: string }> = {
                DELIVERY: { icon: "🛵", title: "Delivery Lima", subtitle: "Envío a domicilio en Lima" },
                PICKUP:   { icon: "🏪", title: "Recojo en Tienda", subtitle: "Retira en nuestro local" },
                PROVINCE: { icon: "📦", title: "Envío Provincia", subtitle: "Via courier a tu ciudad" },
              };
              const l = labels[type];
              const selected = draft.deliveryType === type;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={quoteState === "loading" || quoteState === "success"}
                  onClick={() => onChange({ deliveryType: type })}
                  style={{
                    padding: "12px 8px",
                    border: selected ? "2px solid #6366f1" : "2px solid #e5e7eb",
                    borderRadius: "10px",
                    background: selected ? "#eef2ff" : "#fff",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: "22px", marginBottom: "4px" }}>{l.icon}</div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: selected ? "#4f46e5" : "#374151" }}>{l.title}</div>
                  <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "2px", lineHeight: 1.3 }}>{l.subtitle}</div>
                </button>
              );
            })}
          </div>

          {/* Address field — show for DELIVERY and PROVINCE */}
          {(draft.deliveryType === "DELIVERY" || draft.deliveryType === "PROVINCE") && (
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <label>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                  {draft.deliveryType === "PROVINCE" ? "Ciudad / Provincia de destino" : "Dirección de entrega"}
                </span>
                <input
                  type="text"
                  disabled={quoteState === "loading" || quoteState === "success"}
                  value={draft.address}
                  onChange={(e) => onChange({ address: e.target.value })}
                  placeholder={draft.deliveryType === "PROVINCE" ? "Ej: Arequipa, Trujillo, Cusco..." : "Ej: Av. Los Álamos 123, San Borja"}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
                />
              </label>
              {draft.deliveryType === "DELIVERY" && (
                <label>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>Distrito</span>
                  <input
                    type="text"
                    disabled={quoteState === "loading" || quoteState === "success"}
                    value={draft.district}
                    onChange={(e) => onChange({ district: e.target.value })}
                    placeholder="Ej: Miraflores, San Isidro, Los Olivos..."
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
                  />
                </label>
              )}
            </div>
          )}

          {draft.deliveryType === "PICKUP" && (
            <div style={{ marginTop: "10px", padding: "10px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", fontSize: "13px", color: "#166534" }}>
              📍 <strong>Dirección:</strong> Jr. Lampa 1234, Cercado de Lima — Lun–Sáb 9am–6pm
            </div>
          )}
        </div>\n\n`;

code = code.replace(detailsBlock, deliveryUI + detailsBlock);

fs.writeFileSync('src/components/catalog/cart-drawer.tsx', code);

// Verify
const result = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');
console.log('deliveryType in QuoteDraft:', result.includes('deliveryType: DeliveryType') ? '✓' : '✗');
console.log('DeliveryType UI:', result.includes('Recojo en Tienda') ? '✓' : '✗');
console.log('Address field:', result.includes('Dirección de entrega') ? '✓' : '✗');
console.log('Province field:', result.includes('Ciudad / Provincia') ? '✓' : '✗');
