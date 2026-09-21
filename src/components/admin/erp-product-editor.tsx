"use client";

import { useState } from "react";
import { erpProductFields, erpProductSendSchema, type ErpProductOperation, type ErpProductSnapshot } from "@/lib/facturador/product-fields";
import type { EditorialWriteSummary } from "@/lib/facturador/editorial-write";

const labels: Record<string, string> = { PREPARING: "Preparando", SENDING: "Enviando", ACCEPTED: "Aceptado por el ERP", FAILED: "No enviado", UNCERTAIN: "Requiere revisión", REVIEWED: "Revisado" };
const valueText = (v: unknown) => v === true ? "Sí" : v === false ? "No" : v == null || v === "" ? "Vacío" : String(v);

export function ErpProductEditor({ productId }: { productId: string }) {
  const [snapshot, setSnapshot] = useState<ErpProductSnapshot | null>(null);
  const [changes, setChanges] = useState<Record<string, string | number | boolean | null>>({});
  const [writes, setWrites] = useState<EditorialWriteSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ operation: ErpProductOperation; requestId: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const endpoint = `/api/admin/products/${encodeURIComponent(productId)}/erp`;
  const unresolved = writes.some((w) => ["PREPARING", "SENDING", "UNCERTAIN"].includes(w.status));
  async function api(url: string, body?: unknown) {
    const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "No se pudo consultar el ERP.");
    return result;
  }
  async function load(historyOnly = false) {
    setBusy(true); setError("");
    try {
      // History remains usable even when the ERP itself is unavailable.
      const history = await api(`${endpoint}?history=1`);
      setWrites(history.writes); setCheckedAt(Date.now());
      if (!historyOnly) {
        const result = await api(endpoint);
        setSnapshot(result.snapshot); setChanges({}); setPending(null); setWrites(result.writes);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); }
    finally { setBusy(false); }
  }
  function edit(key: string, value: string | boolean | null) {
    setPending(null);
    setChanges((previous) => {
      const next = { ...previous };
      if (String(value ?? "") === String(snapshot?.values[key] ?? "")) delete next[key];
      else next[key] = value;
      return next;
    });
  }
  function prepare(operation: unknown) {
    const parsed = erpProductSendSchema.safeParse(operation);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Revisa los datos."); return; }
    setError(""); setPending({ operation: parsed.data, requestId: crypto.randomUUID() });
  }
  async function send() {
    if (!pending || !snapshot) return;
    setBusy(true); setError("");
    try {
      const result = await api(endpoint, { action: "send", ...pending, revision: snapshot.revision });
      setWrites((old) => [result.write, ...old.filter((w) => w.id !== result.write.id)]);
      setPending(null); setSnapshot(null); setChanges({});
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "No se pudo confirmar el envío."} Actualiza el historial antes de continuar.`);
      // Never offer a new inventory POST after losing the HTTP acknowledgement.
      setPending(null); setSnapshot(null);
    } finally { setBusy(false); }
  }
  async function reviewed(requestId: string) {
    setBusy(true); setError("");
    try {
      const result = await api(endpoint, { action: "reviewed", requestId });
      setWrites((old) => old.map((w) => w.id === requestId ? result.write : w));
      setSnapshot(null); setPending(null);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar la revisión."); }
    finally { setBusy(false); }
  }
  return <details className="product-section-card" style={{ marginBottom: 24 }}>
    <summary style={{ cursor: "pointer", fontWeight: 700 }}>Editar producto en el ERP</summary>
    <div className="stack-lg" style={{ marginTop: 16 }}>
      <p>Consulta y modifica el registro del ERP. Antes de enviar verás los cambios. Los precios, categorías e inventario de la tienda se actualizarán con la sincronización.</p>
      <div className="actions-row">
        <button className="button button-primary" type="button" disabled={busy} onClick={() => void load()}>Cargar datos actuales del ERP</button>
        <button className="button button-neutral" type="button" disabled={busy} onClick={() => void load(true)}>Actualizar historial</button>
      </div>
      {busy && <p role="status">Procesando…</p>}
      {error && <p role="alert">{error}</p>}
      {unresolved && <p role="alert">Hay un envío en curso o pendiente de revisión. Comprueba su resultado en el ERP antes de otra operación.</p>}
      {snapshot && <>
        <form className="stack-lg" onSubmit={(event) => { event.preventDefault(); prepare({ kind: "product", changes }); }}>
          <fieldset disabled={busy || unresolved} style={{ border: 0, padding: 0, minWidth: 0 }}>
            <legend>Datos del producto en el ERP</legend>
            <div className="form-grid">
              {erpProductFields.map((field) => {
                const value = field.key in changes ? changes[field.key] : snapshot.values[field.key];
                const options = "table" in field ? snapshot.tables[field.table] : undefined;
                return <label className="field" key={field.key}>
                  <span>{field.label}</span>
                  {field.type === "boolean" ? <input type="checkbox" checked={value === true || value === 1} onChange={(e) => edit(field.key, e.target.checked)} />
                    : options?.length ? <select value={String(value ?? "")} required={"required" in field} onChange={(e) => edit(field.key, e.target.value || null)}>
                      <option value="">Sin asignar</option>
                      {value != null && !options.some((o) => o.id === String(value)) && <option value={String(value)}>{String(value)}</option>}
                      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    : field.type === "textarea" ? <textarea rows={field.key === "name_long" ? 5 : 3} value={String(value ?? "")} maxLength={field.key === "name_long" ? 20000 : field.key === "factory_code" ? 250 : 500} onChange={(e) => edit(field.key, e.target.value)} />
                    : <input type={field.type} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? "any" : undefined} required={"required" in field} value={String(value ?? "")} onChange={(e) => edit(field.key, e.target.value || null)} />}
                  {!(field.key in snapshot.values) && <small>El ERP no devuelve este valor; solo se enviará si lo editas.</small>}
                </label>;
              })}
            </div>
            <label className="field" style={{ marginTop: 16 }}>
              <span>Imagen: URL de una foto ya cargada en el ERP</span>
              <input type="url" value={String(changes.image_url ?? snapshot.values.image_url ?? "")} onChange={(e) => edit("image_url", e.target.value)} />
              <small>La carga de archivos nuevos está pendiente de soporte API. Pega una URL de imagen del mismo ERP; la portada del editor web no se sube automáticamente.</small>
            </label>
            <button className="button button-primary" style={{ marginTop: 16 }} type="submit" disabled={!Object.keys(changes).length}>Revisar cambios del producto</button>
          </fieldset>
        </form>
        <form className="stack-sm" onSubmit={(event) => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          prepare({ kind: "inventory", type: data.get("type"), quantity: Number(data.get("quantity")), warehouseId: Number(data.get("warehouseId")) });
        }}>
          <fieldset disabled={busy || unresolved} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, minWidth: 0 }}>
            <legend>Registrar un movimiento de stock</legend>
            <p>Indica cuántas unidades entran o salen. No es el stock final. {snapshot.stock !== null ? `Stock informado por el ERP: ${snapshot.stock} (puede incluir varios almacenes).` : "La API no informó el stock en esta consulta."}</p>
            <div className="form-grid">
              <label className="field"><span>Movimiento</span><select name="type" onChange={() => setPending(null)}><option value="input">Entrada de unidades</option><option value="output">Salida de unidades</option></select></label>
              <label className="field"><span>Cantidad de unidades</span><input name="quantity" type="number" min="0.000001" step="any" required onChange={() => setPending(null)} /></label>
              <label className="field"><span>Almacén ERP</span>{snapshot.tables.warehouses?.length
                ? <select name="warehouseId" required onChange={() => setPending(null)}><option value="">Seleccionar almacén</option>{snapshot.tables.warehouses.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                : <input name="warehouseId" type="number" min="1" step="1" required placeholder="ID del almacén en el ERP" onChange={() => setPending(null)} />}</label>
            </div>
            <button className="button button-primary" type="submit" style={{ marginTop: 16 }}>Revisar movimiento de stock</button>
          </fieldset>
        </form>
      </>}
      {pending && snapshot && <section className="stack-sm" aria-label="Revisar envío al ERP" style={{ border: "1px solid #cbd5e1", padding: 16, borderRadius: 8 }}>
        <strong>Revisa lo que enviarás al ERP</strong>
        {pending.operation.kind === "product" ? <ul>{Object.entries(pending.operation.changes).map(([key, value]) => <li key={key} style={{ overflowWrap: "anywhere" }}>
          <strong>{erpProductFields.find((f) => f.key === key)?.label ?? "Imagen"}:</strong> {key in snapshot.values ? valueText(snapshot.values[key]) : "No devuelto por el ERP"} → {valueText(value)}
        </li>)}</ul> : <p>{pending.operation.type === "input" ? "Entrada" : "Salida"} de <strong>{pending.operation.quantity}</strong> unidades en el almacén <strong>{snapshot.tables.warehouses?.find((o) => o.id === String(pending.operation.kind === "inventory" && pending.operation.warehouseId))?.label ?? pending.operation.warehouseId}</strong>.</p>}
        <div className="actions-row"><button className="button button-primary" type="button" disabled={busy || unresolved} onClick={() => void send()}>{pending.operation.kind === "product" ? "Guardar cambios en el ERP" : "Registrar movimiento en el ERP"}</button><button className="button button-neutral" type="button" disabled={busy} onClick={() => setPending(null)}>Volver a editar</button></div>
      </section>}
      {!!writes.length && <section aria-label="Historial de envíos al ERP" className="stack-sm">
        <strong>Historial de envíos al ERP</strong>
        {writes.map((write) => <div key={write.id} style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8 }}>
          <strong>{labels[write.status] ?? write.status}</strong> · {new Date(write.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}
          <p>{write.message}</p>
          {(write.status === "UNCERTAIN" || (["SENDING", "PREPARING"].includes(write.status) && checkedAt - new Date(write.updatedAt).getTime() >= 120000)) && <button className="button button-neutral" type="button" disabled={busy} onClick={() => void reviewed(write.id)}>Ya revisé este envío en el ERP</button>}
        </div>)}
      </section>}
    </div>
  </details>;
}
