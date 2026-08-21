import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Mail, UserRound, FileText, ShieldAlert } from "lucide-react";
import { ComplaintResponsePanel } from "@/components/admin/complaint-response-panel";
import { getAdminComplaintById } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { addComplaintInternalNoteAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

type AdminComplaintDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(status: string) {
  if (status === "IN_REVIEW") return "En revisión";
  if (status === "RESPONDED") return "Respondido";
  if (status === "CLOSED") return "Cerrado";
  return "Nuevo";
}

function getEmailStatusLabel(value: string | undefined) {
  if (value === "sent") return "Correo enviado correctamente.";
  if (value === "skipped") return "La respuesta se guardó, pero no se envió correo.";
  if (value?.startsWith("error-")) return decodeURIComponent(value.slice("error-".length));
  return null;
}

export default async function AdminComplaintDetailPage({
  params,
  searchParams,
}: AdminComplaintDetailPageProps) {
  const { id } = await params;
  const session = await requireAdmin();
  const query = searchParams ? await searchParams : undefined;
  const complaint = await getAdminComplaintById(id);

  if (!complaint) {
    notFound();
  }

  // Asignación automática al abrir el reclamo por primera vez
  if (!complaint.assignedToEmail || complaint.status === "NEW") {
    const oldStatus = complaint.status;
    const nextStatus = oldStatus === "NEW" ? "IN_REVIEW" : oldStatus;
    const isAutoAssigning = !complaint.assignedToEmail;

    await prisma.complaint.update({
      where: { id },
      data: {
        assignedToEmail: session.email,
        assignedToName: session.name,
        status: nextStatus as any,
      },
    });

    let logMessage = "";
    if (isAutoAssigning && oldStatus === "NEW") {
      logMessage = `El reclamo fue abierto y asignado automáticamente a ${session.name}. El estado cambió a "En revisión".`;
    } else if (isAutoAssigning) {
      logMessage = `El reclamo fue abierto y asignado automáticamente a ${session.name}.`;
    } else if (oldStatus === "NEW") {
      logMessage = `El reclamo fue abierto. El estado cambió a "En revisión".`;
    }

    if (logMessage) {
      const systemNote = await prisma.complaintInternalNote.create({
        data: {
          complaintId: id,
          authorName: "Sistema",
          authorEmail: "sistema@importadora.com",
          content: logMessage,
        },
      });

      // Insertar al inicio de las notas locales
      complaint.internalNotes = [
        {
          id: systemNote.id,
          authorName: systemNote.authorName,
          authorEmail: systemNote.authorEmail,
          content: systemNote.content,
          createdAt: systemNote.createdAt.toISOString(),
        },
        ...(complaint.internalNotes || []),
      ];
    }

    complaint.assignedToEmail = session.email;
    complaint.assignedToName = session.name;
    complaint.status = nextStatus;
  }

  const updated = query?.status === "updated";
  const emailStatus = getEmailStatusLabel(typeof query?.emailStatus === "string" ? query.emailStatus : undefined);

  return (
    <section className="stack-lg">
      <div className="admin-quote-detail-top">
        <Link className="button button-secondary" href="/admin/reclamos">
          <ArrowLeft size={16} />
          Volver
        </Link>
      </div>

      <section className="panel admin-quote-detail-hero">
        <div>
          <p className="eyebrow">Libro de reclamaciones</p>
          <h1>{complaint.claimCode}</h1>
          <p className="muted">
            {formatDate(complaint.createdAt)} · {formatDate(complaint.updatedAt)}
          </p>
        </div>
        <div className="admin-quote-detail-total">
          <span className={`admin-complaint-status is-${complaint.status.toLowerCase()}`}>
            {getStatusLabel(complaint.status)}
          </span>
          <strong>{complaint.kind}</strong>
          <span>{complaint.subject}</span>
        </div>
      </section>

      {updated ? (
        <article className="panel panel-slim empty-state">
          <CalendarClock size={18} />
          <p className="eyebrow">Actualizado</p>
          <h2>El reclamo se guardó correctamente.</h2>
        </article>
      ) : null}

      {emailStatus ? (
        <article className="panel panel-slim empty-state">
          <Mail size={18} />
          <p className="eyebrow">Correo</p>
          <h2>{emailStatus}</h2>
        </article>
      ) : null}

      <div className="admin-quote-detail-grid">
        <section className="panel admin-quote-detail-card">
          <div className="admin-quote-card-title">
            <UserRound size={18} />
            <h2>Cliente</h2>
          </div>
          <dl className="admin-quote-meta-list">
            <div>
              <dt>Nombre</dt>
              <dd>{complaint.customerName}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{complaint.customerEmail ?? "No registrado"}</dd>
            </div>
            <div>
              <dt>WhatsApp</dt>
              <dd>{complaint.customerPhone ?? "No registrado"}</dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>
                {complaint.documentNumber
                  ? `${complaint.documentType ?? "Doc."} ${complaint.documentNumber}`
                  : "No registrado"}
              </dd>
            </div>
            <div>
              <dt>Pedido / comprobante</dt>
              <dd>{complaint.orderNumber ?? "No registrado"}</dd>
            </div>
            <div>
              <dt>Producto</dt>
              <dd>{complaint.productReference ?? "No registrado"}</dd>
            </div>
            <div>
              <dt>Asesor asignado</dt>
              <dd style={{ color: "#2320da", fontWeight: "bold" }}>
                {complaint.assignedToName ? `${complaint.assignedToName} (${complaint.assignedToEmail})` : "No asignado"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel admin-quote-detail-card">
          <div className="admin-quote-card-title">
            <Mail size={18} />
            <h2>Detalle del caso</h2>
          </div>
          <p className="muted admin-complaint-detail-text">{complaint.detail}</p>
        </section>
      </div>

      {/* Bitácora y Notas Internas */}
      <section className="panel admin-quote-detail-card" style={{ width: "100%" }}>
        <div className="admin-quote-card-title">
          <FileText size={18} />
          <h2>Bitácora y Notas Internas</h2>
        </div>
        
        <div className="stack-md" style={{ maxHeight: "250px", overflowY: "auto", margin: "16px 0", paddingRight: "8px" }}>
          {complaint.internalNotes && complaint.internalNotes.length > 0 ? (
            complaint.internalNotes.map((note) => {
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

        <form action={addComplaintInternalNoteAction} className="stack-sm" style={{ borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
          <input type="hidden" name="complaintId" value={complaint.id} />
          <label className="field">
            <span>Agregar anotación de seguimiento</span>
            <textarea
              name="content"
              rows={2}
              placeholder="Ej. El cliente no responde; falta boleta; coordinando envío..."
              required
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", resize: "vertical", fontSize: "13px" }}
            />
          </label>
          <button type="submit" className="button button-secondary" style={{ width: "100%", marginTop: "8px" }}>
            Guardar anotación
          </button>
        </form>
      </section>

      <ComplaintResponsePanel complaint={complaint} />
    </section>
  );
}
