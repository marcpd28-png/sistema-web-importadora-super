"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Copy, FileText, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { extractTemplateVariables, messageTemplateSchema, renderMessageTemplate, TEMPLATE_CONTENT_LIMIT, type MessageTemplateItem } from "@/lib/message-templates";

const API = "/api/admin/message-templates";
type Draft = { id?: string; name: string; category: string; content: string; isActive: boolean };
const emptyDraft: Draft = { name: "", category: "", content: "", isActive: true };

async function requestTemplates(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data;
}

function TemplateEditor({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(initial);
  const [samples, setSamples] = useState<Record<string, string>>({ nombre: "María", telefono: "51999999999" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const validation = useMemo(() => {
    try { return { variables: extractTemplateVariables(draft.content), error: "" }; }
    catch (error) { return { variables: [], error: (error as Error).message }; }
  }, [draft.content]);
  const preview = validation.error ? null : renderMessageTemplate(draft.content, samples);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsed = messageTemplateSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setSaving(true);
    setError("");
    try {
      await requestTemplates(initial.id ? `${API}/${initial.id}` : API, {
        method: initial.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      await onSaved();
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <section className="template-editor" aria-labelledby="template-editor-title">
      <div className="template-section-heading">
        <div><p className="eyebrow">Respuesta guardada</p><h2 id="template-editor-title">{initial.id ? "Editar plantilla" : "Nueva plantilla"}</h2></div>
        <button className="icon-btn" type="button" aria-label="Cerrar editor" disabled={saving} onClick={onClose}><X size={20} /></button>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={saving} className="template-fieldset">
          <label className="template-field">Nombre<input ref={nameRef} required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. Bienvenida al cliente" /></label>
          <label className="template-field">Categoría<input maxLength={60} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Ej. Ventas, Envíos o Seguimiento" /></label>
          <label className="template-field">Mensaje<textarea required rows={7} maxLength={TEMPLATE_CONTENT_LIMIT} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Hola {{nombre}}, gracias por comunicarte con Importaciones Super. ¿Qué producto buscas?" aria-describedby="template-variable-help" /></label>
          <div className="template-hint" id="template-variable-help">Usa <code>{"{{nombre}}"}</code> y <code>{"{{telefono}}"}</code> para datos del contacto. Agrega otras variables, como <code>{"{{producto}}"}</code>, para completarlas antes de usar la respuesta.</div>
          <span className="template-hint">{draft.content.length} / {TEMPLATE_CONTENT_LIMIT} caracteres · Hasta 20 variables</span>
          <label className="template-checkbox"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />Disponible para usar en conversaciones y automatizaciones</label>
          <div className="template-preview-panel">
            <h3>Vista previa</h3>
            {validation.variables.length > 0 && <p className="template-hint">Estos valores son de ejemplo; no se guardan en la plantilla.</p>}
            <div className="template-variable-fields">
              {validation.variables.map((name) => <label className="template-field" key={name}>{name}<input value={samples[name] ?? ""} maxLength={TEMPLATE_CONTENT_LIMIT} onChange={(e) => setSamples({ ...samples, [name]: e.target.value })} placeholder={`Ejemplo para ${name}`} /></label>)}
            </div>
            <p className="template-preview-message">{preview?.content || "Tu respuesta aparecerá aquí."}</p>
            {preview?.tooLong && <p className="chat-input-error">El ejemplo supera los 4000 caracteres. Acorta el mensaje o los valores.</p>}
          </div>
          {(error || validation.error) && <p role="alert" className="chat-input-error">{error || validation.error}</p>}
          <div className="template-actions"><button className="btn btn-outline" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={!!validation.error}>{saving ? <Loader2 className="animate-spin" size={16} /> : null}{saving ? "Guardando…" : "Guardar plantilla"}</button></div>
        </fieldset>
      </form>
    </section>
  );
}

export function TemplatesWorkspace() {
  const [items, setItems] = useState<MessageTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await requestTemplates(API);
    setItems(data.items);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    requestTemplates(API, { signal: controller.signal }).then((data) => setItems(data.items))
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
  const filtered = items.filter((item) => (!category || item.category === category)
    && (!status || item.isActive === (status === "active"))
    && `${item.name} ${item.category} ${item.content}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));

  const edit = (value: Draft) => { setDraft(value); setEditorVersion((n) => n + 1); setNotice(""); };
  const mutate = async (item: MessageTemplateItem, remove: boolean) => {
    setBusyId(item.id); setError(""); setNotice("");
    try {
      await requestTemplates(`${API}/${item.id}`, {
        method: remove ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        ...(remove ? {} : { body: JSON.stringify({ ...item, isActive: !item.isActive }) }),
      });
      setDeleteId(null);
      if (draft?.id === item.id) setDraft(null);
      setNotice(remove ? "Plantilla eliminada." : item.isActive ? "Plantilla desactivada." : "Plantilla activada.");
      await load();
    } catch (error) { setError((error as Error).message); }
    finally { setBusyId(null); }
  };

  return (
    <div className="templates-workspace">
      <header className="messages-page-header"><div><p className="eyebrow">Respuestas rápidas</p><h1>Plantillas de respuesta</h1><p>Prepara tus mensajes frecuentes y personalízalos para cada cliente.</p></div><button className="btn btn-primary" onClick={() => edit(emptyDraft)} disabled={draft !== null}><Plus size={17} />Nueva plantilla</button></header>
      <p className="template-intro">Las plantillas activas están disponibles en la bandeja y para n8n. Guardar una plantilla no envía mensajes ni activa automatizaciones.</p>
      <div className="template-toolbar">
        <label className="template-search"><Search size={17} /><input aria-label="Buscar plantillas" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o mensaje…" /></label>
        <select aria-label="Filtrar por categoría" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Todas las categorías</option>{categories.map((name) => <option key={name}>{name}</option>)}</select>
        <select aria-label="Filtrar por estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos los estados</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select>
        <span className="template-hint">{items.filter((item) => item.isActive).length} activas · {items.length} en total</span>
      </div>
      {notice && <p role="status" className="template-notice">{notice}</p>}
      {error && <div role="alert" className="chat-input-error">{error} <button className="btn btn-outline" onClick={() => { setError(""); void load().catch((err: Error) => setError(err.message)); }}>Volver a cargar</button></div>}
      <div className={`template-layout${draft ? " is-editing" : ""}`}>
        <div className="template-grid">
          {loading ? <p role="status">Cargando plantillas…</p> : filtered.map((item) => (
            <article className="template-card" key={item.id}>
              <div className="template-section-heading"><h2>{item.name}</h2><span className={`template-status${item.isActive ? " is-active" : ""}`}>{item.isActive ? "Activa" : "Inactiva"}</span></div>
              <span className="template-hint">{item.category || "Sin categoría"}</span>
              <p className="template-card-content">{item.content}</p>
              {item.variables.length > 0 && <div className="template-tags">{item.variables.map((name) => <code key={name}>{`{{${name}}}`}</code>)}</div>}
              <span className="template-hint">Actualizada el {new Date(item.updatedAt).toLocaleDateString("es-PE")}</span>
              <div className="template-card-actions">
                <button className="btn btn-outline" disabled={busyId !== null || draft !== null} onClick={() => edit(item)}><Pencil size={14} />Editar</button>
                <button className="btn btn-outline" disabled={busyId !== null || draft !== null} onClick={() => edit({ ...item, id: undefined, name: `${item.name.slice(0, 110)} (copia)` })}><Copy size={14} />Duplicar</button>
                <button className="btn btn-outline" disabled={busyId !== null || draft !== null} onClick={() => void mutate(item, false)}>{item.isActive ? "Desactivar" : "Activar"}</button>
                <button className="icon-btn" aria-label={`Eliminar ${item.name}`} disabled={busyId !== null || draft !== null} onClick={() => setDeleteId(item.id)}><Trash2 size={16} /></button>
              </div>
              {deleteId === item.id && <div className="template-delete-confirm"><p>¿Eliminar “{item.name}”? Puedes desactivarla si quieres conservarla.</p><div className="template-actions"><button className="btn btn-outline" disabled={busyId !== null} onClick={() => setDeleteId(null)}>Cancelar</button><button className="btn btn-danger" disabled={busyId !== null} onClick={() => void mutate(item, true)}>Eliminar plantilla</button></div></div>}
            </article>
          ))}
          {!loading && !error && filtered.length === 0 && <div className="template-empty"><FileText size={36} /><h2>{items.length ? "No hay coincidencias" : "Tu primera respuesta guardada"}</h2><p>{items.length ? "Prueba otra búsqueda o cambia los filtros." : "Crea una bienvenida, una respuesta de envíos o un seguimiento de cotización."}</p>{!items.length && <button className="btn btn-outline" disabled={draft !== null} onClick={() => edit({ ...emptyDraft, name: "Bienvenida", category: "Atención", content: "Hola {{nombre}}, gracias por comunicarte con Importaciones Super. ¿Qué producto estás buscando?" })}>Empezar con una bienvenida</button>}</div>}
        </div>
        {draft && <TemplateEditor key={editorVersion} initial={draft} onClose={() => setDraft(null)} onSaved={async () => { setDraft(null); setNotice("Plantilla guardada."); try { await load(); } catch (error) { setError((error as Error).message); } }} />}
      </div>
    </div>
  );
}
