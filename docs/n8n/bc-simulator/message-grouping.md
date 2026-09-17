# Agrupación de mensajes separados

BC espera **12 segundos sin recibir un nuevo mensaje** en una conversación. Se mide
desde la recepción en el servidor; no se depende del reloj del cliente ni de una
señal de «está escribiendo» de WhatsApp. Cada nuevo mensaje reinicia la pausa.

La entrada registra y confirma cada mensaje inmediatamente. Después, n8n espera
y consulta `/api/internal/chat/simulator-input-batch`. Las ejecuciones cuyo mensaje
ya no es el último terminan sin responder. Si aún falta tiempo, la ejecución del
último mensaje vuelve a esperar el tiempo restante.

Una vez transcurrida la pausa, se unen en orden todos los mensajes pendientes desde
la última respuesta entregada del bot o asesor. No se limita la consulta a los
últimos ocho mensajes ni a lo escrito en los últimos doce segundos. Por ejemplo:

1. `hola`
2. Ocho segundos después: `busco catálogo`
3. Ocho segundos después: `de proyectores`
4. Doce segundos después del tercer mensaje: se procesa `hola\nbusco catálogo\nde proyectores`.

La selección de catálogo o motor conversacional se hace **después** de agrupar.
Ambas ramas usan el mismo grupo. El motor no añade una segunda espera.
Las referencias multimedia se conservan junto al texto para el recorrido que las
admita; el formulario del simulador actualmente solo permite enviar texto.

Antes de guardar la respuesta, `/api/internal/chat/simulator-batch` vuelve a validar
`triggerMessageId`. Si llegó otro mensaje mientras se preparaba un PDF o la respuesta
del motor, descarta la salida antigua. La nueva ejecución incluye los mensajes aún
pendientes. La recepción y el registro de salida se serializan por conversación
mediante un bloqueo transaccional de PostgreSQL; los reintentos comparten la clave
`bc:<último mensaje>` y no duplican las respuestas.

Cada mensaje individual sigue visible en el historial. La salida registra también
`sourceMessageIds`. Si una consulta acumulada supera 100 mensajes o 10.000 caracteres,
se pide al cliente resumirla en lugar de recortarla silenciosamente.

El panel permite seguir enviando mensajes durante la espera y muestra esta regla.
La funcionalidad se aplica a **BC en el simulador**. No conecta las entradas reales
de WhatsApp/ManyChat que actualmente están aisladas.

## Publicación

Desplegar primero la web y luego publicar conjuntamente los tres workflows del
simulador (`incoming.json`, `router.json` y `catalog.json`). El script
`scripts/n8n/enable-message-grouping.mjs` aplica la transformación de forma repetible
y conserva las referencias a credenciales del flujo de entrada.

## Verificación

`node --import tsx --test src/lib/chat-input-batch.test.ts src/lib/messages-incoming-media.test.ts src/app/api/internal/chat/simulator-input-batch/route.test.ts src/app/api/internal/chat/simulator-batch/route.test.ts`

`node --test scripts/test-bc-simulator.mjs scripts/n8n/enable-message-grouping.test.mjs`

Probar en el entorno publicado mensajes separados por ocho segundos, ausencia de
respuesta antes de los doce segundos finales, conservación de todos los fragmentos,
un único lote de respuesta y conversaciones independientes. Verificar catálogo y
consulta conversacional, además de rechazar una salida antigua mientras llega texto
nuevo.
