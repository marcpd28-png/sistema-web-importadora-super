# Envío de imágenes mediante flujo de ManyChat — preparación

Estado: contrato de solicitudes preparado y probado localmente. NO conectado al envío de producción, NO publicado y NO probado con destinatarios. La ruta actual por Meta sigue fallando con error de permisos #200.

## Datos verificados

- URL aportada: https://app.manychat.com/fb4250670/cms/files/content20260919025706_215753/edit
- Flujo: `content20260919025706_215753`. La consulta autenticada `getFlows` confirmó su presencia y nombre `«Enviar imagen desde CRM`. La presencia en esta lista no acredita que esté publicado ni que entregue imágenes.
- Campos de texto comprobados mediante `getCustomFields`: `crm_imagen_url` = `14982263`; `crm_imagen_texto` = `14982264`.
- Capturas: inicio sin disparador → condición `crm_imagen_url tiene cualquier valor` → rama verde al mensaje WhatsApp con imagen que usa ese campo. Rama roja sin conexión.
- La captura conserva un bloque de texto vacío. Debe eliminarse antes de publicar si el editor lo exige. No se ha configurado la descripción opcional; escribir su campo no implica que se envíe.

## Contrato preparado

`scripts/n8n/manychat-image-flow-plan.cjs` construye dos solicitudes, sin ejecutarlas:

1. `POST /fb/subscriber/setCustomFields`: cargar URL y texto para el identificador ManyChat ya vinculado al cliente.
2. Solo tras éxito explícito de la anterior, `POST /fb/sending/sendFlow` con el mismo contacto y el flujo verificado.

Reutilizar la credencial existente `ManyChat API - Centro de Mensajes`. Nunca inferir el identificador ManyChat a partir del teléfono. Comprobar estado HTTP y `status: success`. La aceptación de `sendFlow` no es confirmación de entrega y no proporciona por sí sola un identificador `wamid` ni prueba que el flujo haya leído el campo.

## Pendiente para una activación segura

- Publicación del flujo por el usuario, tras terminar la revisión del borrador.
- Cola persistente por contacto: el campo de imagen es compartido. Un segundo envío no debe reemplazarlo hasta confirmar que el primero fue consumido por el flujo. Un temporizador fijo o un mutex liberado al responder `sendFlow` no prueba consumo.
- Definir y configurar confirmación al finalizar el bloque de imagen, con correlación estable de solicitud, o verificar otro mecanismo oficial equivalente. Esta confirmación indicará procesamiento del flujo, no entrega al dispositivo.
- Integrar los pasos en n8n preservando idempotencia, los caminos de error y el funcionamiento de texto/documentos. Ante timeout de `sendFlow`, no reenviar automáticamente porque puede haberse iniciado el flujo.
- Prueba expresamente autorizada con un destinatario de prueba, incluida prueba de dos fotos seguidas, antes de activar para todos los clientes.

No se ha cambiado el workflow de salida ni enviado mensajes. La sincronización de mensajes manuales de ManyChat sigue siendo un objetivo separado.

Referencia: [API oficial de ManyChat](https://api.manychat.com/swagger).

## Actualización del 19 de septiembre de 2026

Este documento conserva la preparación inicial. La implementación de producción posterior y su activación se registran en [manychat-image-dispatch](2026-09-19-manychat-image-dispatch.md). El script de este borrador sigue siendo una utilidad sin ejecución de solicitudes.
