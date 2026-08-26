"use client";

import { FormEvent, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Link2,
  Printer,
  QrCode,
  Smartphone,
  Wifi,
} from "lucide-react";

type ServiceFeedbackQrProps = {
  copy?: Partial<ServiceFeedbackQrCopy>;
  initialUrl: string;
};

type ServiceFeedbackQrCopy = {
  formLabel: string;
  localExamplePath: string;
  posterDescription: string;
  posterEyebrow: string;
  posterTitle: string;
  posterTitleAccent: string;
  readyText: string;
  scanHint: string;
  toolsCopy: string;
  toolsKicker: string;
  toolsTitle: string;
};

const DEFAULT_QR_COPY: ServiceFeedbackQrCopy = {
  formLabel: "Enlace del formulario",
  localExamplePath: "/califica-atencion",
  posterDescription: "Solo te tomará un minuto. Tu experiencia nos ayuda a hacerlo mejor.",
  posterEyebrow: "Tu opinión nos importa",
  posterTitle: "Escanea y califica",
  posterTitleAccent: "tu atención",
  readyText: "Escanea el QR con un celular conectado a la misma red.",
  scanHint: "Abre la cámara de tu celular y apunta al código",
  toolsCopy:
    "Define el enlace que abrirá el QR. Para probarlo con un celular, ambos equipos deben estar conectados a la misma red Wi-Fi.",
  toolsKicker: "Herramienta local",
  toolsTitle: "QR de atención",
};

function isLocalOnlyUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

export function ServiceFeedbackQr({ copy: copyOverrides, initialUrl }: ServiceFeedbackQrProps) {
  const copy = { ...DEFAULT_QR_COPY, ...copyOverrides };
  const [url, setUrl] = useState(initialUrl);
  const [qrSvg, setQrSvg] = useState("");
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        const parsedUrl = new URL(url);

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("Usa un enlace que empiece con http:// o https://");
        }

        const svg = await QRCode.toString(url, {
          type: "svg",
          width: 340,
          margin: 2,
          errorCorrectionLevel: "H",
          color: {
            dark: "#17158d",
            light: "#ffffff",
          },
        });

        if (active) {
          setQrSvg(svg);
          setQrError(null);
        }
      } catch (error) {
        if (active) {
          setQrSvg("");
          setQrError(error instanceof Error ? error.message : "El enlace no es válido.");
        }
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [url]);

  function updateUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setUrl(String(formData.get("feedbackUrl") ?? "").trim());
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const temporaryInput = document.createElement("textarea");
      temporaryInput.value = url;
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      document.execCommand("copy");
      temporaryInput.remove();
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const localOnly = isLocalOnlyUrl(url);

  return (
    <main className="service-qr-shell">
      <section className="service-qr-tools">
        <div className="service-qr-tools-heading">
          <span>
            <QrCode aria-hidden="true" size={18} />
          </span>
          <div>
            <p>{copy.toolsKicker}</p>
            <h1>{copy.toolsTitle}</h1>
          </div>
        </div>

        <p className="service-qr-tools-copy">{copy.toolsCopy}</p>

        <form className="service-qr-url-form" onSubmit={updateUrl}>
          <label htmlFor="feedbackUrl">
            <Link2 aria-hidden="true" size={16} />
            {copy.formLabel}
          </label>
          <div>
            <input defaultValue={initialUrl} id="feedbackUrl" name="feedbackUrl" type="url" />
            <button type="submit">Actualizar</button>
          </div>
        </form>

        {localOnly ? (
          <div className="service-qr-network-note">
            <Wifi aria-hidden="true" size={18} />
            <p>
              <strong>“localhost” no funciona desde el celular.</strong>
              Reemplázalo por la IP local de esta computadora; por ejemplo:
              <code>{`http://192.168.1.20:3000${copy.localExamplePath}`}</code>
            </p>
          </div>
        ) : (
          <div className="service-qr-network-note is-ready">
            <Smartphone aria-hidden="true" size={18} />
            <p>
              <strong>Enlace listo para probar.</strong>
              {copy.readyText}
            </p>
          </div>
        )}

        {qrError ? <p className="service-qr-error">{qrError}</p> : null}

        <div className="service-qr-tool-actions">
          <button disabled={!qrSvg} onClick={() => window.print()} type="button">
            <Printer aria-hidden="true" size={17} />
            Imprimir
          </button>
          <button className="is-secondary" disabled={!qrSvg} onClick={copyUrl} type="button">
            {copied ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
            {copied ? "Copiado" : "Copiar enlace"}
          </button>
        </div>
      </section>

      <section className="service-qr-preview">
        <p className="service-qr-preview-label">Vista previa de impresión</p>
        <article className="service-qr-poster">
          <div className="service-qr-poster-topline" />
          <div className="service-qr-poster-brand">
            {/* A plain image keeps the printed poster independent from app navigation. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Importaciones Super" src="/brand/logo-azul.png" />
          </div>

          <div className="service-qr-poster-copy">
            <p>{copy.posterEyebrow}</p>
            <h2>
              {copy.posterTitle}
              <span>{copy.posterTitleAccent}</span>
            </h2>
            <p>{copy.posterDescription}</p>
          </div>

          <div className="service-qr-code-frame">
            <span className="service-qr-corner service-qr-corner-one" />
            <span className="service-qr-corner service-qr-corner-two" />
            <span className="service-qr-corner service-qr-corner-three" />
            <span className="service-qr-corner service-qr-corner-four" />
            {qrSvg ? (
              <div
                className="service-qr-code"
                // The SVG is generated locally by the qrcode package from the configured URL.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="service-qr-code-placeholder">
                <QrCode aria-hidden="true" size={82} strokeWidth={1.2} />
              </div>
            )}
          </div>

          <div className="service-qr-scan-hint">
            <Smartphone aria-hidden="true" size={18} />
            {copy.scanHint}
          </div>

          <footer className="service-qr-poster-footer">
            <span />
            <div>
              <strong>Importaciones Super</strong>
              <p>Primeros en Tecnología</p>
            </div>
            <span />
          </footer>
        </article>
      </section>
    </main>
  );
}
