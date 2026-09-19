"use client";

import { useState } from "react";
import type { EditorialWriteSummary } from "@/lib/facturador/editorial-write";

const labels: Record<string, string> = {
  PREPARING: "Consultando ERP", SENDING: "Enviando", ACCEPTED: "Envío aceptado por el ERP",
  FAILED: "No enviado", UNCERTAIN: "Requiere revisión", REVIEWED: "Revisado por administrador",
};

export function ErpEditorialStatus({ productId, writes, setWrites }: {
  productId: string; writes: EditorialWriteSummary[]; setWrites: (writes: EditorialWriteSummary[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  async function refresh() {
    const res = await fetch(`/api/admin/fichas/${productId}/erp`, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo actualizar el historial.");
    const result = await res.json();
    setWrites(result.writes);
    setCheckedAt(Date.now());
  }
  async function act(requestId?: string) {
    setBusy(true); setError("");
    try {
      if (requestId) {
        const response = await fetch(`/api/admin/fichas/${productId}/erp`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reviewed", requestId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
      }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar el historial."); }
    finally { setBusy(false); }
  }
  return <section className="stack-sm" aria-label="Envíos de ficha al ERP" style={{ padding: 14, border: "1px solid #cbd5e1", borderRadius: 8 }}>
    <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
      <strong>Envíos al ERP</strong>
      <button type="button" className="button button-sm button-neutral" disabled={busy} onClick={() => void act()}>Actualizar estado</button>
    </div>
    <p style={{ margin: 0, fontSize: 13 }}>La ficha se envía a «Descripción detallada» y su resumen técnico a «Especificaciones». El título se conserva. La API del ERP todavía no permite recuperar esos detalles al sincronizar.</p>
    {error && <p role="alert">{error}</p>}
    {!writes.length && <p style={{ margin: 0, fontSize: 13 }}>Todavía no hay envíos desde este panel.</p>}
    {writes.slice(0, 3).map((write) => {
      const stale = ["PREPARING", "SENDING"].includes(write.status) && checkedAt - new Date(write.updatedAt).getTime() >= 120000;
      return <div key={write.id} style={{ fontSize: 13, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
        <strong>{labels[write.status] || write.status}</strong> · {new Date(write.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}
        <p style={{ margin: "6px 0" }}>{write.message}</p>
        {(write.status === "UNCERTAIN" || stale) && <button type="button" className="button button-sm button-neutral" disabled={busy} onClick={() => void act(write.id)}>Ya revisé este envío en el ERP</button>}
      </div>;
    })}
  </section>;
}
