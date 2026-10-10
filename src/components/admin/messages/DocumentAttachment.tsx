"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Expand, FileText, X, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { documentAttachmentName } from "@/lib/document-filename";
import { PdfPage } from "./PdfPage";

interface Props { src: string; originalUrl: string; caption?: string; metadata?: unknown; }
type LoadedDocument = { url: string; pdf: boolean; pages?: PDFDocumentProxy; size: number; remote?: boolean };

export function DocumentAttachment({ src, originalUrl, caption, metadata }: Props) {
  const name = documentAttachmentName(originalUrl, metadata);
  const isPdf = /\.pdf$/i.test(name);
  const isTelegram = Boolean(metadata && typeof metadata === "object" && "provider" in metadata && metadata.provider === "telegram");
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const task = useRef<PDFDocumentLoadingTask | null>(null);
  const pending = useRef<Promise<LoadedDocument | null> | null>(null);
  const loaded = useRef<LoadedDocument | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      void task.current?.destroy().catch(() => {});
      if (loaded.current) URL.revokeObjectURL(loaded.current.url);
      loaded.current = null; pending.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const trigger = opener.current;
    const previous = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    return () => { window.document.body.style.overflow = previous; trigger?.focus(); };
  }, [open]);

  const load = useCallback((): Promise<LoadedDocument | null> => {
    if (loaded.current) return Promise.resolve(loaded.current);
    if (pending.current) return pending.current;
    setLoading(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 30_000);
    pending.current = (async () => {
      let objectUrl: string | undefined;
      try {
        const response = await fetch(src, { credentials: "same-origin", signal: abort.signal });
        if (!response.ok) throw new Error("unavailable");
        const size = Number(response.headers.get("content-length"));
        if (isTelegram && size > 25 * 1024 * 1024) {
          await response.body?.cancel();
          if (!mounted.current || abort.signal.aborted) return null;
          const file: LoadedDocument = { url: src, pdf: isPdf, size, remote: true };
          loaded.current = file; setDocument(file); return file;
        }
        const blob = await response.blob();
        const signature = await blob.slice(0, 5).text();
        if (!blob.size || /text\/html|application\/json/i.test(blob.type)) throw new Error("unavailable");
        const pdf = signature === "%PDF-";
        if (!mounted.current || abort.signal.aborted) return null;
        objectUrl = URL.createObjectURL(pdf ? new Blob([blob], { type: "application/pdf" }) : blob);
        const file: LoadedDocument = { url: objectUrl, pdf, size: blob.size };
        if (pdf) {
          try {
            const pdfjs = await import("pdfjs-dist");
            const assets = `/pdfjs/${pdfjs.version}/`;
            pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
            if (!mounted.current || abort.signal.aborted) { URL.revokeObjectURL(objectUrl); return null; }
            const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/` });
            task.current = loadingTask;
            abort.signal.addEventListener("abort", () => { void loadingTask.destroy().catch(() => {}); }, { once: true });
            file.pages = await loadingTask.promise;
          } catch {
            if (mounted.current && !abort.signal.aborted) setError("No se pudo mostrar este PDF. Puede estar protegido o dañado; puedes descargarlo para abrirlo.");
          }
        }
        if (!mounted.current || abort.signal.aborted) { URL.revokeObjectURL(objectUrl); return null; }
        loaded.current = file; setDocument(file); return file;
      } catch {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (mounted.current && controller.current === abort) setError("No se pudo cargar el archivo. Intenta nuevamente o ábrelo en otra pestaña.");
        return null;
      } finally {
        window.clearTimeout(timeout);
        if (controller.current === abort) {
          pending.current = null;
          if (mounted.current) {
            setLoading(false);
            if (abort.signal.aborted) setError("El archivo tardó demasiado en cargar. Vuelve a intentarlo.");
          }
        }
      }
    })();
    return pending.current;
  }, [src, isTelegram, isPdf]);

  useEffect(() => {
    if (!card.current || !isPdf) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { observer.disconnect(); void load(); }
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [isPdf, load]);

  async function download() {
    const file = await load();
    if (!file) return;
    const link = window.document.createElement("a");
    link.href = file.url;
    link.download = name === "Documento adjunto" ? (file.pdf ? "Documento.pdf" : "Documento") : name;
    window.document.body.appendChild(link); link.click(); link.remove();
  }

  const close = () => { dialog.current?.close(); setOpen(false); };
  const show = () => { setOpen(true); void load(); };
  const visibleCaption = caption && caption !== name && !/^(?:document|documento)(?: enviado| recibido)?$/i.test(caption.trim()) ? caption : null;
  const detail = [document?.pdf || isPdf ? "PDF" : "Documento", document?.pages ? `${document.pages.numPages} ${document.pages.numPages === 1 ? "página" : "páginas"}` : null, document ? `${(document.size / 1024 / 1024).toFixed(1)} MB` : null].filter(Boolean).join(" · ");

  return <>
    <div ref={card} className="message-document-card">
      <button ref={opener} type="button" className="message-document-preview" onClick={show} aria-label={`Abrir ${name} en el visor PDF`}>
        {document?.pages ? <PdfPage document={document.pages} page={1} thumbnail /> : <div className="message-document-placeholder"><FileText size={44} /><span>{loading ? "Cargando vista previa…" : isPdf ? "Documento PDF" : "Documento adjunto"}</span></div>}
        <span className="message-document-preview-overlay"><Expand size={16} /> Abrir visor</span>
      </button>
      <div className="message-document-info"><FileText size={24} aria-hidden="true" /><div><strong title={name}>{name}</strong><span>{detail}</span></div></div>
      {visibleCaption ? <span className="message-document-caption">{visibleCaption}</span> : null}
      <div className="message-document-actions">
        <button type="button" className="message-document-primary" onClick={show}><Expand size={16} /> Ver {document?.pdf || isPdf ? "PDF" : "documento"}</button>
        <button type="button" disabled={loading} onClick={() => void download()}><Download size={16} /> Descargar</button>
      </div>
      {error && !open ? <span className="message-document-error" role="alert">{error}</span> : null}
    </div>
    {open ? createPortal(<dialog ref={dialog} className="message-document-dialog" aria-label={`Visor PDF: ${name}`} onCancel={close} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="message-document-viewer">
        <header><div><strong>{name}</strong><span className="message-document-detail">{detail}</span></div><button type="button" aria-label="Cerrar documento" onClick={close} autoFocus><X size={22} /></button></header>
        <div className="message-document-toolbar">
          {document?.pages ? <>
            <div className="message-document-controls"><button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(current => current - 1)}><ChevronLeft size={18} /></button><span role="status">Página {page} de {document.pages.numPages}</span><button type="button" aria-label="Página siguiente" disabled={page >= document.pages.numPages} onClick={() => setPage(current => current + 1)}><ChevronRight size={18} /></button></div>
            <div className="message-document-controls"><button type="button" aria-label="Reducir zoom" disabled={zoom <= .5} onClick={() => setZoom(current => Math.max(.5, current - .25))}><ZoomOut size={18} /></button><button type="button" title="Ajustar al ancho" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 2.5} onClick={() => setZoom(current => Math.min(2.5, current + .25))}><ZoomIn size={18} /></button></div>
          </> : null}
          <button type="button" disabled={loading} onClick={() => void download()}><Download size={16} /> Descargar</button>
          <a href={document?.url || src} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a>
        </div>
        {loading ? <p role="status">Cargando documento…</p> : null}
        {error ? <div role="alert"><p>{error}</p>{!document ? <button type="button" onClick={() => void load()}>Reintentar</button> : null}</div> : null}
        {document?.pages ? <div className="message-document-stage"><PdfPage document={document.pages} page={page} zoom={zoom} /></div> : null}
        {document?.remote ? <p>Este archivo es grande. Descárgalo para abrirlo sin mantener la conversación esperando.</p> : null}
        {document && !document.pdf ? <p>Este formato no tiene vista previa. Puedes descargarlo o abrirlo en otra pestaña.</p> : null}
      </div>
    </dialog>, window.document.body) : null}
  </>;
}
