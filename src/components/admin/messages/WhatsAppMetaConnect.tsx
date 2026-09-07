"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Link2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { embeddedSignupSessionSchema, type EmbeddedSignupSession } from "@/lib/whatsapp-meta-schema";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
  }
}

const ALLOWED_META_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://business.facebook.com",
  "https://web.facebook.com",
]);

type StatusResponse = {
  configured: boolean;
  source: "database/oauth" | "env";
  integration: {
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    wabaId: string;
    phoneNumberId: string;
    lastVerifiedAt: string | null;
  } | null;
  webhookSignatureConfigured: boolean;
  realSendLabel: string;
};

function readSignupMessage(event: MessageEvent) {
  if (!ALLOWED_META_ORIGINS.has(event.origin) || !event.data || typeof event.data !== "object") {
    return null;
  }

  const message = event.data as { type?: unknown; data?: unknown };
  if (message.type !== "WA_EMBEDDED_SIGNUP" || !message.data || typeof message.data !== "object") {
    return null;
  }

  const parsed = embeddedSignupSessionSchema.safeParse(message.data);
  return parsed.success ? parsed.data : null;
}

export function WhatsAppMetaConnect() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessionInfo, setSessionInfo] = useState<EmbeddedSignupSession | null>(null);
  const [authorizationCode, setAuthorizationCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const initialized = useRef(false);

  async function loadStatus() {
    const response = await fetch("/api/admin/integrations/whatsapp/status", { cache: "no-store" });
    if (response.ok) setStatus((await response.json()) as StatusResponse);
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const parsed = readSignupMessage(event);
      if (parsed) setSessionInfo(parsed);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!authorizationCode || !sessionInfo || busy) return;

    setBusy(true);
    setMessage(null);
    fetch("/api/admin/integrations/whatsapp/oauth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorizationCode, sessionInfo }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Meta no pudo completar la conexión.");
        setMessage("WhatsApp quedó conectado y verificado de forma básica.");
        setAuthorizationCode(null);
        setSessionInfo(null);
        await loadStatus();
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "No se pudo conectar WhatsApp."))
      .finally(() => setBusy(false));
  }, [authorizationCode, busy, sessionInfo]);

  function loadFacebookSdk() {
    if (window.FB) {
      window.FB.login(handleLogin, loginOptions());
      return;
    }

    if (!initialized.current) {
      initialized.current = true;
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.onload = () => {
        window.FB?.init({
          appId: process.env.NEXT_PUBLIC_META_APP_ID,
          cookie: true,
          xfbml: false,
          version: process.env.NEXT_PUBLIC_META_GRAPH_VERSION || "v26.0",
        });
        window.FB?.login(handleLogin, loginOptions());
      };
      document.body.appendChild(script);
    }
  }

  function loginOptions() {
    return {
      config_id: process.env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: { feature: "whatsapp_embedded_signup", sessionInfoVersion: "3" },
    };
  }

  function handleLogin(response: { authResponse?: { code?: string } }) {
    const code = response.authResponse?.code;
    if (!code) {
      setMessage("El flujo de Meta fue cancelado o no devolvió un código autorizado.");
      return;
    }
    setAuthorizationCode(code);
  }

  async function verifyConnection() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/integrations/whatsapp/verify", { method: "POST" });
      const payload = (await response.json()) as { ok?: boolean; error?: string; diagnostics?: { code?: number | null; subcode?: number | null; fbtraceId?: string | null } };
      if (!response.ok || !payload.ok) {
        const diagnostic = payload.diagnostics?.code ? ` Código Meta ${payload.diagnostics.code}.` : "";
        throw new Error(`${payload.error || "La verificación no pasó."}${diagnostic}`);
      }
      setMessage("Conexión verificada con lecturas Graph. Envío real: NO PROBADO.");
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo verificar la conexión.");
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.integration);
  const sdkReady = Boolean(process.env.NEXT_PUBLIC_META_APP_ID && process.env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID);

  return (
    <section className="whatsapp-connection-card" aria-labelledby="whatsapp-connection-title">
      <div className="whatsapp-connection-copy">
        <div className="whatsapp-connection-icon"><ShieldCheck size={20} /></div>
        <div>
          <h2 id="whatsapp-connection-title">Conexión WhatsApp Business</h2>
          <p>Conecta una cuenta mediante Embedded Signup. El token se guarda cifrado y nunca se muestra.</p>
        </div>
      </div>
      <div className="whatsapp-connection-status">
        {connected ? <CheckCircle2 size={18} aria-hidden /> : <XCircle size={18} aria-hidden />}
        <span>{connected ? `${status?.integration?.verifiedName || "Cuenta conectada"} ${status?.integration?.displayPhoneNumber || ""}` : "Sin integración OAuth activa"}</span>
      </div>
      <div className="whatsapp-connection-actions">
        <button className="btn btn-primary" type="button" onClick={loadFacebookSdk} disabled={!sdkReady || busy}>
          {busy ? <Loader2 className="spin" size={16} /> : <Link2 size={16} />}
          {connected ? "Conectar otra cuenta" : "Conectar con Meta"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={verifyConnection} disabled={!connected || busy}>Verificar conexión</button>
      </div>
      <div className="whatsapp-connection-meta">
        <span>Origen: {status?.source || "sin configurar"}</span>
        <span>{status?.realSendLabel || "Envío real: NO PROBADO"}</span>
        <span>Webhook: {status?.webhookSignatureConfigured ? "secreto configurado" : "revisión pendiente"}</span>
      </div>
      {!sdkReady && <p className="whatsapp-connection-note">Configura `NEXT_PUBLIC_META_APP_ID` y `NEXT_PUBLIC_META_LOGIN_CONFIG_ID` para habilitar Embedded Signup en local.</p>}
      {message && <p className="whatsapp-connection-message" role="status">{message}</p>}
    </section>
  );
}
