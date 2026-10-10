"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import type { MessengerControlState } from "@/lib/messenger-control";

export function MessengerControl({ conversationId, disabled, onBusyChange }: { conversationId: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [state, setState] = useState<MessengerControlState | null>(null);
  const [minutes, setMinutes] = useState("15");
  const [customMinutes, setCustomMinutes] = useState("30");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pauseMinutes = Number(minutes === "custom" ? customMinutes : minutes);
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
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    } finally { setBusy(false); onBusyChange(false); }
  }

  async function refreshControl() {
    try { await refresh(); setError(""); }
    catch (e) { setError((e as Error).message); setOpen(true); }
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
    : "Sin reactivación programada";
  const stateLabel = !state ? "Cargando" : metaActive ? "Activa" : "Pausada";

  return <section className={`messenger-control ${metaActive ? "is-active" : "is-paused"}`} aria-label="Control de la IA de Meta">
    <div className="messenger-control-launcher">
      <button className="messenger-control-open" type="button" aria-expanded={open} aria-controls="messenger-control-options" onClick={() => setOpen(value => !value)} disabled={busy || disabled}>
        <span className="messenger-control-name">IA de Meta</span>
        <span className="messenger-control-state">{stateLabel}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <label className="messenger-switch" title={metaActive ? "Pausar la IA de Meta" : "Activar la IA de Meta"}>
        <input aria-label="Activar o pausar la IA de Meta" checked={metaActive} disabled={unavailable || (!metaActive && !state.metaAiAvailable)} onChange={event => void change(event.target.checked ? "meta" : "manual")} type="checkbox" />
        <i aria-hidden="true" />
      </label>
    </div>

    {open && <div className="messenger-control-popover" id="messenger-control-options" role="dialog" aria-label="Configuración de la IA de Meta">
      <div className="messenger-control-popover-heading">
        <div><strong>IA de Meta</strong><span>{ownership}</span></div>
        <button className="messenger-control-refresh" type="button" aria-label="Actualizar estado de Messenger" title="Actualizar estado" disabled={busy} onClick={() => void refreshControl()}><RefreshCw size={15} className={busy ? "is-spinning" : ""} aria-hidden="true" /></button>
      </div>
      <p className="messenger-control-schedule">{schedule}</p>
      <label className="messenger-control-field">
        <span>Al pausar, reactivar la IA</span>
        <select value={minutes} disabled={busy || disabled} onChange={e => setMinutes(e.target.value)}>
          <option value="15">En 15 minutos</option><option value="30">En 30 minutos</option><option value="60">En 1 hora</option><option value="240">En 4 horas</option><option value="1440">En 24 horas</option><option value="0">Solo cuando yo la active</option><option value="custom">Tiempo personalizado</option>
        </select>
      </label>
      {minutes === "custom" && <label className="messenger-control-field messenger-control-custom"><span>Minutos</span><input type="number" min="1" max="10080" value={customMinutes} disabled={busy || disabled} onChange={e => setCustomMinutes(e.target.value)} /></label>}
      <div className="messenger-control-option-actions">
        <button className="messenger-control-save" type="button" disabled={busy || disabled || !validPause} onClick={() => void change("manual")}>{busy ? "Aplicando…" : "Pausar y programar"}</button>
        {!metaActive && <button className="messenger-control-activate" type="button" disabled={busy || disabled || !state?.metaAiAvailable} onClick={() => void change("meta", 0)}>Activar ahora</button>}
      </div>
      <p className="messenger-control-note">Cada respuesta manual pausa la IA y reinicia este plazo.</p>
      {(error || state?.error) && <p className="messenger-control-error" role="alert">{error || state?.error}</p>}
    </div>}

    <style jsx>{`
      .messenger-control{--control-accent:#dc2626;--control-deep:#991b1b;position:relative;z-index:12;font-size:12px}.messenger-control.is-active{--control-accent:#16a34a;--control-deep:#166534}.messenger-control-launcher{align-items:center;border:1px solid color-mix(in srgb,var(--control-accent) 32%,#cbd5e1);border-radius:999px;background:#fff;box-shadow:0 1px 2px #17203312;display:flex;height:34px;padding:2px 3px 2px 9px}.messenger-control-open{align-items:center;background:transparent;border:0;color:#334155;cursor:pointer;display:flex;font:inherit;font-weight:800;gap:5px;min-width:0;padding:0}.messenger-control-open:disabled{cursor:not-allowed;opacity:.55}.messenger-control-name{white-space:nowrap}.messenger-control-state{border-radius:999px;background:color-mix(in srgb,var(--control-accent) 13%,white);color:var(--control-deep);font-size:9px;font-weight:900;letter-spacing:.04em;padding:3px 5px;text-transform:uppercase}.messenger-control-open svg{transition:transform .18s ease}.messenger-control-open[aria-expanded="true"] svg{transform:rotate(180deg)}.messenger-switch{cursor:pointer;display:block;flex:none;height:26px;margin-left:7px;position:relative;width:48px}.messenger-switch input{height:1px;opacity:0;position:absolute;width:1px}.messenger-switch i{background:var(--control-accent);border:1px solid color-mix(in srgb,var(--control-deep) 48%,white);border-radius:999px;box-shadow:inset 0 1px 1px #00000014;display:block;height:26px;transition:background .18s ease}.messenger-switch i::after{background:linear-gradient(145deg,#fff,#f2f4f7);border:1px solid #d8dee8;border-radius:50%;box-shadow:0 1px 3px #17203333;content:"";height:20px;left:2px;position:absolute;top:2px;transition:transform .18s cubic-bezier(.2,.8,.2,1);width:20px}.messenger-switch input:checked+i::after{transform:translateX(20px)}.messenger-switch input:focus-visible+i{outline:3px solid color-mix(in srgb,var(--control-accent) 42%,white);outline-offset:2px}.messenger-switch input:disabled+i{background:#aab5c3;border-color:#94a3b8;cursor:not-allowed;opacity:.65}.messenger-control-popover{position:absolute;right:0;top:calc(100% + 8px);width:min(360px,calc(100vw - 32px));border:1px solid color-mix(in srgb,var(--control-accent) 32%,#cbd5e1);border-radius:12px;background:#fff;box-shadow:0 16px 34px #1720332b;color:#334155;overflow:hidden}.messenger-control-popover-heading{align-items:flex-start;background:color-mix(in srgb,var(--control-accent) 7%,white);display:flex;justify-content:space-between;padding:12px 12px 9px}.messenger-control-popover-heading strong{color:#172033;display:block;font-size:13px}.messenger-control-popover-heading span{color:#64748b;display:block;margin-top:2px}.messenger-control-refresh{align-items:center;background:transparent;border:0;border-radius:7px;color:var(--control-deep);cursor:pointer;display:flex;padding:5px}.messenger-control-refresh:hover{background:color-mix(in srgb,var(--control-accent) 10%,white)}.messenger-control-refresh:disabled{cursor:not-allowed;opacity:.55}.is-spinning{animation:messenger-control-spin .8s linear infinite}.messenger-control-schedule{border-bottom:1px solid #e5e7eb;color:var(--control-deep);font-weight:750;margin:0;padding:8px 12px}.messenger-control-field{align-items:center;display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin:11px 12px 0}.messenger-control-field span{font-weight:700}.messenger-control-field select,.messenger-control-field input{background:#fff;border:1px solid #cbd5e1;border-radius:8px;color:#172033;font:inherit;padding:7px 9px;max-width:100%}.messenger-control-custom{justify-content:flex-start}.messenger-control-custom input{width:110px}.messenger-control-option-actions{display:flex;flex-wrap:wrap;gap:7px;margin:11px 12px 0}.messenger-control-save,.messenger-control-activate{border-radius:8px;cursor:pointer;font:inherit;font-weight:850;padding:8px 11px}.messenger-control-save{background:var(--control-accent);border:1px solid var(--control-deep);box-shadow:0 1px 1px #17203322;color:#fff}.messenger-control-activate{background:#fff;border:1px solid color-mix(in srgb,var(--control-accent) 38%,#cbd5e1);color:var(--control-deep)}.messenger-control-save:disabled,.messenger-control-activate:disabled{cursor:not-allowed;opacity:.55}.messenger-control-note{color:#64748b;line-height:1.4;margin:9px 12px 11px}.messenger-control-error{background:#fff1f2;border-top:1px solid #fecdd3;color:#b42318;margin:0;padding:8px 12px}@keyframes messenger-control-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.messenger-control-name{display:none}.messenger-control-launcher{padding-left:5px}.messenger-control-open{gap:2px}.messenger-control-popover{right:-2px;width:min(340px,calc(100vw - 16px))}.messenger-control-field{align-items:flex-start;flex-direction:column}.messenger-control-field select{width:100%}}
    `}</style>
  </section>;
}
