# Contrato de Integración: n8n <-> Centro de Mensajes

Este documento define la interfaz que los flujos de n8n deben utilizar para integrarse de forma estable con el Centro de Mensajes.

## Autenticación
Todas las llamadas entre n8n y el Backend (en ambos sentidos) deben usar el header:
`x-internal-api-key: [CLAVE_SECRETA]`

## 1. Entrada: n8n hacia Backend (Incoming Messages)
Cuando el usuario envía un mensaje por WhatsApp, n8n reenvía el payload al Centro de Mensajes.

**Endpoint:** `POST /api/internal/chat/incoming`

**Payload:**
```json
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
```

## 2. Salida IA: n8n hacia Backend (Bot Responses)
Cuando el Bot de Inteligencia Artificial (dentro de n8n) responde, debe registrar ese mensaje en PostgreSQL para que el Asesor pueda verlo.

**Endpoint:** `POST /api/internal/chat/outgoing`

**Payload:**
```json
{
  "conversationId": "cuid_de_la_conversacion",
  "externalMessageId": "wamid.xxxxxxxxxx",
  "content": "¡Hola! Soy el asistente virtual...",
  "type": "TEXT",
  "mediaUrl": null,
  "provider": "meta-cloud"
}
```
*Nota: Si se provee `externalMessageId`, el Backend ignora duplicados (idempotencia).*

**Regla de Reintento de Bot Callback:**
Si la API de Meta responde con ÉXITO a n8n, pero la llamada de n8n a `POST /api/internal/chat/outgoing` falla (timeout, 5xx, etc.), el flujo de n8n **SÓLO** debe reintentar la llamada al Bot Callback (`/api/internal/chat/outgoing`). ¡NUNCA debe volver a enviar el mensaje a Meta! Enviar un duplicado a Meta por un fallo en el backend resultaría en SPAM al usuario final.

## 3. Salida Manual: Backend hacia n8n (Outbound Agent Message)
Cuando un asesor escribe desde el Centro de Mensajes, el Backend envía una orden de ejecución a n8n.

**Endpoint en n8n:** Webhook URL configurada en `.env` como `N8N_OUTBOUND_WEBHOOK_URL`

**Payload que n8n recibe:**
```json
{
  "channel": "WHATSAPP",
  "conversationId": "cuid_de_la_conversacion",
  "recipient": "51999999999",
  "content": "Hola, te habla un asesor",
  "type": "TEXT",
  "mediaUrl": null,
  "agentId": "uuid_del_asesor",
  "requestId": "uuid_unico_para_idempotencia",
  "forceRetry": false,
  "timestamp": "2023-11-12T14:35:00Z"
}
```

**Respuesta requerida por n8n:**
Para que el Centro de Mensajes confirme el envío de forma síncrona (timeout: 12s), n8n debe devolver:
```json
{
  "ok": true,
  "provider": "meta-cloud",
  "messageId": "wamid.xxxxxxxxxx_devuelto_por_meta"
}
```

Cualquier otra respuesta o timeout marcará el mensaje como `failed` o `unknown` para que el Asesor pueda reintentar.

## 4. Algoritmo de Idempotencia y Deduplicación en n8n (Persistent Dedupe)

Para evitar duplicar mensajes salientes hacia Meta, n8n implementa un algoritmo de idempotencia basado en el `requestId` proporcionado por el Backend.

### Estados de Idempotencia
- **PROCESSING**: El mensaje está siendo procesado actualmente por n8n o Meta.
- **SENT**: El mensaje ya fue enviado exitosamente a Meta.
- **FAILED**: El envío falló definitivamente en n8n o Meta.
- **UNKNOWN**: El estado del envío no se pudo determinar con certeza (ej. timeout de Meta).

### Casos de Resolución (Dedupe Algorithm)
- **Caso A (Primer Intento):**
  - Condición: El `requestId` no existe en la base de datos de idempotencia de n8n.
  - Acción: n8n registra el `requestId` como PROCESSING, ejecuta el envío a Meta, y si es exitoso lo marca SENT (de lo contrario FAILED o UNKNOWN).
- **Caso B (Reintento Seguro de FAILED):**
  - Condición: El `requestId` existe como FAILED, o existe como UNKNOWN pero el payload incluye `forceRetry=true`.
  - Acción: n8n actualiza a PROCESSING y reintenta el envío a Meta.
- **Caso C (Reintento Bloqueado - Ya Enviado):**
  - Condición: El `requestId` existe como SENT.
  - Acción: n8n **NO** reintenta el envío a Meta. En su lugar, devuelve la respuesta de éxito cacheada previamente.
- **Caso D (Reintento Bloqueado - Procesando):**
  - Condición: El `requestId` existe como PROCESSING.
  - Acción: n8n **NO** envía a Meta. Devuelve un error (409 Conflict o similar) para evitar condiciones de carrera.
- **Caso E (Reintento Bloqueado - UNKNOWN sin Force):**
  - Condición: El `requestId` existe como UNKNOWN y el payload tiene `forceRetry=false`.
  - Acción: n8n **NO** envía a Meta. Devuelve un error indicando que se requiere confirmación manual (`forceRetry=true`) para reintentar debido al riesgo de duplicidad.
