# Centro de Mensajes: cola y recibos — 19 de septiembre de 2026

## Implementación

- Recibos Meta persistidos antes de conciliarlos: identificador `wamid`, número empresarial permitido, destinatario, estado y fecha. Se conservan los eventos que llegan antes del mensaje y se reintenta su asociación. No se crea una conversación a partir de un recibo de estado.
- Estados de entrega y lectura no retroceden ante callbacks duplicados o atrasados. Se verifica el destinatario y se excluyen simuladores.
- El webhook directo requiere firma válida, incluida la configuración del secreto. El adaptador interno de n8n requiere la credencial interna.
- La bandeja consulta cambios de estado de los últimos 200 mensajes salientes cargados, además de mensajes nuevos. Muestra por separado aceptación, procesamiento del flujo y entrega.
- Cola persistente en ChatMessage: un envío activo por contacto, exclusión entre procesos y cancelación atómica únicamente antes de iniciar el envío. Se conserva la confirmación que llega antes de la respuesta del proveedor.
- Una reserva interrumpida pasa a revisión tras dos minutos. El paso del tiempo NO libera el contacto ni reenvía. Una confirmación firmada tardía permite continuar; un rechazo explícito también libera el contacto.
- Worker supervisado con la web; las funciones permanecen condicionadas por configuración.

## Activación pendiente

`MANYCHAT_IMAGE_QUEUE_ENABLED=true` requiere primero validar el flujo y callback reales. `WHATSAPP_STATUS_SYNC_ENABLED=true` requiere verificar la fuente autenticada y definir `WHATSAPP_STATUS_PHONE_NUMBER_IDS` (IDs empresariales separados por coma). El adaptador interno recibe el payload Meta íntegro, no un formato inventado.

ManyChat getFlows/getCustomFields respondió 200 y confirmó flujo/campos. Esto no demuestra ejecución ni entrega. El editor pide iniciar sesión. La consulta de suscripciones de la aplicación Meta devuelve 401, Invalid OAuth access token signature. No se alteraron conexiones, suscripciones ni credenciales.

No se ha probado ni habilitado la captura general de los mensajes manuales del Inbox de ManyChat. Los recibos de estado no contienen por sí solos el texto de esos envíos. El texto acompañante del flujo visual sigue pendiente de revisar en el editor.

## Validación

Pruebas locales, TypeScript y ESLint. Compilación aislada en VPS y pruebas en una base PostgreSQL nueva y temporal, eliminada al terminar: concurrencia, orden, idempotencia, cancelación, confirmación temprana, timeout, reserva interrumpida, confirmación tardía, aislamiento de contactos, recibos previos al mensaje y estados fuera de orden. Transporte simulado; no se enviaron mensajes a clientes.

La ampliación del carrito del bot y el reconocimiento general de imágenes/frases son una fase separada y no quedan acreditados por esta entrega.

## Despliegue y comprobación

Código `c01cc9c` publicado en Git y activado en VPS. Respaldo de PostgreSQL y compilación previa en `/home/IMPORTADORA-backups/inbox-reliability-20260919`. Migración aditiva aplicada; worker supervisado iniciado. Web pública, login y robots respondieron 200. Cola y estados siguen deshabilitados; endpoints internos respondieron 503 autenticados y la tabla de recibos permanece vacía.

Se inspeccionó el workflow real `01 - Incoming Messages`: sus nodos no procesan `statuses` ni los reenvían al nuevo receptor. No se cambió este flujo: su conexión y autenticación deben verificarse antes de activar la recepción de estados. Esto es independiente de la captura de contenido de mensajes manuales de ManyChat, aún no demostrada.
