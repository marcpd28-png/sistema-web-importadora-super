import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeleteRecordButton } from "@/components/admin/delete-record-button";
import { deleteOrderAction } from "@/app/admin/delete-actions";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { ShoppingBag, Clock, CheckCircle, XCircle, Truck, Package } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_CONFIG = {
  PENDING:   { label: "Pendiente",   color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: Clock },
  PAID:      { label: "Pagado",      color: "#10b981", bg: "#f0fdf4", border: "#86efac", icon: CheckCircle },
  SHIPPED:   { label: "Enviado",     color: "#3b82f6", bg: "#eff6ff", border: "#93c5fd", icon: Truck },
  DELIVERED: { label: "Entregado",   color: "#6366f1", bg: "#eef2ff", border: "#a5b4fc", icon: Package },
  CANCELED:  { label: "Cancelado",   color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", icon: XCircle },
  FAILED:    { label: "Fallido",     color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", icon: XCircle },
} as const;

const DELIVERY_LABELS: Record<string, string> = {
  DELIVERY: "🛵 Delivery Lima",
  PICKUP:   "🏪 Recojo en tienda",
  PROVINCE: "📦 Envío a provincia",
};

const PAYMENT_LABELS: Record<string, string> = {
  CULQI:     "💳 Tarjeta (Culqi)",
  INTERBANK: "🏦 Transferencia Interbank",
  YAPE:      "📱 Yape",
  PLIN:      "📱 Plin",
  MANUAL:    "📋 Manual",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdmin();
  const params = searchParams ? await searchParams : { status: "ALL", q: "" };
  const filterStatus = params.status || "ALL";
  const search = params.q || "";

  const whereClause: any = {};
  if (filterStatus !== "ALL") whereClause.status = filterStatus;
  if (search) {
    whereClause.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search } },
      { orderNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { select: { name: true, quantity: true } },
        promoCode: { select: { code: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countMap = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all])
  );
  const totalAll = Object.values(countMap).reduce((a, b) => a + b, 0);

  const tabs = [
    { key: "ALL",     label: "Todas",      count: totalAll },
    { key: "PENDING", label: "Pendientes", count: countMap.PENDING || 0 },
    { key: "PAID",    label: "Pagadas",    count: countMap.PAID || 0 },
    { key: "SHIPPED", label: "Enviadas",   count: countMap.SHIPPED || 0 },
    { key: "CANCELED",label: "Canceladas", count: countMap.CANCELED || 0 },
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ShoppingBag size={24} />
          <div>
            <p className="eyebrow">Gestión Comercial</p>
            <h1>Órdenes y Pagos</h1>
          </div>
        </div>
        {(countMap.PENDING || 0) > 0 && (
          <div style={{ padding: "8px 16px", background: "#fffbeb", border: "2px solid #fbbf24", borderRadius: 10, fontSize: 14, fontWeight: 700, color: "#92400e" }}>
            ⚠️ {countMap.PENDING} orden{countMap.PENDING > 1 ? "es" : ""} esperando verificación
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/orders?status=${tab.key}${search ? `&q=${search}` : ""}`}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              border: "2px solid",
              borderColor: filterStatus === tab.key ? "#6366f1" : "#e5e7eb",
              background: filterStatus === tab.key ? "#eef2ff" : "#fff",
              color: filterStatus === tab.key ? "#4f46e5" : "#6b7280",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                padding: "0 6px",
                background: tab.key === "PENDING" ? "#f59e0b" : "#6366f1",
                color: "#fff",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 800,
              }}>
                {tab.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Search bar */}
      <form style={{ marginBottom: 20 }}>
        <input type="hidden" name="status" value={filterStatus} />
        <input
          name="q"
          defaultValue={search}
          placeholder="Buscar por nombre, teléfono o número de orden..."
          style={{ width: "100%", padding: "10px 16px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
        />
      </form>

      {/* Orders table */}
      {orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
          <ShoppingBag size={40} style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 600 }}>No hay órdenes en esta categoría</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Método</th>
                <th>Entrega</th>
                <th>Total</th>
                <th>Cupón</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const cfg = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.PENDING;
                const Icon = cfg.icon;
                return (
                  <tr key={order.id}>
                    <td data-label="Orden">
                      <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
                        {order.orderNumber || order.id.slice(-8)}
                      </code>
                    </td>
                    <td data-label="Cliente">
                      <div style={{ fontWeight: 600 }}>{order.customerName}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{order.customerPhone}</div>
                    </td>
                    <td data-label="Método">
                      <span style={{ fontSize: 12 }}>
                        {PAYMENT_LABELS[order.paymentMethod || ""] || order.paymentMethod || "—"}
                      </span>
                    </td>
                    <td data-label="Entrega">
                      <span style={{ fontSize: 12 }}>
                        {DELIVERY_LABELS[order.deliveryType || ""] || order.deliveryType || "—"}
                      </span>
                    </td>
                    <td data-label="Total">
                      <strong>S/ {Number(order.total).toFixed(2)}</strong>
                      {Number(order.discountAmount) > 0 && (
                        <div style={{ fontSize: 11, color: "#10b981" }}>
                          -{Number(order.discountAmount).toFixed(2)} desc.
                        </div>
                      )}
                    </td>
                    <td data-label="Cupón">
                      {order.promoCodeStr ? (
                        <span style={{ fontSize: 12, background: "#eef2ff", color: "#4f46e5", padding: "2px 8px", borderRadius: 8, fontWeight: 700 }}>
                          {order.promoCodeStr}
                        </span>
                      ) : <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td data-label="Estado">
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
                      }}>
                        <Icon size={12} />
                        {cfg.label}
                      </span>
                    </td>
                    <td data-label="Fecha">
                      <span className="muted" style={{ fontSize: 12 }}>
                        {new Date(order.createdAt).toLocaleDateString("es-PE", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="button button-ghost button-chip"
                        style={{ fontSize: 12 }}
                      >
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
