import Link from "next/link";
import type { ComplaintStatus } from "@prisma/client";
import { ArrowRight, FileText, MessageCircle, SearchCode, ShieldAlert } from "lucide-react";
import { getAdminComplaints } from "@/lib/store";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AdminComplaintsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions: Array<{
  label: string;
  value: ComplaintStatus | "all";
}> = [
  { label: "Todas", value: "all" },
  { label: "Nuevas", value: "NEW" },
  { label: "En revisión", value: "IN_REVIEW" },
  { label: "Respondidas", value: "RESPONDED" },
  { label: "Cerradas", value: "CLOSED" },
];

function parseStatus(value: string | string[] | undefined): ComplaintStatus | "all" {
  if (value === "NEW" || value === "IN_REVIEW" || value === "RESPONDED" || value === "CLOSED") {
    return value;
  }

  return "all";
}

function buildComplaintsHref(input: { page: number; status: ComplaintStatus | "all" }) {
  return `/admin/reclamos?status=${encodeURIComponent(input.status)}&page=${input.page}`;
}

function getStatusLabel(status: ComplaintStatus) {
  if (status === "IN_REVIEW") return "En revisión";
  if (status === "RESPONDED") return "Respondido";
  if (status === "CLOSED") return "Cerrado";
  return "Nuevo";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getHealthTone(openCount: number, respondedCount: number) {
  if (openCount === 0 && respondedCount > 0) {
    return "is-positive";
  }

  if (openCount > 0 && respondedCount > 0) {
    return "is-warning";
  }

  return "is-neutral";
}

export default async function AdminComplaintsPage({ searchParams }: AdminComplaintsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const status = parseStatus(params?.status);
  const page = Number(typeof params?.page === "string" ? params.page : "1");
  const data = await getAdminComplaints({
    page: Number.isNaN(page) ? 1 : page,
    status,
  });
  const pageStart = data.totalResults > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const pageEnd = Math.min(data.page * data.pageSize, data.totalResults);
  const openCount = data.stats.new + data.stats.inReview;
  const respondedCount = data.stats.responded + data.stats.closed;
  const responseRate = data.stats.all ? Math.round((respondedCount / data.stats.all) * 100) : 0;
  const healthTone = getHealthTone(openCount, respondedCount);
  const selectedFilterLabel = statusOptions.find((option) => option.value === status)?.label ?? "Todas";

  return (
    <section className="panel admin-quotes-panel admin-complaints-panel">
      <section className="admin-complaints-hero">
        <div className="admin-complaints-copy">
          <p className="eyebrow">Atención</p>
          <h1>Libro de reclamaciones</h1>
          <p className="panel-copy">
            Seguimiento operativo de reclamos, respuestas y cierres con una lectura clara del estado
            comercial y de atención.
          </p>
          <div className="admin-complaints-actions">
            <Link className="button button-secondary button-chip" href="/libro-reclamaciones">
              <ArrowRight size={16} />
              Ver formulario público
            </Link>
            <Link className="button button-ghost button-chip" href={buildComplaintsHref({ page: 1, status: "NEW" })}>
              <ShieldAlert size={16} />
              Nuevos reclamos
            </Link>
          </div>
        </div>

        <div className={cn("admin-complaints-health", healthTone)}>
          <span>Salud operativa</span>
          <strong>
            {openCount === 0 ? "Sin pendientes" : `${openCount} abiertos`}
          </strong>
          <p>{responseRate}% de los reclamos ya tienen un cierre o respuesta registrada.</p>
        </div>
      </section>

      <div className="admin-complaints-stats">
        <article>
          <ShieldAlert size={18} />
          <strong>{data.stats.all}</strong>
          <span>Total</span>
        </article>
        <article>
          <FileText size={18} />
          <strong>{data.stats.new}</strong>
          <span>Nuevos</span>
        </article>
        <article>
          <SearchCode size={18} />
          <strong>{data.stats.inReview}</strong>
          <span>En revisión</span>
        </article>
        <article>
          <MessageCircle size={18} />
          <strong>{data.stats.responded}</strong>
          <span>Respondidos</span>
        </article>
        <article>
          <span className="admin-complaint-kpi-number">{data.stats.closed}</span>
          <span>Cerrados</span>
        </article>
        <article>
          <span className="admin-complaint-kpi-number">{responseRate}%</span>
          <span>Tasa de respuesta</span>
        </article>
      </div>

      <div className="admin-complaints-summary-row">
        <article>
          <span>Filtro activo</span>
          <strong>{selectedFilterLabel}</strong>
        </article>
        <article>
          <span>Ventana actual</span>
          <strong>
            {pageStart}–{pageEnd} de {data.totalResults}
          </strong>
        </article>
        <article>
          <span>Estado dominante</span>
          <strong>{openCount > 0 ? "Requiere atención" : "Estable"}</strong>
        </article>
      </div>

      <p className="results-copy">
        Mostrando {pageStart}–{pageEnd} de {data.totalResults} · página {data.page} de {data.totalPages}.
      </p>

      <div className="trend-periods admin-quote-filters">
        {statusOptions.map((option) => (
          <Link
            className={cn("trend-period-chip", status === option.value && "is-active")}
            href={buildComplaintsHref({ page: 1, status: option.value })}
            key={option.value}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {data.complaints.length ? (
        <div className="table-wrap">
          <table className="data-table admin-quotes-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Caso</th>
                <th>Contacto</th>
                <th>Asesor</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.complaints.map((complaint) => (
                <tr key={complaint.id}>
                  <td data-label="Fecha">{formatDate(complaint.createdAt)}</td>
                  <td data-label="Cliente">
                    <strong>{complaint.customerName}</strong>
                    <p className="muted">{complaint.claimCode}</p>
                  </td>
                  <td data-label="Caso">
                    <strong>{complaint.subject}</strong>
                    <p className="muted">{complaint.kind}</p>
                  </td>
                  <td data-label="Contacto">
                    <p className="muted">{complaint.customerEmail ?? "Sin correo"}</p>
                    <p className="muted">{complaint.customerPhone ?? "Sin WhatsApp"}</p>
                    {complaint.responseChannel ? (
                      <p className="muted">Respuesta: {complaint.responseChannel}</p>
                    ) : null}
                  </td>
                  <td data-label="Asesor">
                    {complaint.assignedToName ? (
                      <strong style={{ fontSize: "13px", color: "#2320da" }}>{complaint.assignedToName}</strong>
                    ) : (
                      <span className="muted" style={{ fontStyle: "italic", fontSize: "12px" }}>Sin asignar</span>
                    )}
                  </td>
                  <td data-label="Estado">
                    <span className={`admin-complaint-status is-${complaint.status.toLowerCase()}`}>
                      {getStatusLabel(complaint.status)}
                    </span>
                  </td>
                  <td data-label="Acciones">
                    <div className="table-actions">
                      <Link className="icon-button" href={`/admin/reclamos/${complaint.id}`}>
                        <SearchCode size={16} />
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
        <article className="panel panel-slim empty-state admin-complaints-empty">
          <SearchCode size={18} />
          <p className="eyebrow">Sin reclamos</p>
          <h2>No hay registros con este filtro</h2>
          <p className="panel-copy">
            Cambia de filtro o revisa el formulario público para validar el flujo completo.
          </p>
          <div className="admin-complaints-empty-actions">
            <Link className="button button-secondary button-chip" href="/libro-reclamaciones">
              <ArrowRight size={16} />
              Abrir formulario
            </Link>
            <Link className="button button-ghost button-chip" href={buildComplaintsHref({ page: 1, status: "all" })}>
              Ver todos
            </Link>
          </div>
        </article>
      )}

      <div className="pagination-row">
        {data.page > 1 ? (
          <Link
            className="button button-secondary"
            href={buildComplaintsHref({ page: data.page - 1, status })}
          >
            Página anterior
          </Link>
        ) : (
          <span />
        )}

        {data.page < data.totalPages ? (
          <Link
            className="button button-secondary"
            href={buildComplaintsHref({ page: data.page + 1, status })}
          >
            Siguiente página
          </Link>
        ) : null}
      </div>
    </section>
  );
}
