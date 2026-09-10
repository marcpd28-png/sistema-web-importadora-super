"use client";

import { useState, useTransition } from "react";
import { approveOrderAction, cancelOrderAction, markShippedAction, saveAdminNotesAction } from "./actions";
import { CheckCircle, XCircle, Truck, Save, Loader2 } from "lucide-react";

type Props = {
  orderId: string;
  status: string;
  initialNotes: string | null;
};

export function OrderActions({ orderId, status, initialNotes }: Props) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(initialNotes || "");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const run = (action: () => Promise<void>) => {
    startTransition(async () => {
      try {
        await action();
        setFeedback({ type: "success", msg: "Estado actualizado correctamente." });
      } catch {
        setFeedback({ type: "error", msg: "Error al actualizar. Intenta de nuevo." });
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Notes */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
          Notas internas del admin
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ej: Voucher verificado, código de transferencia #123456..."
          rows={3}
          disabled={isPending}
          style={{
            width: "100%", padding: "10px 12px", border: "1px solid #d1d5db",
            borderRadius: 8, fontSize: 13, resize: "vertical", boxSizing: "border-box",
          }}
        />
        <button
          className="button button-ghost button-chip"
          disabled={isPending}
          onClick={() => run(() => saveAdminNotesAction(orderId, notes))}
          style={{ marginTop: 6, fontSize: 12 }}
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar notas
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {status === "PENDING" && (
          <button
            className="button button-primary"
            disabled={isPending}
            onClick={() => run(() => approveOrderAction(orderId, notes))}
            style={{ background: "#10b981", borderColor: "#10b981", display: "flex", alignItems: "center", gap: 6 }}
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            ✓ Marcar como PAGADO
          </button>
        )}

        {(status === "PENDING" || status === "PAID") && (
          <button
            className="button button-primary"
            disabled={isPending}
            onClick={() => run(() => markShippedAction(orderId, notes))}
            style={{ background: "#3b82f6", borderColor: "#3b82f6", display: "flex", alignItems: "center", gap: 6 }}
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
            📦 Marcar como ENVIADO
          </button>
        )}

        {status !== "CANCELED" && status !== "DELIVERED" && (
          <button
            className="button"
            disabled={isPending}
            onClick={() => {
              if (confirm("¿Cancelar esta orden? Esta acción no se puede deshacer.")) {
                run(() => cancelOrderAction(orderId, notes));
              }
            }}
            style={{
              background: "#fff", border: "2px solid #ef4444", color: "#ef4444",
              display: "flex", alignItems: "center", gap: 6
            }}
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            Cancelar orden
          </button>
        )}
      </div>

      {feedback && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: feedback.type === "success" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${feedback.type === "success" ? "#86efac" : "#fca5a5"}`,
          color: feedback.type === "success" ? "#16a34a" : "#dc2626",
        }}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
