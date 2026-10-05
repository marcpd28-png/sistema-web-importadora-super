import Link from "next/link";
import type { QuoteStatus } from "@prisma/client";
import { AlertCircle, CheckCircle2, Clock3, Eye, FileText, SearchCode } from "lucide-react";
import { getAdminQuotes } from "@/lib/store";
import { DeleteRecordButton } from "@/components/admin/delete-record-button";
import { deleteQuoteAction } from "@/app/admin/delete-actions";
import { getSession } from "@/lib/auth";
import { cn, formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AdminQuotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions: Array<{
  label: string;
  value: QuoteStatus | "all";
}> = [
  { label: "Todas", value: "all" },
  { label: "Nuevo", value: "PENDING" },
  { label: "En revisión", value: "IN_REVIEW" },
  { label: "Respondido", value: "RESPONDED" },
  { label: "Cerrado", value: "CLOSED" },
  { label: "Registradas ERP", value: "ERP_REGISTERED" },
  { label: "Con error", value: "ERROR" },
];

function parseStatus(value: string | string[] | undefined): QuoteStatus | "all" {
  if (
    value === "PENDING" ||
    value === "IN_REVIEW" ||
    value === "RESPONDED" ||
    value === "CLOSED" ||
    value === "ERP_REGISTERED" ||
    value === "ERROR"
  ) {
    return value;
  }

  return "all";
}

function getStatusBadge(status: string) {
  let style: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 600,
    display: "inline-block",
    whiteSpace: "nowrap"
  };
  let label = "Nuevo";

  if (status === "PENDING") {
    style = { ...style, background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
    label = "Nuevo";
  } else if (status === "IN_REVIEW") {
    style = { ...style, background: "#e0e7ff", color: "#3730a3", border: "1px solid #c7d2fe" };
    label = "En revisión";
  } else if (status === "RESPONDED") {
    style = { ...style, background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
    label = "Respondido";
  } else if (status === "CLOSED") {
    style = { ...style, background: "#f3f4f6", color: "#4b5563", border: "1px solid #e5e7eb" };
    label = "Cerrado";
  } else if (status === "ERP_REGISTERED") {
    style = { ...style, background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" };
    label = "Registrada ERP";
  } else if (status === "ERROR") {
    style = { ...style, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" };
    label = "Con error";
  }

  return <span style={style}>{label}</span>;
}

function getCustomerModeLabel(value: string | null) {
  if (value === "created") return "Cliente creado ERP";
  if (value === "existing") return "Cliente existente ERP";
  if (value === "default") return "Cliente genérico ERP";
  return "Sin estado ERP";
}

function buildQuotesHref(input: { page: number; status: QuoteStatus | "all" }) {
  return `/admin/quotes?status=${encodeURIComponent(input.status)}&page=${input.page}`;
}

export default async function AdminQuotesPage({ searchParams }: AdminQuotesPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const status = parseStatus(params?.status);
  const page = Number(typeof params?.page === "string" ? params.page : "1");
  const data = await getAdminQuotes({
    page: Number.isNaN(page) ? 1 : page,
    status,
  });
  const pageStart = data.totalResults > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const pageEnd = Math.min(data.page * data.pageSize, data.totalResults);
  const session = await getSession();

  return (
    <section className="panel admin-quotes-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Cotizaciones</p>
          <h1>Seguimiento comercial</h1>
        </div>
      </div>

      <div className="admin-quote-stats">
        <article>
          <FileText size={18} />
          <strong>{data.stats.all}</strong>
          <span>Total</span>
        </article>
        <article>
          <CheckCircle2 size={18} />
          <strong>{data.stats.registered}</strong>
          <span>Registradas ERP</span>
        </article>
        <article>
          <Clock3 size={18} />
          <strong>{data.stats.pending}</strong>
          <span>Procesando</span>
        </article>
        <article>
          <AlertCircle size={18} />
          <strong>{data.stats.error}</strong>
          <span>Con error</span>
        </article>
      </div>

      <p className="results-copy">
        Mostrando {pageStart}–{pageEnd} de {data.totalResults} · página {data.page} de {data.totalPages}.
      </p>

      <div className="trend-periods admin-quote-filters">
        {statusOptions.map((option) => (
          <Link
            className={cn("trend-period-chip", status === option.value && "is-active")}
            href={buildQuotesHref({ page: 1, status: option.value })}
            key={option.value}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {data.quotes.length ? (
        <div className="table-wrap">
          <table className="data-table admin-quotes-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Cotización</th>
                <th>Productos</th>
                <th>Total</th>
                <th>Asesor</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.quotes.map((quote) => (
                <tr key={quote.id}>
                  <td data-label="Fecha">
                    {new Intl.DateTimeFormat("es-PE", {
                      hour12: true,
                      timeZone: "America/Lima",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(quote.createdAt))}
                  </td>
                  <td data-label="Cliente">
                    <strong>{quote.customerName}</strong>
                    <p className="muted">
                      {quote.customerPhone}
                      {quote.customerEmail ? ` · ${quote.customerEmail}` : ""}
                    </p>
                    {quote.user ? <p className="muted">Cuenta: {quote.user.email}</p> : null}
                  </td>
                  <td data-label="Cotización">
                    <strong>{quote.quoteNumber ?? "Sin número ERP"}</strong>
                    <p className="muted">{getCustomerModeLabel(quote.erpCustomerMode)}</p>
                  </td>
                  <td data-label="Productos">
                    <div className="admin-quote-items">
                      {quote.items.map((item) => (
                        <span key={`${quote.id}-${item.code}`}>
                          {item.quantity} x {item.name}
                        </span>
                      ))}
                      {quote.itemCount > quote.items.length ? (
                        <span className="muted">
                          y {quote.itemCount - quote.items.length} más
                        </span>
                      ) : null}
                    </div>
                    <p className="muted">{quote.itemCount} unidades en total</p>
                  </td>
                  <td data-label="Total">
                    <strong>{formatCurrency(quote.total, quote.currencySymbol)}</strong>
                  </td>
                  <td data-label="Asesor">
                    {quote.assignedToName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#e0e7ff", color: "#3730a3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "bold" }}>
                          {quote.assignedToName.charAt(0).toUpperCase()}
                        </div>
                        <strong style={{ fontSize: "13px", color: "#111827" }}>{quote.assignedToName}</strong>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", opacity: 0.6 }}>
                        <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: "14px" }}>👤</span>
                        </div>
                        <span style={{ fontStyle: "italic", fontSize: "12px", color: "#6b7280" }}>Sin asignar</span>
                      </div>
                    )}
                  </td>
                  <td data-label="Estado">
                    {getStatusBadge(quote.status)}
                  </td>
                  <td data-label="Acciones">
                    <div className="table-actions">
                      <DeleteRecordButton recordId={quote.id} recordType="quote" userEmail={session?.email ?? ""} onDelete={deleteQuoteAction} />
                      <Link className="icon-button" href={`/admin/quotes/${quote.id}`}>
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
          <p className="eyebrow">Sin cotizaciones</p>
          <h2>No hay registros con este filtro</h2>
        </article>
      )}

      <div className="pagination-row">
        {data.page > 1 ? (
          <Link
            className="button button-secondary"
            href={buildQuotesHref({ page: data.page - 1, status })}
          >
            Página anterior
          </Link>
        ) : (
          <span />
        )}

        {data.page < data.totalPages ? (
          <Link
            className="button button-secondary"
            href={buildQuotesHref({ page: data.page + 1, status })}
          >
            Siguiente página
          </Link>
        ) : null}
      </div>
    </section>
  );
}
