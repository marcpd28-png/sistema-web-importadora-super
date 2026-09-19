# Despachador de imágenes de ManyChat

Versión desplegada en VPS: `fdc80a7`, HTTP 200 tras reinicio con respaldo. Flujo `content20260919025706_215753`. Ruta nueva desactivada hasta publicar la edición del flujo con callback.

## Comportamiento

Con `MANYCHAT_IMAGE_FLOW_ENABLED=true`, las imágenes manuales de la bandeja pasan al despachador de ManyChat. Texto y documentos mantienen su ruta existente. La credencial `MANYCHAT_IMAGE_API_KEY` se configura de forma privada a partir de la conexión existente de n8n; no está en Git.

El despachador valida el contacto y URL HTTPS, reserva el contacto bajo un bloqueo transaccional PostgreSQL y registra la reserva en el mensaje. Carga los campos de URL, texto, requestId y firma, y solicita el flujo. Las respuestas HTTP y `status: success` deben confirmar ambos pasos. El texto opcional está preparado en el campo, pero el flujo visual actual solo contiene imagen.

Una segunda imagen al mismo contacto devuelve un error de espera mientras la primera no tenga confirmación final. No es una cola automática: el asesor puede enviar la siguiente después de la confirmación. La reserva persiste entre reinicios y los envíos inciertos no caducan automáticamente. Ante una respuesta incierta se bloquea Reintentar; resolver exige revisar el proveedor, no reenviar a ciegas. Una negativa explícita del proveedor libera el contacto.

El callback firmado `image-ack` registra el procesamiento final del flujo. Las actualizaciones atómicas de metadatos conservan una confirmación que llegue antes de la respuesta a sendFlow. La aceptación se muestra como `sent` en el convenio existente del Centro de Mensajes: el texto de interfaz aclara que la entrega no está confirmada. El identificador `manychat-flow:<id-local>` es correlación interna, no un identificador WhatsApp `wamid`.

## Verificación

- 117 pruebas en VPS, incluida validación previa a la reserva, campos, firma, flujo exacto, rechazo, timeout, no duplicación y confirmación temprana.
- Prueba de PostgreSQL real en transacción revertida: crear registros temporales, reservar un contacto, bloquear una segunda imagen, aplicar confirmación y permitir siguiente envío. Transporte simulado; cero mensajes a clientes y cero registros permanentes de prueba.
- ESLint en el checkout de despliegue y compilación de producción.

## Activación pendiente

La configuración del servidor queda en `MANYCHAT_IMAGE_FLOW_ENABLED=false` hasta que el usuario publique la edición del flujo que incluye la solicitud externa. Publicar la primera versión sin callback no basta: dejaría la primera imagen pendiente de confirmación y bloquearía la siguiente.

Después: activar el indicador con respaldo y reinicio controlado, comprobar configuración efectiva y solicitar al usuario un envío real desde su bandeja. No afirmar entrega hasta observar ManyChat/WhatsApp y la confirmación final. La sincronización de todos los envíos manuales originados en ManyChat sigue siendo un trabajo independiente.
