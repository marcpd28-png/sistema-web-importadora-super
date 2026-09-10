"use client";

import { useRef } from "react";

export type ReceiptItem = {
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ReceiptData = {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  deliveryType: string;
  address?: string;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  promoCode?: string;
  total: number;
  createdAt: string; // ISO string
  businessName: string;
  storeAddress: string;
  whatsappNumber: string;
};

const DELIVERY_LABELS: Record<string, string> = {
  DELIVERY: "🛵 Delivery a domicilio (Lima)",
  PICKUP: "🏪 Recojo en tienda",
  PROVINCE: "📦 Envío a provincia vía courier",
};

const PAYMENT_LABELS: Record<string, string> = {
  CULQI: "💳 Tarjeta de crédito/débito",
  INTERBANK: "🏦 Transferencia Interbank",
  YAPE: "📱 Yape",
  PLIN: "📱 Plin",
};

export function OrderReceipt({ data }: { data: ReceiptData }) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const date = new Date(data.createdAt).toLocaleString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleCopyText = () => {
    const lines = [
      `═══════════════════════════`,
      `🧾 COMPROBANTE DE PEDIDO`,
      `═══════════════════════════`,
      `${data.businessName}`,
      `Fecha: ${date}`,
      `Orden: ${data.orderNumber}`,
      ``,
      `👤 CLIENTE`,
      `Nombre: ${data.customerName}`,
      `Teléfono: ${data.customerPhone}`,
      ``,
      `📦 PRODUCTOS`,
      ...data.items.map(
        (i) => `• ${i.name} x${i.quantity} = S/ ${i.total.toFixed(2)}`
      ),
      ``,
      `💰 RESUMEN`,
      `Subtotal: S/ ${data.subtotal.toFixed(2)}`,
      ...(data.discountAmount > 0
        ? [`Descuento (${data.promoCode || "cupón"}): -S/ ${data.discountAmount.toFixed(2)}`]
        : []),
      `TOTAL: S/ ${data.total.toFixed(2)}`,
      ``,
      `💳 Método de pago: ${PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod}`,
      `🚚 Entrega: ${DELIVERY_LABELS[data.deliveryType] || data.deliveryType}`,
      ...(data.address ? [`📍 Dirección: ${data.address}`] : []),
      ``,
      `Gracias por tu compra. Envíanos tu voucher de pago para confirmar tu pedido.`,
    ].join("\n");

    navigator.clipboard.writeText(lines).then(() => {
      alert("✓ Comprobante copiado al portapapeles");
    });
  };

  return (
    <div
      ref={receiptRef}
      style={{
        fontFamily: "monospace",
        fontSize: 13,
        background: "#fff",
        border: "2px dashed #d1d5db",
        borderRadius: 12,
        padding: "20px 24px",
        maxWidth: 420,
        margin: "0 auto",
        lineHeight: 1.6,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🧾</div>
        <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 1, textTransform: "uppercase" }}>
          Comprobante de Pedido
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{data.businessName}</div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>{date}</div>
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "10px 0" }} />

      {/* Order number */}
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <span style={{
          background: "#eef2ff", color: "#4f46e5", padding: "4px 12px",
          borderRadius: 20, fontWeight: 800, fontSize: 14, letterSpacing: 1,
        }}>
          {data.orderNumber}
        </span>
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "10px 0" }} />

      {/* Customer */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>
          👤 Cliente
        </div>
        <div style={{ fontWeight: 600 }}>{data.customerName}</div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>{data.customerPhone}</div>
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "10px 0" }} />

      {/* Items */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
          📦 Productos
        </div>
        {data.items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
            <div style={{ flex: 1, paddingRight: 8 }}>
              <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{item.name}</div>
              <div style={{ color: "#9ca3af", fontSize: 11 }}>
                {item.quantity} × S/ {item.unitPrice.toFixed(2)}
              </div>
            </div>
            <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
              S/ {item.total.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "10px 0" }} />

      {/* Totals */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#6b7280" }}>
          <span>Subtotal</span>
          <span>S/ {data.subtotal.toFixed(2)}</span>
        </div>
        {data.discountAmount > 0 && (
          <div style={{
            display: "flex", justifyContent: "space-between", marginBottom: 4,
            color: "#16a34a", fontWeight: 700,
            background: "#f0fdf4", padding: "4px 8px", borderRadius: 6,
            border: "1px solid #86efac",
          }}>
            <span>
              🎟️ Descuento
              {data.promoCode && (
                <span style={{
                  marginLeft: 6, fontSize: 11, background: "#dcfce7",
                  padding: "1px 6px", borderRadius: 8, color: "#15803d",
                }}>
                  {data.promoCode}
                </span>
              )}
            </span>
            <span>-S/ {data.discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontWeight: 800, fontSize: 16, marginTop: 8,
          padding: "8px 0", borderTop: "2px solid #111",
        }}>
          <span>TOTAL</span>
          <span style={{ color: "#4f46e5" }}>S/ {data.total.toFixed(2)}</span>
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "10px 0" }} />

      {/* Delivery & Payment */}
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <div style={{ marginBottom: 4 }}>
          <strong>Método de pago:</strong>{" "}
          {PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod}
        </div>
        <div style={{ marginBottom: 4 }}>
          <strong>Entrega:</strong>{" "}
          {DELIVERY_LABELS[data.deliveryType] || data.deliveryType}
        </div>
        {data.address && (
          <div style={{ marginBottom: 4 }}>
            <strong>Dirección:</strong> {data.address}
          </div>
        )}
        {data.deliveryType === "PICKUP" && (
          <div style={{
            marginTop: 8, padding: "8px 10px",
            background: "#f0fdf4", border: "1px solid #86efac",
            borderRadius: 8, color: "#166534",
          }}>
            📍 {data.storeAddress}
          </div>
        )}
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "10px 0" }} />

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: 12, color: "#6b7280" }}>
        <p style={{ margin: "0 0 4px" }}>Gracias por tu compra 🙏</p>
        <p style={{ margin: 0 }}>Envíanos tu voucher de pago por WhatsApp para confirmar tu pedido.</p>
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopyText}
        style={{
          marginTop: 14, width: "100%", padding: "10px",
          background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151",
        }}
      >
        📋 Copiar comprobante como texto
      </button>
    </div>
  );
}
