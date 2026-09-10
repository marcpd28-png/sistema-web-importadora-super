import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, Package, Truck, XCircle } from "lucide-react";
import { OrderActions } from "../order-actions";

export const dynamic = "force-dynamic";

const STATUS_CONFIG = {
  PENDING:   { label: "Pendiente de Verificación", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: Clock },
  PAID:      { label: "Pago Confirmado",            color: "#10b981", bg: "#f0fdf4", border: "#86efac", icon: CheckCircle },
  SHIPPED:   { label: "Enviado",                   color: "#3b82f6", bg: "#eff6ff", border: "#93c5fd", icon: Truck },
  DELIVERED: { label: "Entregado",                 color: "#6366f1", bg: "#eef2ff", border: "#a5b4fc", icon: Package },
  CANCELED:  { label: "Cancelado",                 color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", icon: XCircle },
  FAILED:    { label: "Fallido",                   color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", icon: XCircle },
} as const;

const DELIVERY_LABELS: Record<string, string> = {
  DELIVERY: "🛵 Delivery Lima",
  PICKUP:   "🏪 Recojo en tienda",
  PROVINCE: "📦 Envío a provincia",
};

const PAYMENT_LABELS: Record<string, string> = {
  CULQI:     "💳 Tarjeta de crédito/débito (Culqi)",
  INTERBANK: "🏦 Transferencia Interbank",
  YAPE:      "📱 Yape",
  PLIN:      "📱 Plin",
};

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await props.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: { select: { id: true, name: true } } },
      },
      promoCode: { select: { code: true, discountType: true, discountValue: true } },
      user: { select: { name: true, email: true } },
    },
  });

  if (!order) notFound();

  const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  const total = Number(order.total);
  const discount = Number(order.discountAmount);
  const commission = Number(order.commissionAmount);
  const subtotal = total + discount;

  return (
    <section className="panel">
      {/* Header */}
      <div className="panel-header" style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Link href="/admin/orders" className="icon-button" style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
          <ArrowLeft size={20} />
        </Link>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">Órdenes / Pagos</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {order.orderNumber || id.slice(-8)}
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14,
              padding: "4px 12px", borderRadius: 20, fontWeight: 700,
              color: cfg.color, background: cfg.bg, border: `2px solid ${cfg.border}`,
            }}>
              <Icon size={14} /> {cfg.label}
            </span>
          </h1>
        </div>
      </div>

      <div className="admin-users-layout">
        {/* LEFT — Order info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Customer card */}
          <article style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 12 }}>👤 Datos del Cliente</p>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Nombre", order.customerName],
                  ["Teléfono", order.customerPhone],
                  ["Email", order.customerEmail || "—"],
                  ["Documento", order.customerDocumentType
                    ? `${order.customerDocumentType}: ${order.customerDocumentNumber}`
                    : "—"],
                  ["Tipo de entrega", DELIVERY_LABELS[order.deliveryType || ""] || order.deliveryType || "—"],
                  ["Dirección", order.customerAddress || "—"],
                  ["Método de pago", PAYMENT_LABELS[order.paymentMethod || ""] || order.paymentMethod || "—"],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 0", color: "#6b7280", fontWeight: 600, width: "40%" }}>{label}</td>
                    <td style={{ padding: "8px 0", fontWeight: 500 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* WhatsApp button */}
            <a
              href={`https://wa.me/${order.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${order.customerName}, te contactamos por tu orden ${order.orderNumber || id.slice(-8)} de Importaciones Super. ¿Puedes enviarnos el comprobante de tu pago?`)}`}
              target="_blank"
              rel="noreferrer"
              className="button button-ghost button-chip"
              style={{ marginTop: 14, fontSize: 13, width: "100%", justifyContent: "center" }}
            >
              💬 Contactar por WhatsApp
            </a>
          </article>

          {/* Order items */}
          <article style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 12 }}>📦 Productos del Pedido</p>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                  <th style={{ textAlign: "left", padding: "6px 0", color: "#6b7280", fontWeight: 600 }}>Producto</th>
                  <th style={{ textAlign: "center", padding: "6px 0", color: "#6b7280", fontWeight: 600 }}>Cant.</th>
                  <th style={{ textAlign: "right", padding: "6px 0", color: "#6b7280", fontWeight: 600 }}>Precio unit.</th>
                  <th style={{ textAlign: "right", padding: "6px 0", color: "#6b7280", fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 0" }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>SKU: {item.code}</div>
                    </td>
                    <td style={{ textAlign: "center", padding: "10px 0" }}>{item.quantity}</td>
                    <td style={{ textAlign: "right", padding: "10px 0" }}>S/ {Number(item.unitPrice).toFixed(2)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", fontWeight: 600 }}>S/ {Number(item.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals summary */}
            <div style={{ marginTop: 16, borderTop: "2px solid #f3f4f6", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, color: "#6b7280" }}>
                <span>Subtotal</span>
                <span>S/ {subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, color: "#10b981" }}>
                  <span>Descuento cupón {order.promoCodeStr && `(${order.promoCodeStr})`}</span>
                  <span>-S/ {discount.toFixed(2)}</span>
                </div>
              )}
              {commission > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#9ca3af" }}>
                  <span>Comisión promotor</span>
                  <span>S/ {commission.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, marginTop: 8 }}>
                <span>TOTAL</span>
                <span style={{ color: "#4f46e5" }}>S/ {total.toFixed(2)}</span>
              </div>
            </div>
          </article>
        </div>

        {/* RIGHT — Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Action panel */}
          <article style={{ background: "#fff", border: "2px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
            <p className="eyebrow" style={{ marginBottom: 12 }}>⚙️ Gestión de la Orden</p>

            {/* Status timeline */}
            <div style={{ marginBottom: 20, padding: "12px 16px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: cfg.color, fontWeight: 700 }}>
                <Icon size={18} />
                Estado actual: {cfg.label}
              </div>
              {order.status === "PENDING" && (
                <p style={{ fontSize: 13, color: "#92400e", marginTop: 6 }}>
                  ⚡ Esta orden requiere que verifiques el comprobante de pago antes de confirmarla.
                </p>
              )}
            </div>

            <OrderActions
              orderId={order.id}
              status={order.status}
              initialNotes={order.adminNotes}
            />
          </article>

          {/* Metadata */}
          <article style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>ℹ️ Metadata</p>
            {[
              ["ID Orden", id.slice(-12)],
              ["Creado", new Date(order.createdAt).toLocaleString("es-PE")],
              ["Actualizado", new Date(order.updatedAt).toLocaleString("es-PE")],
              ["Culqi Charge ID", order.culqiChargeId || "—"],
              ["Token Culqi", order.culqiTokenId ? order.culqiTokenId.slice(0, 20) + "..." : "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, color: "#6b7280" }}>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ fontFamily: "monospace" }}>{value}</span>
              </div>
            ))}
          </article>
        </div>
      </div>
    </section>
  );
}
