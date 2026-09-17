"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, FlaskConical, Pause, Play, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { createFlowNode, createFlowTemplate, flowSchema, nodeLabels, validateFlow, type FlowDefinition, type FlowNodeData, type NodeKind } from "@/lib/automations/flow-definition";
import type { FlowRunResult } from "@/lib/automations/flow-runtime";
import { FlowCanvas } from "./FlowCanvas";
import { automationRequest, statusLabels, type AutomationData } from "./client";
import "./automations.css";

function snapshot(name: string, description: string, flow: FlowDefinition) {
  return JSON.stringify({ name, description, flow: flowSchema.parse(flow) });
}

export function AutomationEditor({ automationId }: { automationId: string }) {
  const [data, setData] = useState<AutomationData | null>(null);
  const [flow, setFlow] = useState<FlowDefinition>({ nodes: [], edges: [] });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "test" | "activity">("edit");
  const [nodeType, setNodeType] = useState<NodeKind>("sendMessage");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testName, setTestName] = useState("María");
  const [testMessage, setTestMessage] = useState("Hola");
  const [testResult, setTestResult] = useState<FlowRunResult | null>(null);
  const [testedMessage, setTestedMessage] = useState("");
  const [testedSnapshot, setTestedSnapshot] = useState("");
  const baseUrl = `/api/admin/automations/${automationId}`;

  const hydrate = useCallback((fresh: AutomationData) => {
    const draft = fresh.versions.find((v) => v.status === "DRAFT");
    if (!draft) throw new Error("Este flujo no tiene un borrador editable.");
    const parsed = flowSchema.parse(draft.flowDefinition);
    const nextFlow = parsed.nodes.length ? parsed : createFlowTemplate();
    setData(fresh); setName(fresh.name); setDescription(fresh.description || ""); setFlow(nextFlow);
    setSavedSnapshot(snapshot(fresh.name, fresh.description || "", parsed));
  }, []);

  useEffect(() => {
    let live = true;
    automationRequest<AutomationData>(baseUrl).then((fresh) => { if (live) hydrate(fresh); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "No se pudo cargar el flujo."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [baseUrl, hydrate]);

  const currentSnapshot = snapshot(name, description, flow);
  const dirty = Boolean(data && savedSnapshot !== currentSnapshot);
  const selected = flow.nodes.find((n) => n.id === selectedId);
  const validation = validateFlow(flow);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function operate(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la operación."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function save() {
    const draft = data?.versions.find((v) => v.status === "DRAFT");
    if (!draft) throw new Error("No hay un borrador disponible.");
    const fresh = await automationRequest<AutomationData>(baseUrl, "PATCH", {
      name, description, draftVersionId: draft.id, currentVersionNumber: draft.version, flowDefinition: flow,
    });
    hydrate(fresh); return fresh;
  }
  function editNode(patch: Partial<FlowNodeData>) {
    setFlow((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node) }));
  }
  function showInspector(nextTab: "edit" | "test" | "activity") {
    setTab(nextTab);
    if (window.matchMedia("(max-width: 1200px)").matches) inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function addNode() {
    const node = createFlowNode(nodeType, `node-${crypto.randomUUID()}`, 250, Math.max(0, ...flow.nodes.map((n) => n.position.y)) + 190);
    setFlow((current) => ({ ...current, nodes: [...current.nodes, node] })); setSelectedId(node.id); setTab("edit");
  }
  function removeNode() {
    setFlow((current) => ({ nodes: current.nodes.filter((n) => n.id !== selectedId), edges: current.edges.filter((e) => e.source !== selectedId && e.target !== selectedId) }));
    setSelectedId(null);
  }
  function updateActivity(fresh: AutomationData) {
    setData((current) => current ? { ...current, status: fresh.status, currentPublishedVersionId: fresh.currentPublishedVersionId, executions: fresh.executions, configuration: fresh.configuration } : fresh);
  }

  if (loading) return <div className="automations-workspace" role="status">Cargando flujo…</div>;
  if (!data) return <div className="automations-workspace"><p role="alert">{error}</p><Link className="btn" href="/admin/mensajes/automatizaciones">Volver a automatizaciones</Link></div>;
  const draft = data.versions.find((v) => v.status === "DRAFT");
  return <div className="automation-editor">
    <header className="automation-editor-heading">
      <div className="automation-editor-title"><Link className="automation-back" href="/admin/mensajes/automatizaciones" aria-label="Volver a automatizaciones" onClick={(event) => { if (dirty) { event.preventDefault(); setError("Guarda el borrador antes de salir. También puedes descartar los cambios desde el panel de edición."); } }}><ArrowLeft size={20} /></Link>
        <div><h1>{data.name}</h1><p><span className={`automation-status is-${data.status.toLowerCase()}`}>{statusLabels[data.status] || data.status}</span> · {dirty ? "Cambios sin guardar" : `Borrador guardado · revisión ${draft?.version}`}</p></div>
      </div>
      <div className="automation-actions">
        <button className="btn" disabled={busy} onClick={() => void operate(async () => { await save(); setNotice("Borrador guardado."); })}><Save size={16} />Guardar</button>
        <button className="btn" disabled={busy} onClick={() => showInspector("test")}><FlaskConical size={16} />Probar</button>
        <button className="btn btn-primary" disabled={busy || validation.length > 0 || !data.configuration.publishReady} onClick={() => void operate(async () => {
          const fresh = await save();
          const savedDraft = fresh.versions.find((v) => v.status === "DRAFT")!;
          hydrate(await automationRequest<AutomationData>(`${baseUrl}/publish`, "POST", { draftVersionId: savedDraft.id, currentVersionNumber: savedDraft.version }));
          setNotice("Versión publicada y pausada. Actívala cuando esté lista para atender clientes.");
        })}><Upload size={16} />Publicar</button>
        {data.currentPublishedVersionId && <button className="btn" disabled={busy || (data.status !== "ACTIVE" && (!data.configuration.liveEnabled || dirty))} onClick={() => void operate(async () => {
          const status = data.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
          updateActivity(await automationRequest<AutomationData>(`${baseUrl}/status`, "POST", { status }));
          setNotice(status === "ACTIVE" ? "La versión publicada está activa en WhatsApp." : "Atención automática pausada.");
        })}>{data.status === "ACTIVE" ? <Pause size={16} /> : <Play size={16} />}{data.status === "ACTIVE" ? "Pausar" : "Activar"}</button>}
      </div>
    </header>
    <div className="automation-feedback" aria-live="polite">
      {busy && <p role="status">Procesando…</p>}
      {error && <div className="automation-alert" role="alert">{error}</div>}
      {notice && <div className="automation-notice"><Check size={16} />{notice}</div>}
      {!data.configuration.liveEnabled && <p className="automation-mode">Modo de pruebas: la atención de clientes por WhatsApp está deshabilitada en este entorno.</p>}
      {!data.configuration.publishReady && <p className="automation-hint">Puedes editar y probar. Para publicar falta configurar: {data.configuration.missing.join(", ")}.</p>}
    </div>
    <div className="automation-builder">
      <div className="automation-diagram">
        <div className="automation-toolbar">
          <select aria-label="Tipo de bloque" value={nodeType} disabled={busy} onChange={(e) => setNodeType(e.target.value as NodeKind)}>
            {Object.entries(nodeLabels).filter(([kind]) => kind !== "trigger").map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select>
          <button className="btn" disabled={busy || flow.nodes.length >= 24} onClick={addNode}><Plus size={16} />Añadir bloque</button>
        </div>
        <FlowCanvas flow={flow} onChange={setFlow} onSelect={(id) => { setSelectedId(id); if (id) showInspector("edit"); }} disabled={busy} />
        <p className="automation-canvas-hint">Selecciona un bloque para configurarlo. Arrastra desde sus puntos para conectarlo. Supr elimina la selección.</p>
      </div>
      <aside className="automation-inspector" ref={inspectorRef}>
        <div className="automation-tabs" role="tablist" aria-label="Panel del flujo">
          {([['edit', 'Editar'], ['test', 'Probar'], ['activity', 'Actividad']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
        </div>
        <div className="automation-inspector-body" role="tabpanel">
          {tab === "edit" && <fieldset disabled={busy}>
            <h2>{selected ? "Configurar bloque" : "Datos del flujo"}</h2>
            {selected ? <>
              <label className="automation-field">Nombre del bloque<input maxLength={80} value={selected.data.label || ""} onChange={(e) => editNode({ label: e.target.value })} /></label>
              {selected.type === "trigger" && <label className="automation-field">Iniciar cuando<select value={selected.data.matchMode || "always"} onChange={(e) => editNode({ matchMode: e.target.value as "always" | "keyword" })}><option value="always">Llega cualquier mensaje de texto</option><option value="keyword">El mensaje contiene palabras clave</option></select></label>}
              {(selected.type === "condition" || (selected.type === "trigger" && selected.data.matchMode === "keyword")) && <label className="automation-field">Palabras o frases clave<textarea rows={3} maxLength={500} value={selected.data.keywords || ""} onChange={(e) => editNode({ keywords: e.target.value })} /><span className="automation-hint">Sepáralas por comas. Coincide si aparece cualquiera de ellas.</span></label>}
              {(selected.type === "sendMessage" || selected.type === "handoff") && <label className="automation-field">Respuesta al cliente<textarea rows={7} maxLength={3000} value={selected.data.messageContent || ""} onChange={(e) => editNode({ messageContent: e.target.value })} /><span className="automation-hint">Variables disponibles: {"{{nombre}}"} y {"{{mensaje}}"}.</span></label>}
              {selected.type === "catalog" && <>
                <label className="automation-field">Buscar productos<input maxLength={120} value={selected.data.query || ""} onChange={(e) => editNode({ query: e.target.value })} /><span className="automation-hint">Usa {"{{mensaje}}"} para buscar lo que escribió el cliente, o indica un nombre o código.</span></label>
                <label className="automation-field">Máximo de resultados<select value={selected.data.limit || 3} onChange={(e) => editNode({ limit: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} productos</option>)}</select></label>
                <p className="automation-hint">Consulta el catálogo publicado e incluye precios, stock y enlaces a los productos.</p>
              </>}
              {selected.type === "handoff" && <p className="automation-hint">Marca la conversación como «Requiere asesor», apaga el bot y termina este flujo.</p>}
              <div className="automation-actions"><button className="btn" onClick={() => setSelectedId(null)}>Datos del flujo</button>{selected.type !== "trigger" && <button className="btn automation-danger" onClick={removeNode}><Trash2 size={14} />Eliminar</button>}</div>
            </> : <>
              <label className="automation-field">Nombre<input maxLength={100} required value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="automation-field">Descripción<textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              <p className="automation-hint">Cada mensaje de texto inicia un recorrido. Las condiciones evalúan ese mensaje; el flujo no espera respuestas entre bloques.</p>
              <button className="btn" onClick={() => void operate(async () => { hydrate(await automationRequest<AutomationData>(baseUrl)); setSelectedId(null); })}>{dirty ? "Descartar cambios y recargar" : "Recargar borrador"}</button>
            </>}
            <div className="automation-validation"><h3>Revisión del flujo</h3>{validation.length ? <ul>{validation.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p><Check size={15} /> Conexiones listas para probar.</p>}</div>
            <div className="automation-step-list"><h3>Bloques del flujo</h3>{flow.nodes.map((node) => <button className="btn" key={node.id} onClick={() => setSelectedId(node.id)}>{node.data.label || nodeLabels[node.type!]}</button>)}</div>
            <div className="automation-connections"><h3>Conexiones</h3>{flow.edges.map((edge) => <div key={edge.id}><span>{flow.nodes.find((n) => n.id === edge.source)?.data.label || edge.source}{edge.sourceHandle ? ` (${edge.sourceHandle === "yes" ? "Sí" : "No"})` : ""} → {flow.nodes.find((n) => n.id === edge.target)?.data.label || edge.target}</span><button aria-label="Eliminar conexión" onClick={() => setFlow((current) => ({ ...current, edges: current.edges.filter((e) => e.id !== edge.id) }))}><Trash2 size={14} /></button></div>)}</div>
          </fieldset>}
          {tab === "test" && <>
            <h2>Probar el borrador</h2><p className="automation-hint">Usa los cambios actuales y datos reales del catálogo. No envía mensajes ni crea pedidos.</p>
            <form onSubmit={(event) => { event.preventDefault(); void operate(async () => {
              setTestResult(null);
              const result = await automationRequest<FlowRunResult>(`${baseUrl}/simulate`, "POST", { name: testName, message: testMessage, flowDefinition: flow });
              setTestResult(result); setTestedMessage(testMessage); setTestedSnapshot(currentSnapshot);
            }); }}><fieldset disabled={busy}>
              <label className="automation-field">Nombre del cliente<input required maxLength={120} value={testName} onChange={(e) => setTestName(e.target.value)} /></label>
              <label className="automation-field">Mensaje del cliente<textarea required rows={3} maxLength={1200} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} /></label>
              <button type="submit" className="btn btn-primary" disabled={validation.length > 0}><Play size={16} />Ejecutar prueba</button>
              {validation.length > 0 && <p className="automation-hint">Corrige las conexiones indicadas en Editar para probar.</p>}
            </fieldset></form>
            {testResult && <div className="automation-test-result" aria-live="polite">
              {testedSnapshot !== currentSnapshot && <p className="automation-hint">El flujo cambió después de esta prueba. Ejecútala otra vez.</p>}
              <p className="automation-test-customer">{testedMessage}</p>
              {!testResult.matched && <p>El mensaje no coincide con las palabras clave del inicio.</p>}
              {testResult.replies.map((reply) => <p className="automation-test-bot" key={reply.nodeId}>{reply.content}</p>)}
              {testResult.handoff && <p className="automation-notice">La conversación se derivaría a un asesor y el bot se pausaría.</p>}
              <p className="automation-hint">Recorrido: {testResult.visited.map((id) => flow.nodes.find((n) => n.id === id)?.data.label || id).join(" → ") || "Sin iniciar"}</p>
            </div>}
          </>}
          {tab === "activity" && <>
            <div className="automation-card-top"><h2>Ejecuciones recientes</h2><button className="btn" aria-label="Actualizar actividad" disabled={busy} onClick={() => void operate(async () => { updateActivity(await automationRequest<AutomationData>(baseUrl)); })}><RefreshCw size={16} /></button></div>
            <p className="automation-hint">La prueba del borrador no registra atención real.</p>
            {data.executions.length === 0 && <p>Todavía no hay ejecuciones publicadas.</p>}
            {data.executions.map((execution) => <div className="automation-execution" key={execution.id}><span className={`automation-status is-${execution.status.toLowerCase()}`}>{statusLabels[execution.status] || execution.status}</span><time>{new Date(execution.startedAt).toLocaleString("es-PE")}</time>{execution.error && <p>{execution.error}</p>}</div>)}
          </>}
        </div>
      </aside>
    </div>
  </div>;
}
