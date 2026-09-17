"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { contactTemplateValues, renderMessageTemplate, type MessageTemplateItem, type TemplateSelection } from "@/lib/message-templates";

type Props = {
  contact: { name?: string | null; phone?: string | null; phoneNormalized?: string | null };
  hasDraft: boolean;
  onSelect: (content: string, template: TemplateSelection, name: string) => void;
  onClose: () => void;
};

export function TemplatePicker({ contact, hasDraft, onSelect, onClose }: Props) {
  const [items, setItems] = useState<MessageTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<MessageTemplateItem | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/message-templates?active=true", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron cargar las plantillas."); return data; })
      .then((data) => setItems(data.items))
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const preview = selected ? renderMessageTemplate(selected.content, values) : null;
  const unresolved = !!preview && /\{\{|\}\}/.test(preview.content);
  return (
    <section className="template-picker" aria-label="Elegir una plantilla" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="template-section-heading"><h3>Usar plantilla</h3><button className="icon-btn" aria-label="Cerrar plantillas" type="button" onClick={onClose}><X size={18} /></button></div>
      {selected ? <>
        <button className="btn btn-outline" type="button" onClick={() => setSelected(null)}>Volver a la lista</button>
        <h4>{selected.name}</h4>
        <div className="template-variable-fields">{selected.variables.map((name) => <label className="template-field" key={name}>{name}<input value={values[name] ?? ""} maxLength={4000} onChange={(e) => setValues({ ...values, [name]: e.target.value })} placeholder={`Completa ${name}`} /></label>)}</div>
        <p className="template-preview-message">{preview?.content}</p>
        {preview?.missing.length ? <p className="template-hint">Completa: {preview.missing.join(", ")}</p> : null}
        {preview?.tooLong && <p role="alert" className="chat-input-error">El mensaje supera los 4000 caracteres.</p>}
        {hasDraft && <p className="template-hint">Al insertar esta plantilla se reemplazará el borrador actual.</p>}
        <button type="button" className="btn btn-primary" disabled={!preview || !!preview.missing.length || preview.tooLong || unresolved} onClick={() => {
          if (preview) onSelect(preview.content, { id: selected.id, updatedAt: selected.updatedAt, values: Object.fromEntries(selected.variables.map((name) => [name, values[name].trim()])) }, selected.name);
        }}>{hasDraft ? "Reemplazar borrador" : "Insertar en el mensaje"}</button>
      </> : <>
        <input className="template-picker-search" aria-label="Buscar respuesta guardada" placeholder="Buscar plantilla o categoría…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {loading && <p role="status">Cargando plantillas…</p>}
        {error && <p className="chat-input-error" role="alert">{error} <button className="btn btn-outline" onClick={() => { setLoading(true); setError(""); setRetry((n) => n + 1); }}>Reintentar</button></p>}
        <div className="template-picker-list">{items.filter((item) => `${item.name} ${item.category} ${item.content}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))).map((item) => <button key={item.id} type="button" onClick={() => { setSelected(item); setValues(contactTemplateValues(contact)); }}><strong>{item.name}</strong><span>{item.category || "General"} · {item.content}</span></button>)}</div>
        {!loading && !error && !items.some((item) => `${item.name} ${item.category} ${item.content}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))) && <p className="template-hint">{items.length ? "No hay coincidencias." : "Todavía no hay plantillas activas."}</p>}
        <Link href="/admin/mensajes/plantillas" className="template-manage-link">Administrar plantillas</Link>
      </>}
    </section>
  );
}
