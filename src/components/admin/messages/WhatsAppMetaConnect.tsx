"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { readEmbeddedSignupBrowserEvent } from "@/lib/whatsapp-embedded-signup";
import type { EmbeddedSignupSession } from "@/lib/whatsapp-meta-schema";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string }; status?: string }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
  }
}

type StatusResponse = {
  configured: boolean;
  source: "database/oauth" | "env" | "none";
  integration: {
    businessId: string;
    displayPhoneNumber: string | null;
    id: string;
    lastVerifiedAt: string | null;
    phoneNumberId: string;
    scopes: string[];
    status: string;
    verifiedName: string | null;
    wabaId: string;
  } | null;
  oauthConfiguration: {
    appIdConfigured: boolean;
    appSecretConfigured: boolean;
    graphVersion: string;
    loginConfigIdConfigured: boolean;
    tokenEncryptionConfigured: boolean;
  };
  webhookSignatureConfigured: boolean;
  realSendLabel: string;
};

type VerifiedAccount = {
  business: { id: unknown; name: string | null };
  waba: { id: unknown; name: string | null };
  phone: { id: unknown; displayPhoneNumber: string | null; verifiedName: string | null };
};

type VerifyResponse = {
  ok?: boolean;
  account?: VerifiedAccount;
  diagnostics?: {
    code?: number | null;
    fbtraceId?: string | null;
    grantedScopes?: string[];
    realSendLabel?: string;
    subcode?: number | null;
  };
  error?: string;
};

type ExchangeResponse = {
  ok?: boolean;
  account?: VerifiedAccount;
  error?: string;
  subscribedApp?: boolean;
};

function formatAssetValue(value: string | null | undefined, fallback = "Pendiente") {
  if (!value || value.startsWith("unknown-")) {
    return fallback;
  }

  return value;
}

function statusText(ready: boolean) {
  return ready ? "Listo" : "Pendiente";
}

function requirementText(ready: boolean, label: string) {
  return `${label}: ${statusText(ready)}`;
}

export function WhatsAppMetaConnect() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessionInfo, setSessionInfo] = useState<EmbeddedSignupSession | null>(null);
  const [authorizationCode, setAuthorizationCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verifiedAccount, setVerifiedAccount] = useState<VerifiedAccount | null>(null);
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
      const parsed = readEmbeddedSignupBrowserEvent(event);
      if (!parsed) return;

      if (parsed.kind === "SESSION") {
        setSessionInfo(parsed.sessionInfo);
        setMessage("Meta autorizó los activos. Guardando la conexión en el servidor...");
        return;
      }

      setSessionInfo(null);
      setAuthorizationCode(null);
      setMessage(parsed.message);
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
        const payload = (await response.json()) as ExchangeResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Meta no pudo completar la conexión.");
        setVerifiedAccount(payload.account ?? null);
        setMessage(
          payload.subscribedApp
            ? "WhatsApp quedó conectado. Los activos autorizados se verificaron con Graph."
            : "WhatsApp quedó conectado. Revisa la suscripción de la app al WABA antes de grabar recepción real.",
        );
        setAuthorizationCode(null);
        setSessionInfo(null);
        await loadStatus();
      })
      .catch((error: unknown) => {
        setAuthorizationCode(null);
        setSessionInfo(null);
        setMessage(error instanceof Error ? error.message : "No se pudo conectar WhatsApp.");
      })
      .finally(() => setBusy(false));
  }, [authorizationCode, busy, sessionInfo]);

  function loadFacebookSdk() {
    if (!sdkReady) {
      setMessage("Faltan las variables públicas de Meta para abrir Embedded Signup.");
      return;
    }

    setMessage("Abriendo autorización oficial de Meta...");
    setSessionInfo(null);
    setAuthorizationCode(null);
    setVerifiedAccount(null);

    if (window.FB) {
      window.FB.login(handleLogin, loginOptions());
      return;
    }

    if (!initialized.current) {
      initialized.current = true;
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.onerror = () => setMessage("No se pudo cargar el SDK oficial de Facebook. Revisa bloqueadores, dominio y conexión.");
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
      const payload = (await response.json()) as VerifyResponse;
      if (!response.ok || !payload.ok) {
        const diagnostic = payload.diagnostics?.code ? ` Código Meta ${payload.diagnostics.code}.` : "";
        throw new Error(`${payload.error || "La verificación no pasó."}${diagnostic}`);
      }
      setVerifiedAccount(payload.account ?? null);
      setMessage("Activos verificados con Graph. Envío real: no probado desde esta verificación.");
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo verificar la conexión.");
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.integration);
  const sdkReady = Boolean(process.env.NEXT_PUBLIC_META_APP_ID && process.env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID);
  const integration = status?.integration;
  const missingConfig = status
    ? [
        status.oauthConfiguration.appIdConfigured ? null : "App ID",
        status.oauthConfiguration.loginConfigIdConfigured ? null : "Config ID",
        status.oauthConfiguration.appSecretConfigured ? null : "App Secret",
        status.oauthConfiguration.tokenEncryptionConfigured ? null : "Token encryption key",
      ].filter(Boolean)
    : [];
  const grantedScopes = integration?.scopes?.length ? integration.scopes : verifiedAccount ? status?.integration?.scopes ?? [] : [];
  const oauthReady = Boolean(status && missingConfig.length === 0 && sdkReady);
  const businessLabel = formatAssetValue(String(verifiedAccount?.business.id ?? integration?.businessId ?? ""), "Business pendiente");
  const wabaLabel = verifiedAccount?.waba.name || formatAssetValue(integration?.wabaId, "WABA pendiente");
  const phoneLabel = verifiedAccount?.phone.displayPhoneNumber || formatAssetValue(integration?.displayPhoneNumber || integration?.phoneNumberId, "Número pendiente");
  const connectionTitle = connected ? "Cuenta conectada localmente" : "WhatsApp aún no está conectado";
  const connectionSubtitle = connected
    ? `${integration?.verifiedName || "Importaciones Super"}${integration?.displayPhoneNumber ? ` · ${integration.displayPhoneNumber}` : ""}`
    : "Autoriza Meta para enlazar la cuenta y el número de prueba.";
  const missingConfigText = missingConfig.join(", ");
  const hasMessagingScope = grantedScopes.includes("whatsapp_business_messaging");
  const hasManagementScope = grantedScopes.includes("whatsapp_business_management");
  const oauthStatus = oauthReady ? "Configuración completa" : "Falta configuración";

  return (
    <section className="whatsapp-connection-card" aria-labelledby="whatsapp-connection-title">
      <div className="whatsapp-connection-header">
        <div className="whatsapp-connection-copy">
          <div className="whatsapp-connection-icon"><ShieldCheck size={20} /></div>
          <div>
            <p className="whatsapp-connection-eyebrow">Conexión oficial de Meta</p>
            <h3 id="whatsapp-connection-title">WhatsApp Business</h3>
            <p>Autoriza la cuenta, revisa el número conectado y valida los permisos para la demo.</p>
          </div>
        </div>
        <span className={`whatsapp-connection-pill ${oauthReady && connected ? "is-ready" : "is-warning"}`}>
          {oauthReady && connected ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {oauthReady && connected ? "Listo para verificar" : "Requiere configuración"}
        </span>
      </div>

      <div className="whatsapp-connection-summary-card">
        <div className={`whatsapp-connection-status ${connected ? "is-connected" : "is-missing"}`}>
          {connected ? <CheckCircle2 size={18} aria-hidden /> : <XCircle size={18} aria-hidden />}
          <div>
            <strong>{connectionTitle}</strong>
            <span>{connectionSubtitle}</span>
          </div>
        </div>
      </div>

      {missingConfig.length ? (
        <div className="whatsapp-connection-alert">
          <AlertTriangle size={18} />
          <div>
            <strong>OAuth no está listo para grabar.</strong>
            <span>Falta en el servidor: {missingConfigText}. Estos valores no se guardan desde esta pantalla; se configuran como variables de entorno y requieren rebuild.</span>
          </div>
        </div>
      ) : null}

      <div className="whatsapp-connection-action-panel">
        <div>
          <strong>Acciones</strong>
          <span>Conecta o vuelve a verificar los activos autorizados por Meta.</span>
        </div>
        <div className="whatsapp-connection-actions">
          <button className="btn btn-primary" type="button" onClick={loadFacebookSdk} disabled={!oauthReady || busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Link2 size={16} />}
            {connected ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={verifyConnection} disabled={!connected || busy}>Verificar activos</button>
        </div>
      </div>

      <div className="whatsapp-connection-grid">
        <div className="whatsapp-connection-section">
          <h4>Preparación</h4>
          <ul className="whatsapp-connection-checklist" aria-label="Estado de preparación">
            <li className={oauthReady ? "is-ok" : "is-pending"}>{requirementText(oauthReady, "OAuth de Meta")}</li>
            <li className={connected ? "is-ok" : "is-pending"}>{requirementText(connected, "Cuenta y número")}</li>
            <li className={status?.webhookSignatureConfigured ? "is-ok" : "is-pending"}>
              {requirementText(Boolean(status?.webhookSignatureConfigured), "Webhook seguro")}
            </li>
            <li className="is-pending">Envío real: No probado</li>
          </ul>
        </div>

        <div className="whatsapp-connection-section">
          <h4>Permisos de Meta</h4>
          <ul className="whatsapp-connection-checklist" aria-label="Permisos de Meta">
            <li className={hasMessagingScope ? "is-ok" : "is-pending"}>
              whatsapp_business_messaging: {statusText(hasMessagingScope)}
            </li>
            <li className={hasManagementScope ? "is-ok" : "is-pending"}>
              whatsapp_business_management: {statusText(hasManagementScope)}
            </li>
          </ul>
        </div>
      </div>

      {integration ? (
        <div className="whatsapp-connection-section">
          <h4>Cuenta autorizada</h4>
          <dl className="whatsapp-connection-assets">
            <div><dt>Business ID</dt><dd>{businessLabel}</dd></div>
            <div><dt>Cuenta WhatsApp</dt><dd>{wabaLabel}</dd></div>
            <div><dt>Número conectado</dt><dd>{phoneLabel}</dd></div>
            <div><dt>Última verificación</dt><dd>{integration.lastVerifiedAt ? new Date(integration.lastVerifiedAt).toLocaleString("es-PE") : "Pendiente"}</dd></div>
          </dl>
        </div>
      ) : null}

      <details className="whatsapp-connection-details">
        <summary>Ver detalles técnicos</summary>
        <ul className="whatsapp-connection-checklist" aria-label="Estado de preparación">
          <li>OAuth: {oauthStatus}</li>
          <li>Origen de token: {status?.source || "sin configurar"}</li>
          <li>{status?.realSendLabel || "Envío real: NO PROBADO"}</li>
          <li>Graph API: {status?.oauthConfiguration?.graphVersion || "pendiente"}</li>
        </ul>
      </details>

      {message && <p className="whatsapp-connection-message" role="status">{message}</p>}
    </section>
  );
}
