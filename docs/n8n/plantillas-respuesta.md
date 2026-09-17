# Plantillas de respuesta

Las plantillas se administran en `/admin/mensajes/plantillas`: crear, editar,
duplicar, activar/desactivar, eliminar, buscar y probar con valores de ejemplo.
Se guardan en la tabla existente `MessageTemplate`; no se necesita migración.
Las variables se extraen del contenido y se guardan en `variables`.

## Uso desde la bandeja

1. Abrir una conversación y pulsar **Usar plantilla**, junto al adjunto.
2. Elegir una plantilla activa. `{{nombre}}` y `{{telefono}}` se completan con
   los datos disponibles del contacto. Completar los demás campos manualmente.
3. Insertar la respuesta en el borrador; se puede editar antes de enviarla.
4. Enviar. Se utiliza el outbound n8n existente, con las mismas credenciales,
   controles de contacto real, confirmación y estados pending/sent/failed.

Insertar o guardar nunca envía mensajes. Una plantilla inactiva, eliminada o
modificada después de seleccionarla no puede enviarse; hay que volver a elegirla.
Si el envío falla, el borrador se conserva. Una respuesta sin plantilla mantiene
el contrato anterior.

## API de lectura y preparación para n8n

Configurar una credencial **Header Auth** en los nodos HTTP Request de n8n:

- Nombre: `x-internal-api-key`
- Valor: el `N8N_INTERNAL_API_KEY` configurado en el servidor web.

Usar HTTPS en producción. La clave se conserva en credenciales de n8n, nunca
en el navegador ni en el contenido de una plantilla.

### Listar plantillas activas

`GET https://TU_DOMINIO/api/internal/chat/templates`

Respuesta: `{ "items": [...] }`, con `id`, `name`, `category`, `content`,
`variables`, `isActive` y `updatedAt`. Usar el `id` estable de la plantilla en el
workflow; editar su nombre o texto conserva el mismo ID. La respuesta no se cachea.

### Preparar un mensaje

`POST https://TU_DOMINIO/api/internal/chat/templates`

Cuerpo JSON del nodo HTTP Request:

```json
{
  "templateId": "ID_OBTENIDO_EN_EL_LISTADO",
  "conversationId": "ID_DE_LA_CONVERSACION",
  "variables": {
    "producto": "Proyector",
    "nro_pedido": "P-123"
  }
}
```

`conversationId` es opcional; permite completar `nombre` y `telefono` desde el
contacto. Los valores enviados en `variables` prevalecen. Sin conversación,
enviar todos los valores necesarios. Solo se admiten cadenas de texto.

Ejemplo de respuesta:

```json
{
  "content": "Hola María, tu pedido P-123 de Proyector está listo.",
  "type": "TEXT",
  "template": {
    "id": "ID_DE_LA_PLANTILLA",
    "name": "Pedido listo",
    "updatedAt": "2026-09-17T12:00:00.000Z",
    "values": { "nombre": "María", "producto": "Proyector", "nro_pedido": "P-123" },
    "edited": false
  }
}
```

En el siguiente nodo, usar `{{ $json.content }}` como texto a enviar. Este endpoint
solo prepara la respuesta: no llama a ManyChat/Meta ni registra un envío.
Prepararla inmediatamente antes de enviarla evita reutilizar contenido antiguo.

Errores: `401` clave inválida, `503` clave del servidor no configurada, `400`
JSON/datos inválidos, `404` plantilla inactiva/inexistente o conversación inexistente,
`422` variables faltantes o respuesta no válida. Para variables faltantes se devuelve
`missingVariables`. Detener la rama de envío si la preparación falla; no activar
“Never Error” para enviar respuestas de error como mensajes.

## Contrato outbound y registro de envíos del bot

El envío manual conserva `channel`, `conversationId`, `recipient`, `content`,
`type` (en minúscula), `manychatSubscriberId`, `mediaUrl`, `agentId`, `requestId`
y `timestamp`. Solo cuando se usa una plantilla se añade `template`, con la misma
estructura mostrada arriba. `edited` indica si el agente cambió el texto preparado.
El workflow debe enviar **content tal como llega**; no volver a renderizar la
plantilla, porque perdería las modificaciones revisadas por el agente.

El webhook configurado en `N8N_OUTBOUND_WEBHOOK_URL` sigue autenticándose con
`N8N_OUTBOUND_API_KEY` y debe devolver una confirmación real:

```json
{ "ok": true, "provider": "meta-cloud", "messageId": "wamid.CONFIRMADO" }
```

Para automatizaciones que envían directamente desde n8n, después del envío usar
el endpoint existente `POST /api/internal/chat/outgoing`, autenticado con la clave
interna. Añadir el objeto `template` devuelto por la preparación junto con
`conversationId`, `content`, `type: "TEXT"`, `provider`, `externalMessageId`,
`requestId` y `status`. El historial conservará qué versión y valores se usaron.
Este callback registra el resultado; no hace un segundo envío. Los envíos manuales
ya se registran desde la web, por lo que no necesitan este callback adicional.

## Límites y alcance

- Nombre: 120 caracteres; categoría: 60; mensaje preparado: 4000.
- Hasta 20 variables: `{{nombre_variable}}`, comenzando con una letra minúscula,
  seguidas de letras minúsculas, números o `_`, máximo 40 caracteres por nombre.
- Sustitución de texto simple: no se ejecutan expresiones JavaScript o n8n dentro
  del contenido. Los valores de ejemplo del editor no se guardan.
- Son respuestas guardadas de la aplicación. No crean ni aprueban plantillas
  oficiales de WhatsApp/Meta ni alteran las restricciones del proveedor.
- No se publica ni modifica un workflow remoto al guardar una plantilla. Los
  workflows deben incorporar la llamada de preparación cuando corresponda.

## Verificación local

`node --import tsx --test src/lib/message-templates.test.ts src/lib/message-templates-integration.test.ts src/lib/n8n-outbound.test.ts src/lib/messages-outbound-validation.test.ts src/lib/messages-outbound-regression.test.ts src/app/api/internal/chat/outgoing/route.test.ts`

Las pruebas de integración usan una base y transporte simulados. No envían
mensajes a clientes ni modifican workflows o datos de producción.
