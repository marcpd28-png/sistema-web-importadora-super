import { AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { normalizeYCloudPhone } from "@/lib/ycloud-outbound";

export function YCloudConnectionStatus() {
  const apiKeyConfigured = Boolean(process.env.YCLOUD_API_KEY?.trim());
  const sender = normalizeYCloudPhone(process.env.YCLOUD_WHATSAPP_FROM);
  const webhookSecretConfigured = Boolean(process.env.YCLOUD_WEBHOOK_SECRET?.trim());
  const configured = apiKeyConfigured && Boolean(sender) && webhookSecretConfigured;
  const missing = [
    apiKeyConfigured ? null : "API key",
    sender ? null : "número emisor E.164",
    webhookSecretConfigured ? null : "secreto del webhook",
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="messaging-settings-card whatsapp-connection-card" aria-labelledby="ycloud-connection-title">
      <div className="messaging-settings-channel-row">
        <span className="messaging-settings-card-icon is-whatsapp" aria-hidden="true">
          <MessageCircle size={19} />
        </span>
        <div className="messaging-settings-channel-copy">
          <h2 id="ycloud-connection-title">Canal de WhatsApp · YCloud</h2>
          <div className={`whatsapp-connection-status ${configured ? "is-connected" : "is-missing"}`}>
            {configured ? <CheckCircle2 size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
            <div>
              <strong>{configured ? "YCloud configurado" : "Configuración de YCloud incompleta"}</strong>
              <span>{configured ? "Envíos y webhooks listos para operar." : `Falta: ${missing.join(", ")}.`}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="messaging-settings-channel-meta" aria-label="Estado de YCloud">
        <span><small>Número emisor</small>{sender ?? "Pendiente"}</span>
        <span><small>API de envío</small>{apiKeyConfigured ? "Configurada" : "Pendiente"}</span>
        <span><small>Firma del webhook</small>{webhookSecretConfigured ? "Configurada" : "Pendiente"}</span>
      </div>

      {!configured ? (
        <div className="whatsapp-connection-alert" role="alert">
          <AlertTriangle size={17} />
          <span>Completa estas variables en el servidor antes de enviar mensajes reales: {missing.join(", ")}.</span>
        </div>
      ) : null}
    </section>
  );
}
