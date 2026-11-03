"use client";
import { useCallback, useEffect, useState } from "react";
import { aiRequest, modeLabels } from "./RockyAiPanel";
import type { AiMode, AiChannel, Policies } from "@/lib/rocky-ai/policy";
import styles from "./RockyAi.module.css";

type Config = { enabled: boolean; model: string; dailyRequests: number; dailyTokens: number; maxOutputTokens: number; channelDefaults: Record<AiChannel, AiMode>; policies: Policies; workerSeenAt: string | null; workerError: string | null };
type Dashboard = { config: Config; configured: boolean; messengerSuperBotCompatible: boolean; usage: { _count: number; _sum: { inputTokens: number | null; outputTokens: number | null; reservedTokens: number | null } };
  drafts: { state: string; _count: number }[]; events: { id: string; action: string; actor: string; createdAt: string }[];
  conversations: { id: string; channel: string; externalId: string; mode: AiMode; humanControl: boolean; lastError: string | null }[] };
const channels: AiChannel[] = ["whatsapp", "telegram", "messenger", "instagram", "tiktok"];
const policyLabels: Record<keyof Policies, string> = { hours: "Horarios", shipping: "Envíos", location: "Ubicación", payment: "Medios de pago", returns: "Cambios y devoluciones", pricing: "Reglas de precios" };
export function RockyAiSettings() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null), [form, setForm] = useState<Config | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const refresh = useCallback(async (reset = false) => {
    const response = await fetch("/api/admin/rocky-ai", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setDashboard(data); if (reset) setForm(data.config);
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(true).catch(e => setError(e.message)), 0);
    const timer = setInterval(() => { if (!document.hidden) void refresh().catch(e => setError(e.message)); }, 15000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);
  async function perform(action: unknown, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await aiRequest(action); await refresh(true); setNotice(message); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const channelNames: Record<AiChannel, string> = { whatsapp: "WhatsApp", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", tiktok: "TikTok" };
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1>Super Bot</h1><p className={styles.subtitle}>Tu asistente de ventas</p></div><a href="/admin/mensajes" className={styles.inboxLink}>Ir a mensajes →</a></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!dashboard || !form ? <p>Cargando…</p> : <>
      <div className={styles.statusBar}><span className={styles.statusDot} data-active={dashboard.config.enabled && dashboard.configured} /><strong>{!dashboard.configured ? "OpenAI pendiente" : dashboard.config.enabled ? "Super Bot activo" : "Super Bot apagado"}</strong><button className={styles.textButton} disabled={busy} onClick={() => void refresh().catch(e => setError(e.message))}>Actualizar</button></div>
      <section className={styles.card}>
        <div className={styles.sectionHead}><h2>Canales</h2><label className={styles.activation}><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Activar Super Bot</label></div>
        <div className={styles.channelList}>{channels.map(c => <label className={styles.channelRow} key={c}><span>{channelNames[c]}</span><select aria-label={"Modo de " + channelNames[c]} value={form.channelDefaults[c] || "OFF"} onChange={e => setForm({ ...form, channelDefaults: { ...form.channelDefaults, [c]: e.target.value as AiMode } })}>{Object.entries(modeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>)}</div>
        {form.channelDefaults.messenger !== "OFF" && !dashboard.messengerSuperBotCompatible && <p className={styles.help}>Messenger permanece apagado hasta configurar sus dos accesos privados y MESSENGER_SUPER_BOT_COMPATIBLE=true en el servidor. No actives autoReply de ChatbotX.</p>}
        <div className={styles.channelFoot}><span>Se aplica a conversaciones nuevas.</span><details className={styles.modeHelp}><summary>¿Qué modo elegir?</summary><p><b>Copiloto:</b> tú apruebas cada respuesta.<br /><b>Híbrido:</b> automatiza consultas sencillas.<br /><b>Automático:</b> también prepara cotizaciones.</p></details></div>
      </section>
      <div className={styles.saveBar}><span>{busy ? "Guardando…" : "Los cambios se aplican al guardar."}</span><button disabled={busy} onClick={() => void perform({ action: "settings", settings: form }, "Cambios guardados.")}>Guardar cambios</button></div>
      <details className={styles.fold}><summary>Información del negocio</summary><div className={styles.foldBody}><div className={styles.grid}>{Object.entries(policyLabels).map(([key, label]) => <label className={styles.field} key={key}>{label}<textarea rows={3} maxLength={key === "payment" ? 1200 : 600} placeholder="Lo confirma un asesor" value={form.policies[key as keyof Policies] || ""} onChange={e => setForm({ ...form, policies: { ...form.policies, [key]: e.target.value } })} /></label>)}</div></div></details>
      <details className={styles.fold}><summary>Ajustes avanzados</summary><div className={styles.foldBody}>
        {!dashboard.configured && <p className={styles.help}>Conexión pendiente: configurar OPENAI_API_KEY en el servidor.</p>}
        <p className={styles.help}>Messenger automático usa siempre gpt-6-sol; el modelo de abajo aplica al resto de los canales y al simulador.</p>
        <div className={styles.grid}><label className={styles.field}>Modelo<input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></label>
        <label className={styles.field}>Solicitudes por día<input type="number" min={1} max={10000} value={form.dailyRequests} onChange={e => setForm({ ...form, dailyRequests: Number(e.target.value) })} /></label>
        <label className={styles.field}>Tokens por día<input type="number" min={10000} max={10000000} value={form.dailyTokens} onChange={e => setForm({ ...form, dailyTokens: Number(e.target.value) })} /></label>
        <label className={styles.field}>Tokens por respuesta<input type="number" min={300} max={1500} value={form.maxOutputTokens} onChange={e => setForm({ ...form, maxOutputTokens: Number(e.target.value) })} /></label></div>
        {dashboard.config.workerError && <p className={styles.error}>{dashboard.config.workerError}</p>}
      </div></details>
      <details className={styles.fold}><summary>Actividad <span className={styles.summaryMeta}>{dashboard.usage._count} solicitudes hoy</span></summary><div className={styles.foldBody}>
        <p className={styles.help}>{(dashboard.usage._sum.inputTokens || 0) + (dashboard.usage._sum.outputTokens || 0)} tokens usados · {dashboard.usage._sum.reservedTokens || 0} contabilizados o reservados</p>
        <h3>Conversaciones</h3>{dashboard.conversations.length ? <div className={styles.table}><table><thead><tr><th>Canal</th><th>Conversación</th><th>Modo</th><th>Control</th><th>Estado</th></tr></thead><tbody>{dashboard.conversations.map(c => <tr key={c.id}><td>{channelNames[c.channel as AiChannel] || c.channel}</td><td>{c.externalId}</td><td>{modeLabels[c.mode]}</td><td>{c.humanControl ? "Humano" : "IA"}</td><td>{c.lastError || "Sin errores"}</td></tr>)}</tbody></table></div> : <p className={styles.help}>Todavía no hay conversaciones.</p>}
        <h3>Últimos cambios</h3>{dashboard.events.length ? <div className={styles.table}><table><thead><tr><th>Fecha</th><th>Acción</th><th>Responsable</th></tr></thead><tbody>{dashboard.events.map(e => <tr key={e.id}><td>{new Date(e.createdAt).toLocaleString("es-PE")}</td><td>{e.action}</td><td>{e.actor}</td></tr>)}</tbody></table></div> : <p className={styles.help}>Sin actividad todavía.</p>}
      </div></details>
      <details className={styles.fold}><summary>Probar Super Bot</summary><div className={styles.foldBody}><p className={styles.help}>Abre el laboratorio para conversar con OpenAI y el catálogo actual, sin activar canales ni enviar mensajes a clientes.</p><a className={styles.secondary} href="/admin/mensajes/simulador">Abrir simulador de Super Bot</a></div></details>
      <div className={styles.stopBar}><button className={styles.stopButton} disabled={busy || !dashboard.config.enabled} onClick={() => void perform({ action: "stop" }, "Super Bot detenido. Los envíos ya iniciados pueden completarse.")}>Detener Super Bot</button></div>
    </>}
  </main>;
}
