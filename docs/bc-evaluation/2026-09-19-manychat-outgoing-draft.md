# Sincronización de mensajes nuevos de ManyChat — borrador

## Alcance y estado

Se solicita ver en el Centro de Mensajes los envíos nuevos de ManyChat, automáticos y manuales, desde la activación. No se solicita recuperar el historial. No publicado ni activado; no se realizaron envíos de prueba. El receptor preparado NO proporciona por sí solo acceso a los envíos de ManyChat.

## Evidencia de la conexión

Una consulta de solo lectura a la cuenta WhatsApp Business confirmó que ManyChat y la aplicación `importaciones super api` están suscritas a esa misma cuenta. Consultar las suscripciones concretas de la aplicación requiere autenticar esa aplicación: el token de usuario devolvió `Application Secret required` y la credencial de aplicación formada con el secreto disponible en el servidor devolvió `Invalid OAuth access token signature`. No se modificaron credenciales, permisos ni suscripciones. No queda probado que recibamos eventos de salida de ManyChat.

La [API pública de ManyChat](https://api.manychat.com/swagger) consultada no incluye historial ni suscripción global a mensajes manuales. Las [solicitudes externas](https://help.manychat.com/hc/en-us/articles/14281285374364-Dev-Tools-External-request) permiten instrumentar automatizaciones; no equivalen a eventos de todos los envíos del Inbox. La viabilidad y disponibilidad de eventos de salida de Meta para esta integración todavía deben verificarse.

## Receptor preparado, deshabilitado

`POST /api/internal/chat/manychat-outgoing`, protegido por la credencial interna existente de n8n. Es un contrato propio para un adaptador autenticado; no es un formato oficial de webhook de ManyChat.

Requiere tanto `MANYCHAT_OUTGOING_SYNC_ENABLED=true` como `MANYCHAT_OUTGOING_SYNC_STARTED_AT` en ISO 8601. No se han configurado. La fecha debe ser el instante real de activación, nunca una fecha histórica para importar mensajes.

Campos: `eventId` estable entre reintentos, `subscriberId`, `occurredAt`, `source` (`agent` o `automation`), `type`, contenido y/o URL HTTPS del adjunto. `externalMessageId` es opcional y debe ser el identificador real cuando exista. El adaptador debe usar un identificador consistente para cada mensaje; no alternar entre identificadores sintéticos y reales en reintentos.

`status` por defecto es `unknown`; solo transmitir un estado más específico si lo respalda el proveedor. Una acción ejecutada después de un bloque no prueba entrega. El receptor no actualiza estados posteriores de duplicados: esa reconciliación requiere un contrato de eventos de estado verificado.

Conserva fecha, tipo, contenido, adjunto y origen; solo vincula contactos ya existentes por su identificador ManyChat, con exactamente una conversación WhatsApp. Rechaza asociaciones ambiguas y simuladores. Ignora mensajes anteriores a activación y fechas futuras inválidas. Evita duplicados mediante identificador único y maneja colisiones concurrentes. No ejecuta transporte, automatizaciones ni incrementa mensajes no leídos del cliente. La interfaz identifica el origen ManyChat y no permite reenviar una copia fallida mediante Reintentar.

## Pendiente antes de activar

1. Verificar la configuración y autenticación de la aplicación Meta correcta sin cambiar la conexión de ManyChat.
2. Confirmar un evento real de salida que incluya los mensajes manuales. Si no está disponible, declarar ese alcance bloqueado, sin presentarlo como resuelto por instrumentar automatizaciones.
3. Configurar el adaptador de n8n según el evento real, incluidos identificadores estables, atribución de origen, adjuntos y estado. No inventar datos ausentes.
4. Decidir el manejo de contactos sin conversación y estados posteriores; el borrador devuelve un error explícito en lugar de adivinar.
5. Verificar un envío expresamente autorizado y su copia única antes de publicar y activar con una fecha de inicio concreta.

Validación local: pruebas del registro y de los controles del endpoint; TypeScript y ESLint. No prueba de entrega o captura real.

## Publicación del código — 19 de septiembre de 2026

El receptor y sus pruebas se incluyen en la actualización del proyecto solicitada por el usuario. Publicar el código no activa la sincronización: se conservan los controles de activación y los pendientes de integración descritos arriba. No se realizaron envíos a clientes para este despliegue.
