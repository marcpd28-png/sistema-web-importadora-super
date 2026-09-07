"use client";

import { Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";

export function DeletePromoButton({ action }: { action: any }) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
      <button 
        className="icon-button danger" 
        type="button" 
        onClick={() => setShowConfirm(true)}
        title="Eliminar Cupón"
      >
        <Trash2 size={16} />
      </button>

      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="panel" style={{ width: "100%", maxWidth: "400px", padding: "24px", position: "relative", textAlign: "center", animation: "modalAppear 0.2s ease-out" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px", color: "#ef4444" }}>
              <AlertTriangle size={48} strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0f172a", marginBottom: "8px" }}>
              Eliminar Cupón
            </h2>
            <p style={{ color: "#64748b", marginBottom: "24px", fontSize: "0.95rem" }}>
              ¿Estás seguro de que deseas eliminar este cupón de descuento? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button 
                type="button" 
                className="button button-outline" 
                onClick={() => setShowConfirm(false)}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <form action={action} style={{ flex: 1, display: "flex" }}>
                <button type="submit" className="button button-primary" style={{ width: "100%", backgroundColor: "#ef4444", borderColor: "#ef4444" }}>
                  Sí, eliminar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
