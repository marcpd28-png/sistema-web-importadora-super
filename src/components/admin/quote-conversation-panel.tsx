"use client";

import { useState } from "react";
import { QuoteStatus } from "@prisma/client";
import { Copy, User, Save } from "lucide-react";

type QuoteConversationPanelProps = {
  quoteId: string;
  initialStatus: QuoteStatus;
  initialAdminNotes: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  customerName: string;
  customerPhone: string;
  customerMessage: string | null;
  pdfLink?: string;
  quoteNumber?: string | null;
  canSetSystemStatuses?: boolean;
};

const advisorManagedStatuses: QuoteStatus[] = ["PENDING", "IN_REVIEW", "RESPONDED", "CLOSED"];

const statusMeta: Record<QuoteStatus, { label: string; style: React.CSSProperties }> = {
  PENDING: { label: "Nuevo", style: { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" } },
  IN_REVIEW: { label: "En revisión", style: { background: "#e0e7ff", color: "#3730a3", border: "1px solid #c7d2fe" } },
  RESPONDED: { label: "Respondido", style: { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" } },
  CLOSED: { label: "Cerrado", style: { background: "#f3f4f6", color: "#4b5563", border: "1px solid #e5e7eb" } },
  ERP_REGISTERED: { label: "Registrada ERP", style: { background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" } },
  ERROR: { label: "Con error", style: { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" } },
};

export function QuoteConversationPanel({
  quoteId,
  initialStatus,
  initialAdminNotes,
  assignedToName,
  assignedToEmail,
  customerName,
  customerPhone,
  customerMessage,
  pdfLink,
  quoteNumber,
  canSetSystemStatuses = true,
}: QuoteConversationPanelProps) {
  void customerPhone;
  const [status, setStatus] = useState<QuoteStatus>(initialStatus);
  const [adminNotes, setAdminNotes] = useState(initialAdminNotes ?? "");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // The response can be copied into the channel where the customer is active.
  const [replyText, setReplyText] = useState(
    `Hola ${customerName}, te contacto sobre tu cotización ${quoteNumber || ""}. En respuesta a tu solicitud.${pdfLink ? `\n\nPuedes ver tu cotización en PDF aquí: ${pdfLink}` : ""}`
  );

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
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#dbeafe", color: "#1e40af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" }}>
          {assignedToName ? assignedToName.charAt(0).toUpperCase() : <User size={16} />}
        </div>
        <span style={{ fontSize: "14px", color: "#1e3a8a", fontWeight: "500" }}>
          Asesor a cargo:{" "}
          <strong style={{ fontWeight: "700" }}>
            {assignedToName ?? "Sin asignar"}
          </strong>
        </span>
      </div>

      {/* Status Editor Section */}
      <div className="panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0 }}>Estado de la cotización</h3>
          <span style={{ ...currentMeta.style, padding: "4px 8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
            {currentMeta.label}
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
          {(Object.keys(statusMeta) as QuoteStatus[])
            .filter((key) => canSetSystemStatuses || advisorManagedStatuses.includes(key))
            .map((key) => {
              const meta = statusMeta[key];
              const isSelected = key === status;
              return (
                <button
                  key={key}
                  disabled={isSavingStatus}
                  onClick={() => handleStatusChange(key)}
                  style={{
                    ...meta.style,
                    cursor: "pointer",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    transition: "all 0.15s ease",
                    opacity: isSavingStatus ? 0.6 : 1,
                    boxShadow: isSelected ? "0 0 0 2px #0f172a" : "none",
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
        </div>
      </div>

      {/* Chat Thread / Message History */}
      <div className="panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px", background: "#f8fafc" }}>
        <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0 }}>Historial de Mensajes</h3>
        
        {/* Customer Bubble */}
        {customerMessage && (
          <div style={{ alignSelf: "flex-start", maxWidth: "85%", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginLeft: "4px" }}>{customerName} (Cliente)</span>
            <div style={{ background: "white", padding: "10px 14px", borderRadius: "12px", borderTopLeftRadius: "0", border: "1px solid #e2e8f0", color: "#1e293b", fontSize: "14px", lineHeight: "1.5", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
              {customerMessage}
            </div>
          </div>
        )}
        
        {/* Admin Notes Bubble */}
        <div style={{ alignSelf: "flex-end", maxWidth: "85%", display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px", width: "100%" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#166534", alignSelf: "flex-end", marginRight: "4px" }}>{assignedToName || "Administrador"} (Notas Internas)</span>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Escribe notas de seguimiento interno aquí (ej. detalles de la llamada)..."
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "10px 14px",
              borderRadius: "12px",
              borderTopRightRadius: "0",
              border: "1px solid #bbf7d0",
              background: "#dcfce7",
              color: "#14532d",
              fontSize: "13px",
              resize: "vertical",
              fontFamily: "inherit",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", alignItems: "center", marginTop: "4px" }}>
            {successMsg && <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: "600" }}>✓ {successMsg}</span>}
            <button
              onClick={handleSaveNote}
              disabled={isSavingNote}
              className="button button-primary"
              style={{ padding: "4px 12px", fontSize: "12px", borderRadius: "6px", height: "28px" }}
            >
              <Save size={14} style={{ marginRight: "4px" }} />
              {isSavingNote ? "Guardando..." : "Guardar nota"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "white", borderTop: "3px solid #2563eb" }}>
        <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
          <Copy size={16} style={{ color: "#2563eb" }} /> Preparar respuesta
        </h3>
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Redacta la respuesta para el cliente..."
          style={{ width: "100%", minHeight: "100px", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", resize: "vertical", fontFamily: "inherit" }}
        />
        <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(replyText.trim())}
            className="button"
            style={{ alignSelf: "flex-end", background: "#2563eb", color: "white", padding: "6px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Copy size={14} /> Copiar respuesta
          </button>
      </div>

    </div>
  );
}
