# Despachador de imágenes de ManyChat

Versión desplegada en VPS: `fdc80a7`, HTTP 200 tras reinicio con respaldo. Flujo `content20260919025706_215753`. Ruta nueva habilitada el 2026-09-19 tras la confirmación del usuario y su captura del flujo guardado con callback. La captura muestra STOPPED; no se ha verificado una ejecución real por API.

## Comportamiento

Con `MANYCHAT_IMAGE_FLOW_ENABLED=true`, las imágenes manuales de la bandeja pasan al despachador de ManyChat. Texto y documentos mantienen su ruta existente. La credencial `MANYCHAT_IMAGE_API_KEY` se configura de forma privada a partir de la conexión existente de n8n; no está en Git.

El despachador valida el contacto y URL HTTPS, reserva el contacto bajo un bloqueo transaccional PostgreSQL y registra la reserva en el mensaje. Carga los campos de URL, texto, requestId y firma, y solicita el flujo. Las respuestas HTTP y `status: success` deben confirmar ambos pasos. El texto opcional está preparado en el campo, pero el flujo visual actual solo contiene imagen.

Una segunda imagen al mismo contacto devuelve un error de espera mientras la primera no tenga confirmación final. No es una cola automática: el asesor puede enviar la siguiente después de la confirmación. La reserva persiste entre reinicios y los envíos inciertos no caducan automáticamente. Ante una respuesta incierta se bloquea Reintentar; resolver exige revisar el proveedor, no reenviar a ciegas. Una negativa explícita del proveedor libera el contacto.

El callback firmado `image-ack` registra el procesamiento final del flujo. Las actualizaciones atómicas de metadatos conservan una confirmación que llegue antes de la respuesta a sendFlow. La aceptación se muestra como `sent` en el convenio existente del Centro de Mensajes: el texto de interfaz aclara que la entrega no está confirmada. El identificador `manychat-flow:<id-local>` es correlación interna, no un identificador WhatsApp `wamid`.

## Verificación

- 117 pruebas en VPS, incluida validación previa a la reserva, campos, firma, flujo exacto, rechazo, timeout, no duplicación y confirmación temprana.
- Prueba de PostgreSQL real en transacción revertida: crear registros temporales, reservar un contacto, bloquear una segunda imagen, aplicar confirmación y permitir siguiente envío. Transporte simulado; cero mensajes a clientes y cero registros permanentes de prueba.
- ESLint en el checkout de despliegue y compilación de producción.

## Activación y validación pendiente

`MANYCHAT_IMAGE_FLOW_ENABLED=true` configurado en `.env` y en el entorno efectivo de PM2. Reinicio controlado completado; web (4000) y motor (4001) respondieron HTTP 200. Configuración PM2 persistida. Respaldo previo: `/home/IMPORTADORA-backups/manychat-image-enable-fMj5Ssbs`.

No se enviaron mensajes de prueba. Falta un envío elegido por el usuario desde el Centro de Mensajes para observar ejecución, callback y entrega real. Guardado y la presencia del flujo en getFlows no demuestran por sí solos su ejecución: la captura de ManyChat aún muestra STOPPED y no se ha confirmado su significado para este flujo sin disparadores.

La solicitud externa acredita procesamiento del flujo, no entrega a WhatsApp. La sincronización de todos los envíos manuales originados en ManyChat sigue siendo un trabajo independiente.
