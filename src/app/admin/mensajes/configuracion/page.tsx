import { prisma } from "@/lib/prisma";
import { Bot, CheckCircle2, PauseCircle } from "lucide-react";
import { toggleBotAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } }) || {
    botMasterSwitch: false,
  };

  return (
    <div className="messaging-settings-page">
      <div className="messaging-settings-page-heading">
        <div>
          <p className="messaging-settings-eyebrow">Centro de mensajes</p>
          <h1>Configuración de mensajería</h1>
          <p>Super Bot usa el catálogo verificado y las políticas de atención en los canales conectados.</p>
        </div>
        <span className={`messaging-settings-state ${settings.botMasterSwitch ? "is-active" : "is-paused"}`}>
          {settings.botMasterSwitch ? <CheckCircle2 size={15} /> : <PauseCircle size={15} />}
          {settings.botMasterSwitch ? "Automatización activa" : "Automatización pausada"}
        </span>
      </div>

      <div className="messaging-settings-stack">
        <section className="messaging-settings-card">
          <div className="messaging-settings-toggle-row">
            <span className="messaging-settings-card-icon" aria-hidden="true"><Bot size={19} /></span>
            <div className="messaging-settings-toggle-copy">
              <h2>Super Bot</h2>
              <p>{settings.botMasterSwitch
                ? "Los mensajes nuevos pueden consultar el mismo núcleo de catálogo y atención."
                : "Los mensajes seguirán llegando a la bandeja, pero Super Bot no responderá automáticamente."}</p>
            </div>
            <form action={toggleBotAction}>
              <button
                className={`messaging-settings-switch ${settings.botMasterSwitch ? "is-on" : ""}`}
                type="submit"
                role="switch"
                aria-checked={settings.botMasterSwitch}
                aria-label={settings.botMasterSwitch ? "Pausar Super Bot" : "Activar Super Bot"}
              >
                <span aria-hidden="true" />
              </button>
            </form>
          </div>
        </section>

      </div>
    </div>
  );
}
