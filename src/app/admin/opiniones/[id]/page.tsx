import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, UserRound, FileText, ShieldAlert, Star, QrCode } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { updateFeedbackStatusAction, addFeedbackInternalNoteAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

type AdminFeedbackDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const ratingMeta: Record<string, { label: string; score: number }> = {
  VERY_GOOD: { label: "Muy buena", score: 5 },
  GOOD: { label: "Buena", score: 4 },
  REGULAR: { label: "Regular", score: 3 },
  BAD: { label: "Mala", score: 1 },
};

function getStatusLabel(status: string) {
  if (status === "IN_REVIEW") return "En revisión";
  if (status === "RESPONDED") return "Respondido";
  if (status === "CLOSED") return "Cerrado";
  return "Nuevo";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AdminFeedbackDetailPage({
  params,
  searchParams,
}: AdminFeedbackDetailPageProps) {
  const { id } = await params;
  const session = await requireAdmin();
  const query = searchParams ? await searchParams : undefined;
  
  const feedback = await prisma.serviceFeedback.findUnique({
    where: { id },
    include: {
      internalNotes: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!feedback) {
    notFound();
  }

  // Asignación automática al abrir el feedback por primera vez
  if (!feedback.assignedToEmail || feedback.status === "NEW") {
    const oldStatus = feedback.status;
    const nextStatus = oldStatus === "NEW" ? "IN_REVIEW" : oldStatus;
    const isAutoAssigning = !feedback.assignedToEmail;

    await prisma.serviceFeedback.update({
      where: { id },
      data: {
        assignedToEmail: session.email,
        assignedToName: session.name,
        status: nextStatus as any,
      },
    });

    let logMessage = "";
    if (isAutoAssigning && oldStatus === "NEW") {
      logMessage = `La opinión fue abierta y asignada automáticamente a ${session.name}. El estado cambió a "En revisión".`;
    } else if (isAutoAssigning) {
      logMessage = `La opinión fue abierta y asignada automáticamente a ${session.name}.`;
    } else if (oldStatus === "NEW") {
      logMessage = `La opinión fue abierta. El estado cambió a "En revisión".`;
    }

    if (logMessage) {
      const systemNote = await prisma.serviceFeedbackInternalNote.create({
        data: {
          serviceFeedbackId: id,
          authorName: "Sistema",
          authorEmail: "sistema@importadora.com",
          content: logMessage,
        },
      });

      feedback.internalNotes = [
        systemNote,
        ...(feedback.internalNotes || []),
      ];
    }

    feedback.assignedToEmail = session.email;
    feedback.assignedToName = session.name;
    feedback.status = nextStatus;
  }

  const updated = query?.status === "updated";

  return (
    <section className="stack-lg">
      <div className="admin-quote-detail-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link className="button button-secondary" href="/admin/opiniones">
            <ArrowLeft size={16} />
            Volver
          </Link>
          <span className={`admin-complaint-status is-${feedback.status.toLowerCase()}`} style={{ margin: 0 }}>
            {getStatusLabel(feedback.status)}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "#64748b" }}>
          ID: <strong>{feedback.id}</strong>
        </div>
      </div>

      <div className="panel" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span className={`admin-service-rating is-${feedback.rating.toLowerCase()}`} style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Star aria-hidden="true" fill="currentColor" size={11} />
              {ratingMeta[feedback.rating]?.label ?? feedback.rating}
            </span>
            <span style={{ color: "#cbd5e1" }}>•</span>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#475569" }}>
              Opinión de atención
            </span>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0 0 0", color: "#0f172a" }}>
            {feedback.customerContact ?? "Cliente Anónimo"}
          </h1>
        </div>
        
        <div style={{ textAlign: "right", fontSize: "12px", color: "#64748b" }}>
          <div><strong>Registrado:</strong> {formatDate(feedback.createdAt)}</div>
        </div>
      </div>

      {updated ? (
        <article className="panel panel-slim empty-state">
          <QrCode size={18} />
          <p className="eyebrow">Actualizado</p>
          <h2>La opinión se guardó correctamente.</h2>
        </article>
      ) : null}

      <div className="admin-quote-detail-grid">
        <section className="panel admin-quote-detail-card">
          <div className="admin-quote-card-title">
            <UserRound size={18} />
            <h2>Detalle de la encuesta</h2>
          </div>
          <dl className="admin-quote-meta-list">
            <div>
              <dt>Calificación</dt>
              <dd>{ratingMeta[feedback.rating]?.label ?? feedback.rating}</dd>
            </div>
            <div>
              <dt>Atendido por</dt>
              <dd>{feedback.attendedBy ?? "No especificado"}</dd>
            </div>
            <div>
              <dt>¿Reportó un problema?</dt>
              <dd style={{ color: feedback.hadProblem ? "#b91c1c" : "#15803d", fontWeight: "bold" }}>
                {feedback.hadProblem ? "Sí" : "No"}
              </dd>
            </div>
            {feedback.hadProblem && (
              <div>
                <dt>Detalle del problema</dt>
                <dd style={{ color: "#b91c1c" }}>{feedback.problemDetail ?? "Sin detalles"}</dd>
              </div>
            )}
            <div>
              <dt>¿Nos recomendaría?</dt>
              <dd>{feedback.wouldRecommend ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Contacto cliente</dt>
              <dd>{feedback.customerContact ?? "Anónimo"}</dd>
            </div>
            <div>
              <dt>Asesor asignado</dt>
              <dd style={{ color: "#2320da", fontWeight: "bold" }}>
                {feedback.assignedToName ? `${feedback.assignedToName} (${feedback.assignedToEmail})` : "No asignado"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel admin-quote-detail-card">
          <div className="admin-quote-card-title">
            <Mail size={18} />
            <h2>Comentario / Propuesta de mejora</h2>
          </div>
          <p className="muted admin-complaint-detail-text" style={{ fontSize: "14px", lineHeight: "1.6", color: "#334155" }}>
            {feedback.improvement ?? "El cliente no dejó comentarios de mejora."}
          </p>
        </section>
      </div>

      <div className="admin-quote-detail-grid">
        {/* Flujo de atención manual */}
        <section className="panel admin-quote-detail-card">
          <div className="admin-quote-card-title">
            <ShieldAlert size={18} />
            <h2>Flujo de atención</h2>
          </div>
          <form action={updateFeedbackStatusAction} className="stack-sm" style={{ marginTop: "12px" }}>
            <input type="hidden" name="feedbackId" value={feedback.id} />
            <label className="field">
              <span>Estado de la gestión</span>
              <select name="status" defaultValue={feedback.status} className="select" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}>
                <option value="NEW">Nuevo</option>
                <option value="IN_REVIEW">En revisión</option>
                <option value="RESPONDED">Respondido</option>
                <option value="CLOSED">Cerrado</option>
              </select>
            </label>
            <button type="submit" className="button button-primary" style={{ width: "100%", marginTop: "8px" }}>
              Actualizar estado
            </button>
          </form>
        </section>

        {/* Bitácora y Notas Internas */}
        <section className="panel admin-quote-detail-card">
          <div className="admin-quote-card-title">
            <FileText size={18} />
            <h2>Bitácora y Notas Internas</h2>
          </div>
          
          <div className="stack-md" style={{ maxHeight: "220px", overflowY: "auto", margin: "16px 0", paddingRight: "8px" }}>
            {feedback.internalNotes && feedback.internalNotes.length > 0 ? (
              feedback.internalNotes.map((note) => {
                const isSystem = note.authorName === "Sistema";
                return (
                  <div key={note.id} style={{ 
                    backgroundColor: isSystem ? "#f1f5f9" : "#f8fafc", 
                    padding: "12px 16px", 
                    borderRadius: "8px", 
                    borderLeft: isSystem ? "4px solid #94a3b8" : "4px solid #2320da", 
                    marginBottom: "8px" 
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
                      <strong>{note.authorName} {isSystem ? "" : `(${note.authorEmail})`}</strong>
                      <span>{formatDate(note.createdAt)}</span>
                    </div>
                    <p style={{ 
                      margin: 0, 
                      fontSize: "13px", 
                      color: isSystem ? "#475569" : "#1e293b", 
                      fontStyle: isSystem ? "italic" : "normal", 
                      whiteSpace: "pre-wrap" 
                    }}>
                      {note.content}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="muted" style={{ fontSize: "13px", fontStyle: "italic", margin: "10px 0" }}>
                No hay anotaciones registradas.
              </p>
            )}
          </div>

          <form action={addFeedbackInternalNoteAction} className="stack-sm" style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
            <input type="hidden" name="feedbackId" value={feedback.id} />
            <label className="field">
              <span>Agregar anotación de seguimiento</span>
              <textarea
                name="content"
                rows={2}
                placeholder="Ej. Se llamó al cliente para agradecer y coordinar mejora..."
                required
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", resize: "vertical", fontSize: "13px" }}
              />
            </label>
            <button type="submit" className="button button-secondary" style={{ width: "100%", marginTop: "8px" }}>
              Guardar anotación
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
