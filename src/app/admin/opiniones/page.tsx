import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  MessageSquareHeart,
  QrCode,
  Star,
  ThumbsUp,
  UserRoundSearch,
} from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ratingMeta: Record<string, { label: string; score: number }> = {
  VERY_GOOD: { label: "Muy buena", score: 5 },
  GOOD: { label: "Buena", score: 4 },
  REGULAR: { label: "Regular", score: 3 },
  BAD: { label: "Mala", score: 1 },
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function getStatusLabel(status: string) {
  if (status === "IN_REVIEW") return "En revisión";
  if (status === "RESPONDED") return "Respondido";
  if (status === "CLOSED") return "Cerrado";
  return "Nuevo";
}

export default async function AdminServiceFeedbackPage() {
  const [feedback, ratingGroups, total, recommendCount, problemCount] = await Promise.all([
    prisma.serviceFeedback.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),
    prisma.serviceFeedback.groupBy({
      by: ["rating"],
      _count: {
        _all: true,
      },
    }),
    prisma.serviceFeedback.count(),
    prisma.serviceFeedback.count({
      where: {
        wouldRecommend: true,
      },
    }),
    prisma.serviceFeedback.count({
      where: {
        hadProblem: true,
      },
    }),
  ]);

  const ratingTotal = ratingGroups.reduce(
    (sum, group) =>
      sum + (ratingMeta[group.rating]?.score ?? 0) * group._count._all,
    0,
  );
  const averageRating = total ? (ratingTotal / total).toFixed(1) : "—";
  const recommendationRate = total ? Math.round((recommendCount / total) * 100) : 0;

  return (
    <section className="panel admin-service-feedback-panel">
      <header className="admin-service-feedback-hero">
        <div>
          <p className="eyebrow">Experiencia en tienda</p>
          <h1>Opiniones de atención</h1>
          <p className="panel-copy">
            Resultados de la encuesta breve disponible mediante el QR del local.
          </p>
        </div>
        <div className="admin-service-feedback-actions">
          <Link className="button button-secondary button-chip" href="/califica-atencion">
            <ArrowUpRight aria-hidden="true" size={16} />
            Ver encuesta
          </Link>
          <Link className="button button-primary button-chip" href="/califica-atencion/qr">
            <QrCode aria-hidden="true" size={16} />
            Abrir QR
          </Link>
        </div>
      </header>

      <div className="admin-service-feedback-stats">
        <article>
          <span className="admin-service-feedback-stat-icon">
            <MessageSquareHeart aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>{total}</strong>
            <p>Respuestas totales</p>
          </div>
        </article>
        <article>
          <span className="admin-service-feedback-stat-icon">
            <Star aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>
              {averageRating}
              <small>/ 5</small>
            </strong>
            <p>Calificación promedio</p>
          </div>
        </article>
        <article>
          <span className="admin-service-feedback-stat-icon">
            <ThumbsUp aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>{recommendationRate}%</strong>
            <p>Nos recomendaría</p>
          </div>
        </article>
        <article className={problemCount > 0 ? "has-alert" : undefined}>
          <span className="admin-service-feedback-stat-icon">
            <AlertTriangle aria-hidden="true" size={19} />
          </span>
          <div>
            <strong>{problemCount}</strong>
            <p>Reportaron un problema</p>
          </div>
        </article>
      </div>

      {feedback.length ? (
        <>
          <p className="results-copy">
            Mostrando las {feedback.length} respuestas más recientes.
          </p>
          <div className="table-wrap">
            <table className="data-table admin-service-feedback-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Calificación</th>
                  <th>Atención</th>
                  <th>Comentario</th>
                  <th>Recomienda</th>
                  <th>Contacto</th>
                  <th>Asesor</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {feedback.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Fecha">{formatDate(entry.createdAt)}</td>
                    <td data-label="Calificación">
                      <span className={`admin-service-rating is-${entry.rating.toLowerCase()}`}>
                        <Star aria-hidden="true" fill="currentColor" size={13} />
                        {ratingMeta[entry.rating]?.label ?? entry.rating}
                      </span>
                    </td>
                    <td data-label="Atención">
                      <strong>{entry.attendedBy ?? "No indicó"}</strong>
                      {entry.hadProblem ? (
                        <p className="admin-service-problem">
                          <AlertTriangle aria-hidden="true" size={13} />
                          {entry.problemDetail ?? "Reportó un problema"}
                        </p>
                      ) : (
                        <p className="muted">Sin problemas</p>
                      )}
                    </td>
                    <td data-label="Comentario">
                      <p className="admin-service-comment">
                        {entry.improvement ?? "Sin comentario"}
                      </p>
                    </td>
                    <td data-label="Recomienda">
                      {entry.wouldRecommend ? "Sí" : "No"}
                    </td>
                    <td data-label="Contacto">
                      {entry.customerContact ?? <span className="muted">Anónimo</span>}
                    </td>
                    <td data-label="Asesor">
                      {entry.assignedToName ? (
                        <strong style={{ fontSize: "13px", color: "#2320da" }}>{entry.assignedToName}</strong>
                      ) : (
                        <span className="muted" style={{ fontStyle: "italic", fontSize: "12px" }}>Sin asignar</span>
                      )}
                    </td>
                    <td data-label="Estado">
                      <span className={`admin-complaint-status is-${entry.status.toLowerCase()}`}>
                        {getStatusLabel(entry.status)}
                      </span>
                    </td>
                    <td data-label="Acciones">
                      <div className="table-actions">
                        <Link className="icon-button" href={`/admin/opiniones/${entry.id}`}>
                          <UserRoundSearch size={16} />
                          <span>Ver</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <article className="panel panel-slim empty-state admin-service-feedback-empty">
          <UserRoundSearch aria-hidden="true" size={22} />
          <p className="eyebrow">Sin respuestas todavía</p>
          <h2>El QR está listo para la primera prueba</h2>
          <p className="panel-copy">
            Abre la hoja del QR, escanéala desde un celular y completa una respuesta.
          </p>
          <Link className="button button-primary button-chip" href="/califica-atencion/qr">
            <QrCode aria-hidden="true" size={16} />
            Probar QR
          </Link>
        </article>
      )}
    </section>
  );
}
