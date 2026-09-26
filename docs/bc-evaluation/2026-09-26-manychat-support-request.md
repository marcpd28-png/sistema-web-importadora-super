# Consulta a soporte: mensajes salientes de ManyChat

Estado: BORRADOR, NO ENVIADO. Falta el correo del solicitante; el usuario no lo tiene disponible. No se creó un ticket ni se activó la sincronización.

Se comprobó la credencial existente del servidor mediante `GET /fb/page/getInfo`: HTTP 200, `success`. No se adjuntan claves ni conversaciones de clientes. El receptor existente pasó sus cinco pruebas locales. La sincronización sigue desactivada en los procesos comprobados.

Formulario oficial: https://help.manychat.com/hc/en-us/requests/new?tf_23822556907164=form_source_hc&ticket_form_id=12734509953820

## Asunto

WhatsApp: sync all Manychat outbound messages, including manual Inbox replies, to our own CRM

## Texto preparado

Hello Manychat Support,

We use Manychat for WhatsApp at Importadora Super and need every new outbound message sent from Manychat to appear in our own customer Message Center. This includes manual replies sent by agents in Manychat Inbox, automation messages, broadcasts, and attachments. We want to keep sending from Manychat and mirror these messages without sending them again to customers.

Our existing Manychat API credential was verified successfully with a read-only GET /fb/page/getInfo. Our CRM already has an authenticated receiver with duplicate protection. However, we could not find an outbound Inbox webhook or a conversation-message history endpoint in the published Page API and Profile API specifications. Adding External Request actions to automation flows alone would not cover manual Inbox replies.

Please confirm:

1. Is there a supported webhook, API endpoint, partner integration, or account-specific feature that supplies all outbound WhatsApp messages, including manual Inbox replies?
2. If available, how can it be enabled, and which plan or permissions are required? Please provide documentation and a sample payload with stable message ID, recipient/contact ID, timestamp, text/media, and message origin where available.
3. Can a Meta webhook reliably provide messages sent by Manychat through Cloud API? We need Manychat-originated messages, not only messages sent from the WhatsApp Business mobile app.
4. If this is not supported, please explicitly confirm the limitation and the official supported alternatives.

The API key is working; this is a capability/integration question, not a credential-reset request. No customer messages or credentials are attached. Please route this request to the technical integrations team if needed.

Thank you.
