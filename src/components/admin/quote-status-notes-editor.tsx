"use client";

import { useState } from "react";
import { QuoteStatus } from "@prisma/client";
import { MessageSquare, User, Save } from "lucide-react";

type QuoteStatusNotesEditorProps = {
  quoteId: string;
  initialStatus: QuoteStatus;
  initialAdminNotes: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
};

const statusMeta: Record<QuoteStatus, { label: string; className: string }> = {
  PENDING: { label: "Nuevo", className: "is-new" },
  IN_REVIEW: { label: "En revisión", className: "is-in_review" },
  RESPONDED: { label: "Respondido", className: "is-responded" },
  CLOSED: { label: "Cerrado", className: "is-closed" },
  ERP_REGISTERED: { label: "Registrada ERP", className: "is-responded" },
  ERROR: { label: "Con error", className: "is-error" },
};

export function QuoteStatusNotesEditor({
  quoteId,
  initialStatus,
  initialAdminNotes,
  assignedToName,
  assignedToEmail,
}: QuoteStatusNotesEditorProps) {
  const [status, setStatus] = useState<QuoteStatus>(initialStatus);
  const [adminNotes, setAdminNotes] = useState(initialAdminNotes ?? "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleStatusChange(newStatus: QuoteStatus) {
    setIsSavingStatus(true);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      setStatus(newStatus);
      showSuccess("Estado actualizado correctamente");
    } catch (err) {
      console.error(err);
      alert("Error al actualizar el estado");
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleSaveNote() {
    setIsSavingNote(true);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      showSuccess("Nota guardada correctamente");
    } catch (err) {
      console.error(err);
      alert("Error al guardar la nota");
    } finally {
      setIsSavingNote(false);
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const currentMeta = statusMeta[status];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Auto-Assignment Notification Panel at the Top */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "10px",
        }}
      >
        <User size={18} style={{ color: "#2563eb" }} />
        <span style={{ fontSize: "14px", color: "#1e3a8a", fontWeight: "500" }}>
          Asignada automáticamente a:{" "}
          <strong style={{ fontWeight: "700" }}>
            {assignedToName ?? "Sin asignar"} ({assignedToEmail ?? "N/A"})
          </strong>
        </span>
      </div>

      {/* Status Editor Section */}
      <div className="panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", margin: 0 }}>Estado de Gestión</h3>
          <span className={`admin-complaint-status ${currentMeta.className}`}>
            {currentMeta.label}
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
          {(Object.keys(statusMeta) as QuoteStatus[]).map((key) => {
            const meta = statusMeta[key];
            const isSelected = key === status;
            return (
              <button
                key={key}
                disabled={isSavingStatus}
                onClick={() => handleStatusChange(key)}
                className={`admin-complaint-status ${meta.className}`}
                style={{
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  opacity: isSavingStatus ? 0.6 : 1,
                  border: isSelected ? "2px solid #000" : "1px solid transparent",
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes Section */}
      <div className="panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MessageSquare size={16} style={{ color: "#64748b" }} />
          <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a", margin: 0 }}>Notas de Seguimiento</h3>
        </div>

        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Escribe notas de seguimiento aquí (ej. detalles de la llamada con el cliente, coordinaciones de despacho...)"
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            fontSize: "13px",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#22c55e", fontWeight: "600" }}>
            {successMsg && `✓ ${successMsg}`}
          </span>
          <button
            onClick={handleSaveNote}
            disabled={isSavingNote}
            className="button button-primary"
            style={{
              height: "36px",
              padding: "0 16px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderRadius: "8px",
            }}
          >
            <Save size={14} />
            {isSavingNote ? "Guardando..." : "Guardar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}
