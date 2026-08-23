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

const statusMeta: Record<QuoteStatus, { label: string; color: string; bg: string; border: string }> = {
  PENDING: { label: "Nuevo", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  IN_REVIEW: { label: "En revisión", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  RESPONDED: { label: "Respondido", color: "#6d28d9", bg: "#faf5ff", border: "#e9d5ff" },
  CLOSED: { label: "Cerrado", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  ERP_REGISTERED: { label: "Registrado ERP", color: "#0f766e", bg: "#f0fdfa", border: "#99f6e4" },
  ERROR: { label: "Con error", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
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
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: "700",
              color: currentMeta.color,
              backgroundColor: currentMeta.bg,
              border: `1px solid ${currentMeta.border}`,
            }}
          >
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
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  color: isSelected ? "white" : meta.color,
                  backgroundColor: isSelected ? meta.color : meta.bg,
                  border: `1px solid ${isSelected ? meta.color : meta.border}`,
                  transition: "all 0.15s ease",
                  opacity: isSavingStatus ? 0.6 : 1,
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
