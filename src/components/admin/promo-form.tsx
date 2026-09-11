"use client";

import { useState, useRef, useEffect } from "react";
import { savePromoAction, deletePromoAction } from "@/app/admin/cupones/actions";
import { AlertTriangle } from "lucide-react";

export function PromoForm({ promo, promoters }: { promo?: any; promoters: any[] }) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <>
    <form action={async (formData) => {
      setLoading(true);
      try {
        await savePromoAction(formData);
      } catch (err: any) {
        if (err?.message === "NEXT_REDIRECT") throw err;
        alert(String(err));
        setLoading(false);
      }
    }} className="stack-lg">
      {promo && <input type="hidden" name="id" value={promo.id} />}
      
      <div className="form-grid">
        <label className="field">
          <span>Código del Cupón (Sin espacios, ej. LUIS10)</span>
          <input 
            type="text" 
            name="code" 
            required 
            defaultValue={promo?.code || ""} 
            style={{ textTransform: "uppercase" }}
            pattern="[A-Za-z0-9]+"
            title="Solo letras y números, sin espacios"
            placeholder="Ej. VIP2024"
          />
        </label>
      </div>

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "24px 16px" }}>
        <label className="field">
          <span>Descuento para Cliente</span>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px" }}>
            <select name="discountType" defaultValue={promo?.discountType || "PERCENTAGE"}>
              <option value="PERCENTAGE">% Porcentaje</option>
              <option value="FIXED">S/ Fijo</option>
            </select>
            <input 
              type="number" 
              name="discountValue" 
              required 
              min="0" 
              step="0.01"
              placeholder="0.00" 
              defaultValue={promo?.discountValue || ""} 
              style={{ width: "100%" }}
            />
          </div>
        </label>

        <label className="field">
          <span>Mínimo de Compra (S/)</span>
          <input 
            type="number" 
            name="minOrderAmount" 
            min="0" 
            step="0.01" 
            placeholder="0.00"
            defaultValue={promo?.minOrderAmount || "0"} 
          />
          <p className="muted" style={{ fontSize: "12px", marginTop: "4px" }}>Requerido para proteger contra saldos negativos.</p>
        </label>
      </div>

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "24px 16px" }}>
        <label className="field">
          <span>Comisión para el Promotor/Influencer</span>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px" }}>
            <select name="commissionType" defaultValue={promo?.commissionType || "FIXED"}>
              <option value="FIXED">S/ Fijo</option>
              <option value="PERCENTAGE">% Porcentaje</option>
            </select>
            <input 
              type="number" 
              name="commissionValue" 
              required 
              min="0" 
              step="0.01" 
              placeholder="0.00"
              defaultValue={promo?.commissionValue || ""} 
              style={{ width: "100%" }}
            />
          </div>
        </label>

        <label className="field">
          <span>Asignar a Promotor (Opcional)</span>
          <PromotorCombobox promoters={promoters} defaultValue={promo?.creatorId || ""} />
          <p className="muted" style={{ fontSize: "12px", marginTop: "4px" }}>Las comisiones se asociarán a este usuario.</p>
        </label>
      </div>

      <div style={{ marginTop: "12px" }}>
        <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "10px", cursor: "pointer", width: "fit-content" }}>
          <input 
            type="checkbox" 
            name="isActive" 
            id="isActive" 
            defaultChecked={promo ? promo.isActive : true} 
            style={{ width: "20px", height: "20px", cursor: "pointer", margin: 0 }}
          />
          <span style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.95rem" }}>Cupón Activo</span>
        </label>
      </div>

      <div className="actions-row" style={{ marginTop: "32px", borderTop: "1px solid var(--border)", paddingTop: "24px" }}>
        <button type="submit" className="button button-primary" disabled={loading}>
          {loading ? "Guardando..." : "Guardar Cupón"}
        </button>
        {promo && (
          <button 
            type="button" 
            className="button button-ghost danger" 
            style={{ marginLeft: "auto" }}
            onClick={() => setShowConfirm(true)}
          >
            Eliminar
          </button>
        )}
      </div>
    </form>

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
            <button 
              type="button" 
              className="button button-primary" 
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await deletePromoAction(promo.id);
                } catch (err: any) {
                  if (err?.message === "NEXT_REDIRECT") throw err;
                  alert(String(err));
                  setLoading(false);
                }
              }}
              style={{ flex: 1, backgroundColor: "#ef4444", borderColor: "#ef4444" }}
            >
              {loading ? "Eliminando..." : "Sí, eliminar"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
