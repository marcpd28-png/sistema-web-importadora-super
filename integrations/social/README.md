# Messenger y TikTok en el Centro de Mensajes

Las rutas `/admin/mensajes/messenger` y `/admin/mensajes/tiktok` consumen la API privada del ChatbotX instalado. ChatbotX es sólo la bandeja y el transporte: sus automatizaciones deben solicitar cada respuesta a Super Bot. El administrador vincula cada cuenta en la configuración de canales del chatbot; los asesores utilizan la sesión de la tienda para consultar y responder. La autorización de cada proveedor sigue siendo necesaria y puede caducar.

## Configuración

- `SOCIAL_INBOX_API_URL`: base terminada en `/api`.
- `SOCIAL_INBOX_API_TOKEN`: token de workspace privado con permisos de escritura y ámbitos `inbox` e `integrations`. Nunca se entrega al navegador.
- `SOCIAL_INBOX_WORKSPACE_ID`: workspace que contiene las cuentas autorizadas.
- `SOCIAL_INBOX_STORAGE_PROXY_URL`: sólo para una instalación de ChatbotX que entregue medios como `http://filesystem:9000/...`; debe apuntar a su puente HTTP de loopback (`http://127.0.0.1:PUERTO`).
- `SUPER_BOT_INTERNAL_API_KEY`: secreto compartido entre la tienda y el adaptador. Debe ser aleatorio, tener al menos 32 bytes UTF-8 y no contener caracteres de control. Se guarda sólo en secretos de servidor; nunca en el navegador, una URL, un flujo visible ni el repositorio.
- `SUPER_BOT_EVENT_HASH_KEY`: clave HMAC independiente, aleatoria y de al menos 32 bytes que permanece sólo en el servidor de la tienda. Déjala estable al rotar `SUPER_BOT_INTERNAL_API_KEY`; no se comparte con ChatbotX.

`SOCIAL_INBOX_API_TOKEN` sirve para la bandeja administrativa de la tienda. No sustituye a `SUPER_BOT_INTERNAL_API_KEY` ni debe usarse para autorizar la respuesta automática. Si `SUPER_BOT_EVENT_HASH_KEY` aún no está provisionada, el servidor usa temporalmente la clave interna para conservar compatibilidad; configúrala antes de rotar esa credencial.

## Adaptador único de respuestas

El adaptador de producción es el único que puede transportar una respuesta de Super Bot. Para cada evento entrante de cliente debe hacer:

```text
POST https://tiendavirtualsuper.com/api/internal/super-bot/reply
Content-Type: application/json
x-super-bot-key: <SUPER_BOT_INTERNAL_API_KEY>
```

No uses `Authorization: Bearer`, parámetros de URL ni un secreto expuesto al cliente: la ruta acepta la clave sólo en `x-super-bot-key`.

El cuerpo debe conservar el identificador original del proveedor. Para el adaptador de producción de ChatbotX, `eventId`, `channel` y `conversationId` son obligatorios; la compatibilidad temporal sin canal sólo existe para puentes heredados y no debe usarse en Messenger:

```json
{
  "eventId": "<id-estable-del-evento-entrante>",
  "channel": "messenger",
  "conversationId": "<id-de-conversacion-de-chatbotx>",
  "message": "Busco el modelo BT-125",
  "productContextCode": null,
  "contextCategorySlug": null,
  "recentMessages": [
    { "role": "assistant", "text": "¿Qué producto buscas?" },
    { "role": "user", "text": "Busco el modelo BT-125" }
  ],
  "hasAttachments": false,
  "attachmentCount": 0
}
```

- `eventId` debe ser estable por evento entrante y reutilizarse sin cambios en cada reintento. Sólo admite letras, números, `.`, `_`, `:` y `-`, con un máximo de 160 caracteres.
- `channel` identifica el transporte (`messenger` o `tiktok` para este adaptador) y `conversationId` identifica la conversación de ChatbotX. Junto con `eventId` impiden que dos conversaciones compartan una deduplicación accidental.
- `message` acepta hasta 1,200 caracteres. `recentMessages` contiene como máximo seis mensajes de cliente/asistente de hasta 4,000 caracteres cada uno. Envía sólo el contexto necesario, sin tokens, IDs de acceso ni instrucciones de sistema.
- `productContextCode` y `contextCategorySlug` son contexto opcional de seguimiento; no sustituyen el historial.

### Adjuntos entrantes

Conserva el adjunto en ChatbotX, pero no envíes su binario, URL privada, OCR, transcripción ni metadatos al endpoint. Envía sólo `hasAttachments: true` y el número de adjuntos (`attachmentCount`, de 0 a 10). Un evento que sólo contiene un archivo puede usar `message: ""`.

Super Bot no interpreta imágenes, audio ni documentos como hechos comerciales. Para un adjunto sin texto útil responde pidiendo código/modelo o derivando a un asesor. Si el cliente escribió una consulta junto al adjunto, el texto sigue siendo la consulta comercial; el adaptador no debe intentar inferir precio, stock o producto desde el archivo.

### Entrega, reintentos y pausa

La respuesta exitosa es `200 { "reply": ... }`. Entrega exactamente una respuesta de cliente a partir de `reply.text`; traduce `quickActions`, `products` o `document` sólo si el canal los admite. Un `document` con el mismo `deliveryKey` se entrega como máximo una vez. El adaptador también debe guardar su propia marca de entrega por `channel + conversationId + eventId`: un `200` repetido por una entrega del proveedor no autoriza un segundo mensaje saliente.

| Estado | Acción obligatoria del adaptador |
| --- | --- |
| `200` | Entregar una sola vez la respuesta verificada y marcar el evento como entregado. |
| `202` | El mismo evento está siendo procesado. No envíes nada; espera el valor de `Retry-After` (actualmente 1 segundo) y reintenta con el mismo cuerpo y `eventId`. |
| `409` | No envíes ni reintentes automáticamente. `Automation is paused` significa que la atención automática está detenida; `Conflicting event payload` indica que el mismo evento cambió de contenido y debe revisarse. |
| `429` | No envíes nada; reintenta de forma limitada después de `Retry-After`, manteniendo el mismo `eventId`. |
| `401`, `400` o `413` | Corrige credencial o payload. No hagas fallback a otro bot ni mandes una respuesta automática. |
| `503` | Considera el servicio temporalmente no disponible. Puede reintentarse con backoff acotado, pero nunca se debe sustituir la respuesta por una respuesta comercial inventada. |

No ejecutes otro modelo, respuestas predefinidas comerciales ni un fallback de precio/stock. Si no hay un `200` confirmado, no hay mensaje automático que entregar.

La telemetría de Super Bot guarda únicamente referencias HMAC de evento/conversación, estado, intención, conteo y latencia; conserva la respuesta verificada necesaria para deduplicar y se purga de forma oportunista después de 30 días. No reemplaza el historial de ChatbotX.

Una respuesta manual desde la bandeja pausa Super Bot para esa conversación antes de enviarse. La reactivación es una acción explícita del operador: en Messenger se hace con **Reactivar Super Bot** en `/admin/mensajes/messenger`, que solicita `enable-bot` a ChatbotX. Nunca la reactives como efecto de una entrega, de un reintento, de cargar la conversación o de que termine la ventana de 24 horas. Reactivar no envía un mensaje al cliente.

El interruptor global se lee del registro único de configuración (`StoreSettings` con `id: 1`). Si ese registro falta o no puede leerse, Super Bot permanece pausado; un propietario debe activarlo explícitamente desde `/admin/mensajes/configuracion` antes de habilitar respuestas automáticas.

Contrato utilizado: `https://chatbot.tiendavirtualsuper.com/api/public-spec.json`. Consultas paginadas a conversaciones, mensajes e integraciones. Las respuestas de conversación individual están dentro de `data`. El envío usa el `inboxId` exacto del canal y una `Idempotency-Key`; el bot se pausa antes de enviar. Se rechazan conversaciones ambiguas o de otro canal.

La interfaz admite respuestas de texto de hasta 1000 caracteres y carga o recepción de adjuntos. Al enviar un archivo, la tienda consulta su ficha privada de Media Library y entrega a ChatbotX la referencia completa (`path`, `url`, tipo, nombre y tamaño), no sólo su ID; así la URL queda asociada al mensaje saliente. Los enlaces HTTPS se muestran directamente; las rutas privadas, `http://filesystem:9000` o un `originPath` interno se sirven mediante un proxy autenticado que vuelve a comprobar la conversación, el canal y el adjunto. Si ChatbotX no entrega ni una URL ni una ruta interna válida, su adaptador debe publicar una URL descargable. Los mensajes permanecen en el chatbot; estas bandejas no se mezclan con las conversaciones locales de otros canales. Las conversaciones se actualizan cada 15 segundos y los mensajes cada 10 segundos mientras la pestaña esté visible.

El conteo de cuentas vinculadas indica registros de integración, no garantiza que un permiso siga vigente. Los errores de permisos y entrega se muestran sin revelar respuestas internas del proveedor. La bandeja administrativa no reintenta envíos manuales ante fallos ambiguos; se pide revisar la conversación. Esto es independiente de los reintentos controlados del adaptador descritos arriba.

Messenger exige responder dentro de las 24 horas del último mensaje entrante (documentación oficial de Meta: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api). TikTok aplica sus permisos y límites en el conector instalado (https://business-api.tiktok.com/portal/bm-api/education-hub).

## Validación

```bash
node --import tsx --test \
  src/lib/super-bot-internal-reply.test.ts \
  src/lib/social-inbox.test.ts \
  src/lib/telegram-bridge.test.ts
```

Las pruebas usan respuestas simuladas, no envían mensajes a clientes. Antes de activar producción, valida con una conversación de prueba consentida: un `200` normal, una entrega repetida con el mismo `eventId`, un `202` sin envío, un `409` pausado sin envío, un adjunto sin texto y la reactivación manual posterior a una atención humana. La creación del token de servicio no autoriza automáticamente ninguna cuenta de Facebook/TikTok.
