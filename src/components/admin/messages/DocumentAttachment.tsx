"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, FileText, X } from "lucide-react";
import { documentFilename } from "@/lib/document-filename";

interface Props { src: string; originalUrl: string; caption?: string; }

export function DocumentAttachment({ src, originalUrl, caption }: Props) {
  const name = documentFilename(originalUrl);
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const loaded = useRef<{ url: string; pdf: boolean } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [document, setDocument] = useState<{ url: string; pdf: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => {
    controller.current?.abort();
    if (loaded.current) URL.revokeObjectURL(loaded.current.url);
  }, []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const trigger = opener.current;
    const previous = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => { window.document.body.style.overflow = previous; trigger?.focus(); };
  }, [open]);

  async function load() {
    if (loaded.current) return loaded.current;
    setLoading(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 30_000);
    try {
      const response = await fetch(src, { credentials: "same-origin", signal: abort.signal });
      if (!response.ok) throw new Error("unavailable");
      const blob = await response.blob();
      const signature = await blob.slice(0, 5).text();
      if (abort.signal.aborted) return null;
      if (!blob.size || /text\/html|application\/json/i.test(blob.type)) throw new Error("unavailable");
      const pdf = signature === "%PDF-";
      // A blob URL allows inline viewing even when the authenticated media proxy
      // returns Content-Disposition: attachment. Only PDF content is embedded.
      const file = { url: URL.createObjectURL(pdf ? new Blob([blob], { type: "application/pdf" }) : blob), pdf };
      loaded.current = file; setDocument(file); return file;
    } catch {
      if (controller.current === abort) setError("No se pudo cargar el archivo. Vuelve a intentarlo o ábrelo en otra pestaña.");
      return null;
    } finally { window.clearTimeout(timeout); setLoading(false); }
  }

  async function download() {
    const file = await load();
    if (!file) return;
    const link = window.document.createElement("a");
    link.href = file.url;
    link.download = name === "Documento adjunto" ? (file.pdf ? "documento.pdf" : "documento") : name;
    window.document.body.appendChild(link); link.click(); link.remove();
  }

  const close = () => { dialog.current?.close(); setOpen(false); };
  return <>
    <div className="message-document-card">
      <div className="message-document-heading"><FileText size={24} aria-hidden="true" /><strong>{name}</strong></div>
      {caption && caption !== name ? <span className="message-document-caption">{caption}</span> : null}
      <div className="message-document-actions">
        <button ref={opener} type="button" onClick={() => { setOpen(true); if (!loading) void load(); }}>Ver {document?.pdf || /\.pdf$/i.test(name) ? "PDF" : "documento"}</button>
        <button type="button" disabled={loading} onClick={() => void download()}><Download size={15} aria-hidden="true" /> Descargar</button>
      </div>
      {loading && !open ? <span role="status">Preparando archivo…</span> : null}
      {error && !open ? <span role="alert">{error}</span> : null}
      <a href={src} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña <ExternalLink size={13} aria-hidden="true" /></a>
    </div>
    {open ? createPortal(<dialog ref={dialog} className="message-document-dialog" aria-label={`Vista de ${name}`} onCancel={close} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="message-document-viewer">
        <header><strong>{name}</strong><button type="button" aria-label="Cerrar documento" onClick={close} autoFocus><X size={22} /></button></header>
        <div className="message-document-toolbar">
          <button type="button" disabled={loading} onClick={() => void download()}><Download size={16} /> Descargar</button>
          <a href={src} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a>
        </div>
        {loading ? <p role="status">Cargando documento…</p> : null}
        {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Reintentar</button></div> : null}
        {document?.pdf ? <><p className="message-document-hint">Si tu navegador no muestra el PDF, utiliza Descargar o Abrir en otra pestaña.</p><iframe title={`PDF: ${name}`} src={document.url} /></> : null}
        {document && !document.pdf ? <p>Este formato no tiene vista previa. Puedes descargarlo o abrirlo en otra pestaña.</p> : null}
      </div>
    </dialog>, window.document.body) : null}
  </>;
}
