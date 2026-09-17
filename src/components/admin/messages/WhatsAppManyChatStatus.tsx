import { MessageCircle } from "lucide-react";

export function WhatsAppManyChatStatus({ outboundConfigured }: { outboundConfigured: boolean }) {
  return (
    <section className="messaging-settings-card whatsapp-connection-card" aria-labelledby="whatsapp-connection-title">
      <div className="messaging-settings-channel-row">
        <span className="messaging-settings-card-icon is-whatsapp" aria-hidden="true">
          <MessageCircle size={19} />
        </span>
        <div className="messaging-settings-channel-copy">
          <h2 id="whatsapp-connection-title">Canal de WhatsApp</h2>
          <div className="whatsapp-connection-status">
            <div>
              <strong>WhatsApp mediante ManyChat</strong>
              <span>La cuenta de WhatsApp se administra desde ManyChat. Los mensajes de la bandeja se envían a través de n8n.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="messaging-settings-channel-meta" aria-label="Configuración del canal">
        <span><small>Proveedor</small>ManyChat</span>
        <span>
          <small>Envíos desde la bandeja</small>
          {outboundConfigured ? "Configuración registrada" : "Configuración pendiente en este servidor"}
        </span>
      </div>
    </section>
  );
}
