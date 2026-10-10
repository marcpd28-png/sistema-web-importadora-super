"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import type { MessengerControlState } from "@/lib/messenger-control";

export function MessengerControl({ conversationId, disabled, onBusyChange }: { conversationId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [state, setState] = useState<MessengerControlState | null>(null);
  const [minutes, setMinutes] = useState("15");
  const [customMinutes, setCustomMinutes] = useState("30");
  const [open, setOpen] = useState(false);
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
  const ownership = state?.ownerVerified === false
    ? "Último cambio confirmado por la tienda"
    : state?.owner === "store"
      ? "La tienda tiene el control"
      : state?.owner === "meta"
        ? "La IA de Meta tiene el control"
        : state?.owner === "other"
          ? "Otra aplicación tiene el control"
          : "Comprobando el control";
  const schedule = state?.resumeAt
    ? `Reactivación programada: ${new Date(state.resumeAt * 1000).toLocaleString("es-PE")}`
    : null;
  const saveLabel = metaActive ? "Pausar y programar" : "Guardar nuevo plazo";

  return <section className={`messenger-control ${metaActive ? "is-active" : "is-paused"}`} aria-label="Control de la IA de Meta">
    <div className="messenger-control-hero">
      <div className="messenger-control-copy">
        <p className="messenger-control-eyebrow">Automatización de Messenger</p>
        <div className="messenger-control-title"><strong>IA de Meta</strong><span className="messenger-control-state">{metaActive ? "ACTIVA" : "PAUSADA"}</span></div>
        <p className="messenger-control-status">{ownership}</p>
      </div>
      <label className="messenger-switch" title={metaActive ? "Pausar la IA de Meta" : "Activar la IA de Meta"}>
        <input aria-label="Activar o pausar la IA de Meta" checked={metaActive} disabled={unavailable || (!metaActive && !state.metaAiAvailable)} onChange={event => void change(event.target.checked ? "meta" : "manual")} type="checkbox" />
        <i aria-hidden="true" />
      </label>
    </div>

    <div className={`messenger-control-summary${schedule ? "" : " is-compact"}`}>
      {schedule && <span className="messenger-control-schedule">{schedule}</span>}
      <div className="messenger-control-summary-actions">
        <button className="messenger-control-expand" type="button" aria-expanded={open} aria-controls="messenger-control-options" onClick={() => setOpen(value => !value)} disabled={busy || disabled}>
          {open ? "Ocultar opciones" : "Configurar reactivación"} <ChevronDown size={15} aria-hidden="true" />
        </button>
        <button className="messenger-control-refresh" type="button" aria-label="Actualizar estado de Messenger" title="Actualizar estado" disabled={busy} onClick={() => void refresh().then(() => setError("")).catch(e => setError(e.message))}>
          <RefreshCw size={15} className={busy ? "is-spinning" : ""} aria-hidden="true" />
        </button>
      </div>
    </div>

    {open && <div className="messenger-control-options" id="messenger-control-options">
      <label className="messenger-control-field">
        <span>Al pausar, reactivar la IA</span>
        <select value={minutes} disabled={busy || disabled} onChange={e => setMinutes(e.target.value)}>
          <option value="15">En 15 minutos</option><option value="30">En 30 minutos</option><option value="60">En 1 hora</option><option value="240">En 4 horas</option><option value="1440">En 24 horas</option><option value="0">Solo cuando yo la active</option><option value="custom">Tiempo personalizado</option>
        </select>
      </label>
      {minutes === "custom" && <label className="messenger-control-field messenger-control-custom"><span>Minutos</span><input type="number" min="1" max="10080" value={customMinutes} disabled={busy || disabled} onChange={e => setCustomMinutes(e.target.value)} /></label>}
      <div className="messenger-control-option-actions">
        <button className="messenger-control-save" type="button" disabled={busy || disabled || !validPause} onClick={() => void change("manual")}>{busy ? "Aplicando…" : saveLabel}</button>
        {!metaActive && <button className="messenger-control-activate" type="button" disabled={busy || disabled || !state?.metaAiAvailable} onClick={() => void change("meta", 0)}>Activar ahora</button>}
      </div>
      <p className="messenger-control-note">Cada respuesta manual pausa la IA y reinicia este plazo, para evitar respuestas simultáneas.</p>
    </div>}
    {(error || state?.error) && <p className="messenger-control-error" role="alert">{error || state?.error}</p>}

    <style jsx>{`
      .messenger-control{--control-accent:#dc2626;--control-deep:#991b1b;--control-tint:#fff7f7;border-bottom:1px solid #f1d3d3;background:var(--control-tint);font-size:12px;flex-shrink:0}.messenger-control.is-active{--control-accent:#16a34a;--control-deep:#166534;--control-tint:#f2fcf5;border-color:#bce5c9}.messenger-control-hero{align-items:center;display:flex;gap:16px;justify-content:space-between;padding:13px 16px 10px}.messenger-control-copy{min-width:0}.messenger-control-eyebrow{color:#718096;font-size:10px;font-weight:800;letter-spacing:.095em;margin:0 0 3px;text-transform:uppercase}.messenger-control-title{align-items:center;display:flex;gap:8px}.messenger-control-title strong{color:#172033;font-size:15px;letter-spacing:-.015em}.messenger-control-state{border:1px solid color-mix(in srgb,var(--control-accent) 38%,white);border-radius:999px;color:var(--control-deep);font-size:9px;font-weight:900;letter-spacing:.08em;padding:3px 6px}.messenger-control-status{color:#526071;margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.messenger-switch{cursor:pointer;display:block;flex:none;height:36px;position:relative;width:66px}.messenger-switch input{height:1px;opacity:0;position:absolute;width:1px}.messenger-switch i{background:var(--control-accent);border:2px solid color-mix(in srgb,var(--control-deep) 45%,white);border-radius:999px;box-shadow:inset 0 1px 1px #00000014,0 2px 5px #17203322;display:block;height:36px;transition:background .18s ease,border-color .18s ease}.messenger-switch i::after{background:linear-gradient(145deg,#fff,#f2f4f7);border:1px solid #d8dee8;border-radius:50%;box-shadow:0 2px 4px #17203333;content:"";height:28px;left:2px;position:absolute;top:2px;transition:transform .18s cubic-bezier(.2,.8,.2,1);width:28px}.messenger-switch input:checked+i::after{transform:translateX(28px)}.messenger-switch input:focus-visible+i{outline:3px solid color-mix(in srgb,var(--control-accent) 42%,white);outline-offset:3px}.messenger-switch input:disabled+i{background:#aab5c3;border-color:#94a3b8;cursor:not-allowed;opacity:.65}.messenger-control-summary{align-items:center;border-top:1px solid color-mix(in srgb,var(--control-accent) 17%,#dbe4ee);display:flex;gap:10px;justify-content:space-between;padding:8px 12px 9px 16px}.messenger-control-summary.is-compact{justify-content:flex-end}.messenger-control-schedule{color:var(--control-deep);font-weight:700;line-height:1.35}.messenger-control-summary-actions{align-items:center;display:flex;gap:4px}.messenger-control-expand,.messenger-control-refresh{align-items:center;background:transparent;border:0;border-radius:7px;color:var(--control-deep);cursor:pointer;display:inline-flex;font:inherit;font-weight:800;gap:4px;padding:6px 7px}.messenger-control-expand:hover,.messenger-control-refresh:hover{background:color-mix(in srgb,var(--control-accent) 10%,white)}.messenger-control-expand:disabled,.messenger-control-refresh:disabled{cursor:not-allowed;opacity:.55}.messenger-control-expand svg{transition:transform .18s ease}.messenger-control-expand[aria-expanded="true"] svg{transform:rotate(180deg)}.messenger-control-refresh{padding:6px}.is-spinning{animation:messenger-control-spin .8s linear infinite}.messenger-control-options{border-top:1px solid color-mix(in srgb,var(--control-accent) 17%,#dbe4ee);padding:11px 16px 12px}.messenger-control-field{align-items:center;display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between}.messenger-control-field span{color:#435166;font-weight:700}.messenger-control-field select,.messenger-control-field input{background:#fff;border:1px solid #cbd5e1;border-radius:8px;color:#172033;font:inherit;padding:7px 9px;max-width:100%}.messenger-control-custom{justify-content:flex-start;margin-top:8px}.messenger-control-custom input{width:110px}.messenger-control-option-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}.messenger-control-save,.messenger-control-activate{border-radius:8px;cursor:pointer;font:inherit;font-weight:850;padding:8px 11px}.messenger-control-save{background:var(--control-accent);border:1px solid var(--control-deep);box-shadow:0 1px 1px #17203322;color:#fff}.messenger-control-activate{background:#fff;border:1px solid color-mix(in srgb,var(--control-accent) 38%,#cbd5e1);color:var(--control-deep)}.messenger-control-save:disabled,.messenger-control-activate:disabled{cursor:not-allowed;opacity:.55}.messenger-control-note{color:#64748b;line-height:1.4;margin:9px 0 0}.messenger-control-error{background:#fff1f2;border-top:1px solid #fecdd3;color:#b42318;margin:0;padding:8px 16px}@keyframes messenger-control-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.messenger-control-hero{padding-left:12px;padding-right:12px}.messenger-control-summary{align-items:flex-start;padding-left:12px}.messenger-control-summary.is-compact{align-items:center}.messenger-control-schedule{max-width:54%}.messenger-control-expand{font-size:11px}.messenger-control-options{padding-left:12px;padding-right:12px}.messenger-control-field{align-items:flex-start;flex-direction:column}.messenger-control-field select{width:100%}}
    `}</style>
  </section>;
}
