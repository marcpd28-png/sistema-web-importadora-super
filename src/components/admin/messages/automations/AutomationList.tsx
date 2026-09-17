"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, RefreshCw, Zap } from "lucide-react";
import { automationRequest, statusLabels } from "./client";
import "./automations.css";

type AutomationPreview = { id: string; name: string; description: string | null; status: string; channel: string; updatedAt: string; _count: { executions: number } };

export function AutomationList() {
  const router = useRouter();
  const [automations, setAutomations] = useState<AutomationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("Atención de Importadora Super");
  const [template, setTemplate] = useState<"welcome" | "sales">("sales");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setAutomations(await automationRequest<AutomationPreview[]>("/api/admin/automations")); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar los flujos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let live = true;
    automationRequest<AutomationPreview[]>("/api/admin/automations")
      .then((items) => { if (live) setAutomations(items); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "No se pudieron cargar los flujos."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setCreating(true); setError("");
    try {
      const data = await automationRequest<{ id: string }>("/api/admin/automations", "POST", { name, template, channel: "WHATSAPP" });
      router.push(`/admin/mensajes/automatizaciones/${data.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo crear el flujo."); setCreating(false); }
  }
  return <div className="automations-workspace">
    <header className="automation-heading">
      <div><p className="automation-eyebrow">ATENCIÓN AL CLIENTE</p><h1>Automatizaciones</h1><p>Configura respuestas, consulta productos y conecta a tus clientes con un asesor.</p></div>
      <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={17} />Nueva automatización</button>
    </header>
    {error && <div className="automation-alert" role="alert">{error} <button className="btn" onClick={() => void load()} disabled={loading || creating}><RefreshCw size={14} />Reintentar carga</button></div>}
    {showCreate && <form className="automation-create" onSubmit={create}>
      <h2>Crear un flujo</h2>
      <fieldset disabled={creating}>
        <label className="automation-field">Nombre<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus /></label>
        <label className="automation-field">Punto de partida<select value={template} onChange={(e) => setTemplate(e.target.value as "welcome" | "sales")}>
          <option value="sales">Atención: bienvenida, productos y asesor</option><option value="welcome">Respuesta de bienvenida</option>
        </select></label>
        <p className="automation-hint">Se creará como borrador. Podrás editarlo y probarlo antes de publicarlo.</p>
        <div className="automation-actions"><button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancelar</button><button className="btn btn-primary" type="submit">{creating ? "Creando…" : "Crear borrador"}<ArrowRight size={16} /></button></div>
      </fieldset>
    </form>}
    {loading ? <p role="status">Cargando automatizaciones…</p> : !error && automations.length === 0 ?
      <div className="automation-empty"><Zap size={38} /><h2>Tu primera atención automática empieza aquí</h2><p>Crea un flujo de bienvenida o parte de una plantilla que consulta productos y deriva a un asesor.</p><button className="btn btn-primary" onClick={() => setShowCreate(true)}>Empezar ahora<ArrowRight size={16} /></button></div>
      : <div className="automation-grid">{automations.map((automation) => <Link className="automation-card" key={automation.id} href={`/admin/mensajes/automatizaciones/${automation.id}`}>
        <div className="automation-card-top"><Zap size={20} /><span className={`automation-status is-${automation.status.toLowerCase()}`}>{statusLabels[automation.status] || automation.status}</span></div>
        <h2>{automation.name}</h2><p>{automation.description || "Flujo de atención por WhatsApp"}</p>
        <div className="automation-card-meta"><span>{automation._count.executions} ejecuciones</span><span>{new Date(automation.updatedAt).toLocaleDateString("es-PE")}</span></div>
        <div className="automation-card-link">Abrir flujo<ArrowRight size={16} /></div>
      </Link>)}</div>}
  </div>;
}
