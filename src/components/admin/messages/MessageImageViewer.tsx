"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";

export function MessageImageViewer({ src, alt, sticker, onError }: {
  src: string;
  alt: string;
  sticker: boolean;
  onError: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = sticker ? "sticker" : "imagen";

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="message-image-trigger"
        aria-label={`Ampliar ${label}`}
        title={`Ampliar ${label}`}
        onClick={() => { setFailed(false); setOpen(true); }}
      >
        {/* Native images preserve animated stickers and authenticated media URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={alt}
          src={src}
          onError={onError}
          style={{ display: "block", borderRadius: sticker ? 0 : "10px", width: sticker ? "160px" : undefined, height: sticker ? "160px" : "auto", maxHeight: "260px", maxWidth: "100%", objectFit: "contain" }}
        />
      </button>
      <dialog
        ref={dialogRef}
        className="message-image-viewer"
        aria-label={sticker ? "Sticker ampliado" : "Imagen ampliada"}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        {open && <>
          <div className="message-image-viewer-toolbar">
            <span>{sticker ? "Sticker" : "Imagen"}</span>
            <div className="message-image-viewer-actions">
              <a href={src} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" /> Tamaño original
              </a>
              <button type="button" aria-label="Cerrar imagen" onClick={() => dialogRef.current?.close()}>
                <X size={20} aria-hidden="true" /> <span>Cerrar</span>
              </button>
            </div>
          </div>
          <div className="message-image-viewer-content">
            {failed ? <p>No se pudo cargar la imagen. Cierra el visor y vuelve a intentarlo.</p> : (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={alt} src={src} onError={() => setFailed(true)} />
            )}
          </div>
        </>}
      </dialog>
    </>
  );
}
