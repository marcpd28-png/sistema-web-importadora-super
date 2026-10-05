import { Metadata } from "next";
import Link from "next/link";
import { getAdminOrders } from "@/lib/orders-service";
import { Eye, FileText, CheckCircle2, Clock3, SearchCode, Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pedidos | Importadora Super",
};

type OrderStatus = "PENDING" | "PAID" | "FAILED" | "CANCELED" | "SHIPPED";

interface AdminOrdersPageProps {
  searchParams?: Promise<{ status?: string; page?: string }>;
}

const statusOptions: Array<{ label: string; value: OrderStatus | "all" }> = [
  { label: "Todos", value: "all" },
  { label: "Pagados", value: "PAID" },
  { label: "Pendientes", value: "PENDING" },
  { label: "Enviados", value: "SHIPPED" },
];

function parseStatus(value: string | undefined): OrderStatus | "all" {
  if (value === "PENDING" || value === "PAID" || value === "FAILED" || value === "CANCELED" || value === "SHIPPED") {
    return value;
  }
  return "all";
}

function getStatusBadge(status: string) {
  let style: React.CSSProperties = { padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, display: "inline-block", whiteSpace: "nowrap" };
  let label = "Nuevo";

  if (status === "PENDING") {
    style = { ...style, background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
    label = "Pendiente";
  } else if (status === "PAID") {
    style = { ...style, background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
    label = "Pagado";
  } else if (status === "SHIPPED") {
    style = { ...style, background: "#e0e7ff", color: "#3730a3", border: "1px solid #c7d2fe" };
    label = "Enviado";
  } else if (status === "CANCELED") {
    style = { ...style, background: "#f3f4f6", color: "#4b5563", border: "1px solid #e5e7eb" };
    label = "Cancelado";
  } else if (status === "FAILED") {
    style = { ...style, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" };
    label = "Fallido";
  }

  return <span style={style}>{label}</span>;
}

function buildOrdersHref(input: { page: number; status: OrderStatus | "all" }) {
  return `/admin/orders?status=${encodeURIComponent(input.status)}&page=${input.page}`;
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const status = parseStatus(params?.status);
  const page = Number(typeof params?.page === "string" ? params.page : "1");
  const data = await getAdminOrders({
    page: Number.isNaN(page) ? 1 : page,
    status,
  });
  
  const pageStart = data.totalResults > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const pageEnd = Math.min(data.page * data.pageSize, data.totalResults);

  return (
    <section className="panel admin-quotes-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Checkout</p>
          <h1>Pedidos (E-commerce)</h1>
        </div>
      </div>

      <div className="admin-quote-stats">
        <article>
          <FileText size={18} />
          <strong>{data.stats.all}</strong>
          <span>Total</span>
        </article>
        <article>
          <CheckCircle2 size={18} style={{ color: "#16a34a" }} />
          <strong>{data.stats.paid}</strong>
          <span>Pagados</span>
        </article>
        <article>
          <Package size={18} style={{ color: "#4f46e5" }} />
          <strong>{data.stats.shipped}</strong>
          <span>Enviados</span>
        </article>
        <article>
          <Clock3 size={18} style={{ color: "#d97706" }} />
          <strong>{data.stats.pending}</strong>
          <span>Pendientes</span>
        </article>
      </div>

      <p className="results-copy">
        Mostrando {pageStart}–{pageEnd} de {data.totalResults} · página {data.page} de {data.totalPages}.
      </p>

      <div className="trend-periods admin-quote-filters">
        {statusOptions.map((option) => (
          <Link
            className={cn("trend-period-chip", status === option.value && "is-active")}
            href={buildOrdersHref({ page: 1, status: option.value })}
            key={option.value}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {data.orders.length ? (
        <div className="table-wrap">
          <table className="data-table admin-quotes-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Pedido</th>
                <th>Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id}>
                  <td data-label="Fecha">
                    {new Intl.DateTimeFormat("es-PE", { hour12: true, timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}
                  </td>
                  <td data-label="Cliente">
                    <strong>{order.customerName}</strong>
                    <p className="muted">
                      {order.customerPhone}
                      {order.customerEmail ? ` · ${order.customerEmail}` : ""}
                    </p>
                    {order.customerDocumentNumber ? <p className="muted" style={{ fontSize: "11px" }}>{order.customerDocumentType} {order.customerDocumentNumber}</p> : null}
                  </td>
                  <td data-label="Pedido">
                    <strong>{order.orderNumber ?? "N/A"}</strong>
                    <p className="muted">{order.itemCount} unidades</p>
                  </td>
                  <td data-label="Total">
                    <strong>{formatCurrency(Number(order.total), "S/")}</strong>
                  </td>
                  <td data-label="Estado">
                    {getStatusBadge(order.status)}
                  </td>
                  <td data-label="Acciones">
                    <div className="table-actions">
                      <Link className="icon-button" href={`/admin/orders/${order.id}`}>
                        <Eye size={16} />
                        <span>Ver</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <article className="panel panel-slim empty-state">
          <SearchCode size={18} />
          <p className="eyebrow">Sin pedidos</p>
          <h2>No hay registros con este filtro</h2>
        </article>
      )}

      <div className="pagination-row">
        {data.page > 1 ? (
          <Link className="button button-secondary" href={buildOrdersHref({ page: data.page - 1, status })}>
            Página anterior
          </Link>
        ) : <span />}
        {data.page < data.totalPages ? (
          <Link className="button button-secondary" href={buildOrdersHref({ page: data.page + 1, status })}>
            Siguiente página
          </Link>
        ) : null}
      </div>
    </section>
  );
}
