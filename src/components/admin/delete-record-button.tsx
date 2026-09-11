"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

type Props = {
  recordId: string;
  recordType: "quote" | "order";
  userEmail: string;
  onDelete: (id: string) => Promise<void>;
};

export function DeleteRecordButton({ recordId, recordType, userEmail, onDelete }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const superAdminEmails = ["mark@importadora.com", "adminmark@importadora.com", "mark@importadora.local"];
  const hasPermission = superAdminEmails.includes(userEmail);

  const handleClick = () => {
    if (!hasPermission) {
      alert("No tienes permisos para eliminar. Solicita acceso a tu súper administrador.");
      return;
    }
    setIsOpen(true);
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onDelete(recordId);
    } catch (e) {
      alert("Ocurrió un error al intentar eliminar.");
      setIsDeleting(false);
      setIsOpen(false);
    }
  };

  return (
    <>
      <button 
        type="button" 
        onClick={handleClick}
        className="button"
        style={{ 
          background: "var(--brand-danger)", 
          color: "white", 
          border: "none",
          gap: "8px",
          display: "flex",
          alignItems: "center"
        }}
      >
        <Trash2 size={16} />
        Eliminar
      </button>

      {isOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
          background: "rgba(0,0,0,0.5)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "var(--bg-main)",
            padding: "24px",
            borderRadius: "12px",
            maxWidth: "400px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
          }}>
            <h3 style={{ marginTop: 0, color: "var(--brand-danger)" }}>Eliminar registro</h3>
            <p style={{ color: "var(--muted)" }}>
              ¿Estás seguro de eliminar esta {recordType === "quote" ? "cotización" : "orden"}? Esta acción es irreversible y eliminará todos los datos relacionados.
            </p>
            <div style={{ display: "flex", gap: "12px", marginTop: "24px", justifyContent: "flex-end" }}>
              <button 
                type="button" 
                onClick={() => setIsOpen(false)}
                className="button"
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleConfirm}
                className="button"
                disabled={isDeleting}
                style={{ background: "var(--brand-danger)", color: "white" }}
              >
                {isDeleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
