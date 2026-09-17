import { prisma } from "@/lib/prisma";
import { WhatsAppManyChatStatus } from "@/components/admin/messages/WhatsAppManyChatStatus";
import { MessagingSettingsForm } from "@/components/admin/messages/MessagingSettingsForm";
import { Bot, CheckCircle2, PauseCircle } from "lucide-react";
import { toggleBotAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const settings = await prisma.storeSettings.findFirst() || {
    botMasterSwitch: true,
    n8nWebhookUrl: "",
  };
  const outboundConfigured = Boolean(
    process.env.N8N_OUTBOUND_WEBHOOK_URL?.trim() && process.env.N8N_OUTBOUND_API_KEY?.trim(),
  );

  return (
    <div className="messaging-settings-page">
      <div className="messaging-settings-page-heading">
        <div>
          <p className="messaging-settings-eyebrow">Centro de mensajes</p>
          <h1>Configuración de mensajería</h1>
          <p>Revisa tu canal de ManyChat y decide cómo se procesan los mensajes entrantes.</p>
        </div>
        <span className={`messaging-settings-state ${settings.botMasterSwitch ? "is-active" : "is-paused"}`}>
          {settings.botMasterSwitch ? <CheckCircle2 size={15} /> : <PauseCircle size={15} />}
          {settings.botMasterSwitch ? "Automatización activa" : "Automatización pausada"}
        </span>
      </div>

      <div className="messaging-settings-stack">
        <WhatsAppManyChatStatus outboundConfigured={outboundConfigured} />

        <section className="messaging-settings-card">
          <div className="messaging-settings-toggle-row">
            <span className="messaging-settings-card-icon" aria-hidden="true"><Bot size={19} /></span>
            <div className="messaging-settings-toggle-copy">
              <h2>Respuestas automáticas</h2>
              <p>{settings.botMasterSwitch
                ? "Los mensajes nuevos pueden activar tus flujos de atención."
                : "Los mensajes seguirán llegando a la bandeja, pero ningún flujo responderá automáticamente."}</p>
            </div>
            <form action={toggleBotAction}>
              <button
                className={`messaging-settings-switch ${settings.botMasterSwitch ? "is-on" : ""}`}
                type="submit"
                role="switch"
                aria-checked={settings.botMasterSwitch}
                aria-label="Activar respuestas automáticas"
              >
                <span aria-hidden="true" />
              </button>
            </form>
          </div>
        </section>

        <MessagingSettingsForm webhookUrl={settings.n8nWebhookUrl || ""} />
      </div>
    </div>
  );
}
