"use client";

import { useMemo, useState } from "react";
import { Mail, MessageCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import type { AdminComplaintDetailView } from "@/lib/store";
import {
  buildComplaintEmailHref,
  buildComplaintResponseText,
  buildComplaintWhatsappHref,
} from "@/lib/complaints";
import { updateComplaintAction } from "@/app/admin/actions";

type ComplaintResponsePanelProps = {
  complaint: AdminComplaintDetailView;
};

const statusOptions = [
  { label: "Nuevo", value: "NEW" },
  { label: "En revisión", value: "IN_REVIEW" },
  { label: "Respondido", value: "RESPONDED" },
  { label: "Cerrado", value: "CLOSED" },
] as const;

const channelOptions = [
  { label: "Interno", value: "INTERNAL" },
  { label: "Correo", value: "EMAIL" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "Ambos", value: "BOTH" },
] as const;

export function ComplaintResponsePanel({ complaint }: ComplaintResponsePanelProps) {
  const [responseText, setResponseText] = useState(complaint.responseText ?? "");
  const [status, setStatus] = useState(complaint.status);
  const [responseChannel, setResponseChannel] = useState(complaint.responseChannel ?? "EMAIL");

  const replyText = useMemo(
    () =>
      responseText.trim()
        ? buildComplaintResponseText({
            sheetNumber: complaint.claimCode,
            customerName: complaint.customerName,
            type: complaint.kind,
            reason: complaint.subject,
            responseText,
          })
        : "",
    [complaint.claimCode, complaint.customerName, complaint.kind, complaint.subject, responseText],
  );

  const emailHref = useMemo(
    () =>
      responseText.trim()
        ? buildComplaintEmailHref(
            {
              sheetNumber: complaint.claimCode,
              customerEmail: complaint.customerEmail,
              customerName: complaint.customerName,
              customerPhone: complaint.customerPhone,
            },
            responseText,
            complaint.kind,
            complaint.subject,
          )
        : null,
    [complaint, responseText],
  );

  const whatsappHref = useMemo(
    () =>
      responseText.trim()
        ? buildComplaintWhatsappHref(
            {
              sheetNumber: complaint.claimCode,
              customerEmail: complaint.customerEmail,
              customerName: complaint.customerName,
              customerPhone: complaint.customerPhone,
            },
            responseText,
            complaint.kind,
            complaint.subject,
          )
        : null,
    [complaint, responseText],
  );

  return (
    <div className="complaint-response-grid">
      <section className="panel complaint-response-card">
        <div className="admin-quote-card-title">
          <Save size={18} />
          <h2>Responder reclamo</h2>
        </div>

        <form action={updateComplaintAction} className="stack-lg">
          <input name="complaintId" type="hidden" value={complaint.id} />
          <input name="claimCode" type="hidden" value={complaint.claimCode} />
          <input name="customerName" type="hidden" value={complaint.customerName} />
          <input name="subject" type="hidden" value={complaint.subject} />

          <div className="complaint-response-grid-fields">
            <label className="field">
              <span>Estado</span>
              <select name="status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Canal de respuesta</span>
              <select
                name="responseChannel"
                value={responseChannel}
                onChange={(event) => setResponseChannel(event.target.value)}
              >
                {channelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field field-wide">
            <span>Respuesta</span>
            <textarea
              name="responseText"
              onChange={(event) => setResponseText(event.target.value)}
              placeholder="Escribe aquí la respuesta para el cliente"
              rows={8}
              value={responseText}
            />
          </label>

          <div className="complaint-response-actions">
            <button className="button button-primary" type="submit">
              <ShieldCheck size={16} />
              Guardar respuesta
            </button>

            {emailHref ? (
              <a className="button button-secondary" href={emailHref} rel="noreferrer" target="_blank">
                <Mail size={16} />
                Responder por correo
              </a>
            ) : null}

            {whatsappHref ? (
              <a className="button button-secondary" href={whatsappHref} rel="noreferrer" target="_blank">
                <MessageCircle size={16} />
                Responder por WhatsApp
              </a>
            ) : null}
          </div>
        </form>
      </section>

      <section className="panel complaint-response-card">
        <div className="admin-quote-card-title">
          <UserRound size={18} />
          <h2>Vista previa del mensaje</h2>
        </div>
        <div className="complaint-response-preview">
          <p className="muted">
            {replyText || "Escribe una respuesta para generar el correo o mensaje de WhatsApp."}
          </p>
        </div>
        <dl className="admin-quote-meta-list complaint-response-meta">
          <div>
            <dt>Correo</dt>
            <dd>{complaint.customerEmail ?? "No registrado"}</dd>
          </div>
          <div>
            <dt>WhatsApp</dt>
            <dd>{complaint.customerPhone ?? "No registrado"}</dd>
          </div>
          <div>
            <dt>Último estado</dt>
            <dd>{status}</dd>
          </div>
          <div>
            <dt>Canal</dt>
            <dd>{responseChannel}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
