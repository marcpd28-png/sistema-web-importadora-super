# Contrato de Integración: n8n <-> Centro de Mensajes

Este documento define la interfaz que los flujos de n8n deben utilizar para integrarse de forma estable con el Centro de Mensajes.

## Autenticación
Todas las llamadas entre n8n y el Backend (en ambos sentidos) deben usar el header:
`x-internal-api-key: [CLAVE_SECRETA]`

## 1. Entrada: n8n hacia Backend (Incoming Messages)
Cuando el usuario envía un mensaje por WhatsApp, n8n reenvía el payload al Centro de Mensajes.

**Endpoint:** `POST /api/internal/chat/incoming`

**Payload:**
\`\`\`json
{
  "channel": "WHATSAPP",
  "externalContactId": "51999999999",
  "externalMessageId": "wamid.xxxxxxxxxx",
  "content": "Hola, quiero información",
  "type": "TEXT", // "TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"
  "name": "Juan Perez",
  "phone": "51999999999",
  "timestamp": "2023-11-12T14:30:00Z"
}
\`\`\`

## 2. Salida IA: n8n hacia Backend (Bot Responses)
Cuando el Bot de Inteligencia Artificial (dentro de n8n) responde, debe registrar ese mensaje en PostgreSQL para que el Asesor pueda verlo.

**Endpoint:** `POST /api/internal/chat/outgoing`

**Payload:**
\`\`\`json
{
  "conversationId": "cuid_de_la_conversacion",
  "externalMessageId": "wamid.xxxxxxxxxx",
  "content": "¡Hola! Soy el asistente virtual...",
  "type": "TEXT",
  "mediaUrl": null,
  "provider": "meta-cloud"
}
\`\`\`
*Nota: Si se provee \`externalMessageId\`, el Backend ignora duplicados (idempotencia).*

## 3. Salida Manual: Backend hacia n8n (Outbound Agent Message)
Cuando un asesor escribe desde el Centro de Mensajes, el Backend envía una orden de ejecución a n8n.

**Endpoint en n8n:** Webhook URL configurada en `.env` como \`N8N_OUTBOUND_WEBHOOK_URL\`

**Payload que n8n recibe:**
\`\`\`json
{
  "channel": "WHATSAPP",
  "conversationId": "cuid_de_la_conversacion",
  "recipient": "51999999999",
  "content": "Hola, te habla un asesor",
  "type": "TEXT",
  "mediaUrl": null,
  "agentId": "uuid_del_asesor",
  "requestId": "uuid_unico_para_idempotencia",
  "timestamp": "2023-11-12T14:35:00Z"
}
\`\`\`

**Respuesta requerida por n8n:**
Para que el Centro de Mensajes confirme el envío de forma síncrona (timeout: 12s), n8n debe devolver:
\`\`\`json
{
  "ok": true,
  "provider": "meta-cloud",
  "messageId": "wamid.xxxxxxxxxx_devuelto_por_meta"
}
\`\`\`

Cualquier otra respuesta o timeout marcará el mensaje como `failed` o `unknown` para que el Asesor pueda reintentar.
