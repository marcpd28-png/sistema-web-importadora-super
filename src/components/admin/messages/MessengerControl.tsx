"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessengerControlState } from "@/lib/messenger-control";

export function MessengerControl({ conversationId, disabled, onBusyChange }: { conversationId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [state, setState] = useState<MessengerControlState | null>(null);
  const [minutes, setMinutes] = useState("15");
  const [customMinutes, setCustomMinutes] = useState("30");
  const pauseMinutes = Number(minutes === "custom" ? customMinutes : minutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/admin/social/messenger/control?conversationId=${conversationId}`, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setState(body);
  }, [conversationId]);
  useEffect(() => {
    if (busy || disabled) return;
    const controller = new AbortController();
    const update = () => { if (!document.hidden) void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); }); };
    update();
    const timer = setInterval(update, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh, busy, disabled]);
  async function change(action: "manual" | "meta", manualMinutes = pauseMinutes) {
    setBusy(true); onBusyChange(true); setError("");
    try {
      const response = await fetch("/api/admin/social/messenger/control", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action, minutes: action === "manual" ? manualMinutes : 0, resumeTarget: "meta" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setState(body);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  const metaActive = state?.owner === "meta";
  const validPause = Number.isInteger(pauseMinutes) && pauseMinutes >= (minutes === "custom" ? 1 : 0) && pauseMinutes <= 10080;
  const unavailable = busy || disabled || !state;
  return <section className={`messenger-control ${metaActive ? "is-active" : ""}`} aria-label="Control de la IA de Meta">
    <div className="messenger-control-bar">
      <div><strong>Bot de Facebook</strong><span>{metaActive ? "Activo: responde la IA de Meta" : "Pausado: atención manual"}</span></div>
      <label className="messenger-switch" title={metaActive ? "Pausar la IA de Meta" : "Activar la IA de Meta"}>
        <input aria-label="Activar bot de Facebook" checked={metaActive} disabled={unavailable || (!metaActive && !state.metaAiAvailable)} onChange={event => void change(event.target.checked ? "meta" : "manual")} type="checkbox" />
        <i aria-hidden="true" />
      </label>
    </div>
    <div className="messenger-control-content">
      <p>{state?.ownerVerified === false ? "Se muestra el último cambio confirmado por la tienda; Facebook no permite consultar el propietario de este hilo ahora." : state?.owner === "store" ? "Facebook confirma que la tienda tiene el control." : state?.owner === "meta" ? "Facebook confirma que Meta Business Agent tiene el control de esta conversación." : state?.owner === "other" ? "Otra aplicación tiene el control en Facebook." : "Control de Facebook pendiente de comprobar."}</p>
      <label>Al pausar, reactivar la IA de Meta <select value={minutes} disabled={busy || disabled} onChange={e => setMinutes(e.target.value)}>
        <option value="15">En 15 minutos</option><option value="30">En 30 minutos</option><option value="60">En 1 hora</option><option value="240">En 4 horas</option><option value="1440">En 24 horas</option><option value="0">Solo cuando yo lo active</option><option value="custom">Tiempo personalizado</option>
      </select></label>
      {minutes === "custom" && <label>Minutos (1–10080)<input type="number" min="1" max="10080" value={customMinutes} disabled={busy || disabled} onChange={e => setCustomMinutes(e.target.value)} /></label>}
      <div className="messenger-control-actions"><button className="btn btn-outline" disabled={busy || disabled || !validPause} onClick={() => void change("manual")}>{busy ? "Aplicando…" : "Tomar conversación / pausar IA"}</button><button className="btn btn-outline" disabled={busy || disabled || !state?.metaAiAvailable} onClick={() => void change("meta", 0)}>Activar IA de Meta ahora</button></div>
      {state?.resumeAt && <p>La IA de Meta se reactivará: {new Date(state.resumeAt * 1000).toLocaleString("es-PE")}. Funciona aunque cierres esta página.</p>}
      <p>Cada respuesta manual vuelve a pausar la IA y reinicia el plazo seleccionado, para que no haya respuestas simultáneas.</p>
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
      <button className="btn btn-outline" disabled={busy} onClick={() => void refresh().then(() => setError("")).catch(e => setError(e.message))}>Actualizar estado</button>
    </div>
    <style jsx>{`.messenger-control{border-bottom:1px solid #dce5ef;background:#f8fafc;font-size:12px;flex-shrink:0}.messenger-control.is-active{background:#f0fdf4;border-color:#bbf7d0}.messenger-control-bar{align-items:center;display:flex;justify-content:space-between;gap:16px;padding:10px 16px}.messenger-control-bar strong{display:block;font-size:13px}.messenger-control-bar span{color:#64748b;display:block;margin-top:2px}.is-active .messenger-control-bar span{color:#15803d}.messenger-control-content{border-top:1px solid #dce5ef;padding:0 16px 12px;max-height:36vh;overflow:auto}.messenger-control-content p{margin:8px 0}.messenger-control-content label:not(.messenger-switch){display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}.messenger-control-content select,.messenger-control-content input{padding:6px;border:1px solid #ccd6e4;border-radius:6px;max-width:100%}.messenger-control-actions{display:flex;gap:8px;flex-wrap:wrap}.messenger-switch{cursor:pointer;display:block;height:30px;position:relative;width:52px}.messenger-switch input{height:1px;opacity:0;position:absolute;width:1px}.messenger-switch i{background:#94a3b8;border-radius:999px;display:block;height:30px;transition:background .16s ease}.messenger-switch i::after{background:#fff;border-radius:50%;box-shadow:0 1px 3px #0f172a4d;content:"";height:24px;left:3px;position:absolute;top:3px;transition:transform .16s ease;width:24px}.messenger-switch input:checked+i{background:#16a34a}.messenger-switch input:checked+i::after{transform:translateX(22px)}.messenger-switch input:focus-visible+i{outline:3px solid #86efac;outline-offset:2px}.messenger-switch input:disabled+i{cursor:not-allowed;opacity:.55}`}</style>
  </section>;
}
