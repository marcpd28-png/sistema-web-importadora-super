# Copiloto y agrupación de mensajes

Rocky espera cinco segundos desde el último fragmento antes de responder. Si el cliente escribe «cámara» y luego «espía», procesa ambos mensajes como una sola entrada, conserva los identificadores originales en `inputMessageIds` y agrega `BATCHED_INPUT` a la evidencia. Solo el mensaje más reciente genera una ejecución y una respuesta.

El Centro de Mensajes ofrece tres modos por conversación:

- **Asesor:** Rocky no procesa ni envía respuestas.
- **Rocky sugiere:** analiza la conversación y muestra una propuesta que el asesor puede enviar o descartar.
- **Rocky automático:** puede poner una respuesta en la cola de salida únicamente cuando `ROCKY_AUTO_ENABLED=true` y se cumplen los demás controles de contacto, conversación y tienda.

El modo copiloto se controla de manera independiente con `ROCKY_COPILOT_ENABLED`. Activarlo no habilita envíos automáticos. Cuando un asesor toma la conversación, el modo pasa a manual y el bot queda pausado.

La verificación `scripts/rocky/verify-supervised-batch.mjs --execute` crea exclusivamente una conversación de simulación, envía dos fragmentos, comprueba una sola respuesta y no contacta clientes reales.
