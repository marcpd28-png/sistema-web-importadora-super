"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface Props { document: PDFDocumentProxy; page: number; zoom?: number; thumbnail?: boolean; }

export function PdfPage({ document, page, zoom = 1, thumbnail = false }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element || !width) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    const canvas = window.document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Página ${page} del PDF`);
    // Each render owns its canvas; rapid zoom/page changes cannot race on it.
    void document.getPage(page).then(async pdfPage => {
      if (cancelled) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: Math.min(width, thumbnail ? 320 : 1100) / original.width * zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12_000_000 / (viewport.width * viewport.height)));
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      render = pdfPage.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (!cancelled) { element.replaceChildren(canvas); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; render?.cancel(); canvas.remove(); };
  }, [document, page, width, zoom, thumbnail]);

  return <>
    {error ? <span role="alert">No se pudo mostrar esta página. Puedes descargar el PDF.</span> : null}
    <div ref={container} className={thumbnail ? "message-pdf-page message-pdf-thumbnail" : "message-pdf-page"} />
  </>;
}
