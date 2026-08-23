import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, ExternalLink, FileText, MessageCircle, UserRound } from "lucide-react";
import { getAdminQuoteById } from "@/lib/store";
import type { AdminQuoteDetailView, AdminQuoteStatusStepView } from "@/lib/store";
import { buildWhatsappHrefFromPhone, formatCurrency } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QuoteStatusNotesEditor } from "@/components/admin/quote-status-notes-editor";
import { QuoteCustomerMessage } from "@/components/admin/quote-customer-message";

export const dynamic = "force-dynamic";

type AdminQuoteDetailPageProps = {
  params: Promise<{ id: string }>;
};

function getStatusLabel(status: AdminQuoteDetailView["status"]) {
  if (status === "ERP_REGISTERED") return "Registrada ERP";
  if (status === "ERROR") return "Con error";
  if (status === "IN_REVIEW") return "En revisión";
  if (status === "RESPONDED") return "Respondido";
  if (status === "CLOSED") return "Cerrado";
  return "Nuevo";
}

function getStatusClass(status: AdminQuoteDetailView["status"]) {
  if (status === "PENDING") return "is-pending";
  if (status === "IN_REVIEW") return "is-warning";
  if (status === "RESPONDED") return "is-info";
  if (status === "CLOSED") return "is-positive";
  if (status === "ERP_REGISTERED") return "is-positive";
  if (status === "ERROR") return "is-negative";
  return "is-pending";
}

function getCustomerModeLabel(value: string | null) {
  if (value === "created") return "Cliente creado ERP";
  if (value === "existing") return "Cliente existente ERP";
  if (value === "default") return "Cliente genérico ERP";
  return "Sin estado ERP";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getTimeline(quote: AdminQuoteDetailView): AdminQuoteStatusStepView[] {
  if (quote.statusSteps.length) {
    return quote.statusSteps;
  }

  if (quote.status === "ERROR") {
    return [
      {
        status: "error",
        text: quote.errorMessage ?? "La cotización no pudo registrarse en el ERP.",
      },
    ];
  }

  if (quote.status === "ERP_REGISTERED") {
    return [{ status: "success", text: "Cotización registrada correctamente en el ERP." }];
  }

  return [{ status: "warning", text: "Cotización guardada localmente y pendiente de ERP." }];
}

export default async function AdminQuoteDetailPage({ params }: AdminQuoteDetailPageProps) {
  const { id } = await params;
  const quote = await getAdminQuoteById(id);

  if (!quote) {
    notFound();
  }

  const session = await getSession();
  if (!quote.assignedToEmail && session) {
    await prisma.quote.update({
      where: { id },
      data: {
        assignedToName: session.name,
        assignedToEmail: session.email,
      },
    });
    quote.assignedToName = session.name;
    quote.assignedToEmail = session.email;
  }

  const timeline = getTimeline(quote);

  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") || "http";
  const baseUrl = `${protocol}://${host}`;
  const pdfLink = quote.pdfUrl ? `${baseUrl}${quote.pdfUrl}` : "";

  const customerWhatsappHref = buildWhatsappHrefFromPhone(
    quote.customerPhone,
    quote.quoteNumber
      ? `Hola ${quote.customerName}, te contacto por tu cotización ${quote.quoteNumber}.${pdfLink ? ` Puedes ver el PDF oficial aquí: ${pdfLink}` : ""}`
      : `Hola ${quote.customerName}, te contacto por tu cotización.${pdfLink ? ` Puedes ver el PDF oficial aquí: ${pdfLink}` : ""}`,
  );

  return (
    <section className="admin-quote-detail">
      <div className="admin-quote-detail-top" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <Link className="button button-secondary" href="/admin/quotes">
          <ArrowLeft size={16} />
          Volver
        </Link>
        {quote.pdfUrl ? (
          <a
            className="button button-secondary"
            href={quote.pdfUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <FileText size={16} />
            Ver PDF ERP
          </a>
        ) : null}
        {customerWhatsappHref ? (
          <a
            className="button button-primary"
            href={customerWhatsappHref}
            rel="noreferrer"
            target="_blank"
          >
            <MessageCircle size={16} />
            Contactar cliente
          </a>
        ) : null}
      </div>

      <section className="panel admin-quote-detail-hero">
        <div>
          <p className="eyebrow">Cotización</p>
          <h1>{quote.quoteNumber ?? "Sin número ERP"}</h1>
          <p className="muted">
            {formatDate(quote.createdAt)} · {formatDate(quote.updatedAt)}
          </p>
        </div>
        <div className="admin-quote-detail-total">
          <span className={`admin-quote-status ${getStatusClass(quote.status)}`}>
            {getStatusLabel(quote.status)}
          </span>
          <strong>{formatCurrency(quote.total, quote.currencySymbol)}</strong>
          <span>{quote.itemCount} unidades cotizadas</span>
        </div>
      </section>

      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "start" }}>
        
        {/* Left Side: Cards and Products */}
        <div style={{ flex: "1 1 500px", display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div className="admin-quote-detail-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
            <section className="panel admin-quote-detail-card">
              <div className="admin-quote-card-title">
                <UserRound size={18} />
                <h2>Cliente</h2>
              </div>
              <dl className="admin-quote-meta-list">
                <div>
                  <dt>Nombre</dt>
                  <dd>{quote.customerName}</dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{quote.customerPhone}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{quote.customerEmail ?? "No registrado"}</dd>
                </div>
                <div>
                  <dt>Documento</dt>
                  <dd>
                    {quote.customerDocumentNumber
                      ? `${quote.customerDocumentType ?? "Doc."} ${quote.customerDocumentNumber}`
                      : "No registrado"}
                  </dd>
                </div>
                <div>
                  <dt>Dirección</dt>
                  <dd>{quote.customerAddress ?? "No registrada"}</dd>
                </div>
                <div>
                  <dt>Cuenta</dt>
                  <dd>{quote.user ? `${quote.user.name} · ${quote.user.email}` : "Compra invitada"}</dd>
                </div>
              </dl>
            </section>

            <section className="panel admin-quote-detail-card">
              <div className="admin-quote-card-title">
                <FileText size={18} />
                <h2>ERP y seguimiento</h2>
              </div>
              <dl className="admin-quote-meta-list">
                <div>
                  <dt>Cliente ERP</dt>
                  <dd>{getCustomerModeLabel(quote.erpCustomerMode)}</dd>
                </div>
                <div>
                  <dt>ID cliente ERP</dt>
                  <dd>{quote.erpCustomerId ?? "No registrado"}</dd>
                </div>
                <div>
                  <dt>ID externo</dt>
                  <dd>{quote.erpExternalId ?? "No registrado"}</dd>
                </div>
                <div>
                  <dt>PDF interno</dt>
                  <dd>
                    {quote.pdfNotification
                      ? quote.pdfNotification.message
                      : "Sin notificación registrada"}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="panel admin-quote-detail-card">
            <div className="admin-quote-card-title">
              <FileText size={18} />
              <h2>Productos cotizados</h2>
            </div>
            <div className="table-wrap">
              <table className="data-table admin-quote-detail-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Código</th>
                    <th>Precio</th>
                    <th>Cantidad</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => (
                    <tr key={`${quote.id}-${item.code}`}>
                      <td data-label="Producto">
                        <strong>{item.name}</strong>
                      </td>
                      <td data-label="Código">
                        {item.code}
                      </td>
                      <td data-label="Precio">{formatCurrency(item.unitPrice, quote.currencySymbol)}</td>
                      <td data-label="Cantidad">{item.quantity}</td>
                      <td data-label="Total">
                        <strong>{formatCurrency(item.total, quote.currencySymbol)}</strong>
                      </td>
                      <td data-label="Acciones">
                        {item.productId ? (
                          <Link className="icon-button" href={`/admin/products/${item.productId}`}>
                            <ExternalLink size={16} />
                            <span>Producto</span>
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Timeline and error notifications */}
          {(quote.errorMessage || timeline.length > 0) && (
            <div className="admin-quote-detail-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
              {quote.errorMessage && (
                <section className="panel admin-quote-detail-card" style={{ borderLeft: "4px solid #ef4444" }}>
                  <div className="admin-quote-card-title">
                    <FileText size={18} style={{ color: "#ef4444" }} />
                    <h2 style={{ color: "#ef4444" }}>Errores de Sincronización</h2>
                  </div>
                  <p style={{ color: "#b91c1c", fontSize: "13px", lineHeight: "1.5", marginTop: "8px" }}>
                    {quote.errorMessage}
                  </p>
                </section>
              )}

              <section className="panel admin-quote-detail-card">
                <div className="admin-quote-card-title">
                  <FileText size={18} />
                  <h2>Bitácora de Integración</h2>
                </div>
                <ol className="admin-quote-timeline" style={{ marginTop: "12px" }}>
                  {timeline.map((step, index) => (
                    <li className={`is-${step.status}`} key={`${step.status}-${index}`}>
                      <span />
                      <p>{step.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}




        </div>

        {/* Right Side: Status and notes interactive sidebar */}
        <div style={{ flex: "1 1 320px", maxWidth: "420px", position: "sticky", top: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {quote.note && (
            <QuoteCustomerMessage
              customerName={quote.customerName}
              customerPhone={quote.customerPhone ?? ""}
              customerMessage={quote.note}
              pdfLink={pdfLink}
              quoteNumber={quote.quoteNumber}
            />
          )}
          <QuoteStatusNotesEditor
            quoteId={quote.id}
            initialStatus={quote.status}
            initialAdminNotes={quote.adminNotes}
            assignedToName={quote.assignedToName}
            assignedToEmail={quote.assignedToEmail}
          />
        </div>

      </div>
    </section>
  );
}
