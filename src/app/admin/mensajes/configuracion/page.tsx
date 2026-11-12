import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Bot, CheckCircle2, FlaskConical, Images, PauseCircle, Send, SlidersHorizontal } from "lucide-react";
import { toggleBotAction, toggleBotTestEnvironmentAction, updateProductRecommendationSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } }) || {
    botMasterSwitch: false,
    botTestEnvironmentEnabled: false,
    botProductCardLimit: 5,
    botMoreOptionsEnabled: true,
    botCatalogActionEnabled: true,
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

        <section className="messaging-settings-card">
          <div className="messaging-settings-toggle-row">
            <span className="messaging-settings-card-icon is-messaging" aria-hidden="true"><FlaskConical size={19} /></span>
            <div className="messaging-settings-toggle-copy">
              <h2>Entorno de pruebas</h2>
              <p>{settings.botTestEnvironmentEnabled
                ? "El simulador aislado está habilitado para los propietarios. No activa Messenger, Meta ni respuestas automáticas a clientes."
                : "El simulador está bloqueado. Habilítalo solo durante una validación interna."}</p>
              <Link className="messaging-settings-inline-link" href="/admin/mensajes/simulador">Abrir simulador</Link>
            </div>
            <form action={toggleBotTestEnvironmentAction}>
              <button
                className={`messaging-settings-switch ${settings.botTestEnvironmentEnabled ? "is-on" : ""}`}
                type="submit"
                role="switch"
                aria-checked={settings.botTestEnvironmentEnabled}
                aria-label={settings.botTestEnvironmentEnabled ? "Deshabilitar entorno de pruebas" : "Habilitar entorno de pruebas"}
              >
                <span aria-hidden="true" />
              </button>
            </form>
          </div>
        </section>

        <section className="messaging-settings-card messaging-recommendation-card">
          <div className="messaging-settings-card-heading">
            <span className="messaging-settings-card-icon is-messaging" aria-hidden="true"><Images size={19} /></span>
            <div>
              <h2>Recomendaciones visuales</h2>
              <p>Cuando una consulta tenga varias coincidencias, Super Bot priorizará productos con stock y enviará sus tarjetas al canal conectado.</p>
            </div>
          </div>

          <div className="messaging-recommendation-preview" aria-label="Vista previa del flujo de recomendaciones">
            <span>Consulta del cliente</span>
            <strong>“Busco parlantes JBL”</strong>
            <div><i /> <i /> <i /> <i /> <i /></div>
            <small>Tarjetas verificadas · luego: más opciones o catálogo</small>
          </div>

          <form action={updateProductRecommendationSettingsAction} className="messaging-recommendation-form">
            <div className="messaging-settings-field">
              <label htmlFor="bot-product-card-limit"><SlidersHorizontal size={15} /> Productos por respuesta</label>
              <select defaultValue={settings.botProductCardLimit} id="bot-product-card-limit" name="botProductCardLimit">
                {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} {count === 1 ? "producto" : "productos"}</option>)}
              </select>
              <p>Messenger podrá mostrar hasta cinco tarjetas relevantes por respuesta.</p>
            </div>

            <label className="messaging-recommendation-check">
              <input defaultChecked={settings.botMoreOptionsEnabled} name="botMoreOptionsEnabled" type="checkbox" />
              <span><strong>Mostrar “Ver más opciones”</strong><small>Entrega el siguiente grupo sin repetir tarjetas ya enviadas.</small></span>
            </label>
            <label className="messaging-recommendation-check">
              <input defaultChecked={settings.botCatalogActionEnabled} name="botCatalogActionEnabled" type="checkbox" />
              <span><strong>Mostrar “Solicitar catálogo”</strong><small>Genera el PDF de la búsqueda actual, por ejemplo “catálogo de parlantes JBL”.</small></span>
            </label>

            <div className="messaging-settings-card-footer">
              <span className="messaging-settings-result"><Send size={14} /> Aplica a los canales conectados con Super Bot.</span>
              <button className="btn btn-primary messaging-settings-save" type="submit">Guardar recomendaciones</button>
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
