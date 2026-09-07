"use client";

import { useState } from "react";
import { savePromoAction, deletePromoAction } from "@/app/admin/cupones/actions";

export function PromoForm({ promo, promoters }: { promo?: any; promoters: any[] }) {
  const [loading, setLoading] = useState(false);

  return (
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

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="field">
          <span>Descuento para Cliente</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <select name="discountType" defaultValue={promo?.discountType || "PERCENTAGE"} style={{ width: "120px" }}>
              <option value="PERCENTAGE">% Porcentaje</option>
              <option value="FIXED">S/ Fijo</option>
            </select>
            <input 
              type="number" 
              name="discountValue" 
              required 
              min="0" 
              step="0.01" 
              defaultValue={promo?.discountValue || ""} 
              style={{ flex: 1 }}
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
            defaultValue={promo?.minOrderAmount || "0"} 
          />
          <p className="muted" style={{ fontSize: "12px", marginTop: "4px" }}>Requerido para proteger contra saldos negativos.</p>
        </label>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Comisión para el Promotor/Influencer</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <select name="commissionType" defaultValue={promo?.commissionType || "FIXED"} style={{ width: "120px" }}>
              <option value="FIXED">S/ Fijo</option>
              <option value="PERCENTAGE">% Porcentaje</option>
            </select>
            <input 
              type="number" 
              name="commissionValue" 
              required 
              min="0" 
              step="0.01" 
              defaultValue={promo?.commissionValue || ""} 
              style={{ flex: 1 }}
            />
          </div>
        </label>

        <label className="field">
          <span>Asignar a Promotor (Opcional)</span>
          <select name="creatorId" defaultValue={promo?.creatorId || ""}>
            <option value="">-- Sin asignar --</option>
            {promoters.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
            ))}
          </select>
          <p className="muted" style={{ fontSize: "12px", marginTop: "4px" }}>Las comisiones se asociarán a este usuario.</p>
        </label>

        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: "8px", marginTop: "12px" }}>
          <input 
            type="checkbox" 
            name="isActive" 
            id="isActive" 
            defaultChecked={promo ? promo.isActive : true} 
            style={{ width: "20px", height: "20px", cursor: "pointer" }}
          />
          <span style={{ cursor: "pointer", fontWeight: 600 }}>Cupón Activo</span>
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
            onClick={async () => {
              if (confirm("¿Estás seguro de eliminar este cupón?")) {
                setLoading(true);
                try {
                  await deletePromoAction(promo.id);
                } catch (err: any) {
                  if (err?.message === "NEXT_REDIRECT") throw err;
                  alert(String(err));
                  setLoading(false);
                }
              }
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}
