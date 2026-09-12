# Router V2 - contrato de orquestación n8n

Este documento describe el flujo objetivo entre WhatsApp/Meta, n8n y el backend Router V2. No activa el workflow ni reemplaza la integración actual.

## Principios

- n8n orquesta; el backend decide la lógica comercial.
- `ConversationSalesState` es la fuente de estado de la venta.
- La IA visual solo extrae pistas. El catálogo real decide el producto.
- La IA de texto solo reescribe un borrador controlado. Si falla o cambia hechos protegidos, se usa el borrador determinista.
- Stock, precios, mayorista y totales salen de PostgreSQL/ERP.
- Nunca se expone la cantidad exacta de stock al cliente.
- Un voucher es evidencia de pago, no confirmación automática.
- Human handoff detiene la respuesta automática.

## Secuencia inbound recomendada

1. Meta entrega el webhook a n8n.
2. n8n normaliza el mensaje y llama `POST /api/internal/chat/incoming`.
3. Guardar `conversationId`, `messageId`, `messageType`, `content` y `mediaUrl` que devuelva/reciba el backend.
4. Esperar aproximadamente 2.5 segundos para absorber mensajes fragmentados.
5. Llamar `POST /api/internal/chat/router-v2/batch` con `conversationId` y `triggerMessageId`.
6. Si `batch.status = SUPERSEDED`, finalizar esa ejecución sin contestar. Otra ejecución más reciente procesará el lote.
7. Si `batch.status = READY`, usar `batch.content` y `batch.media` como entrada consolidada.

## Imagen de producto

Si el lote contiene una imagen y la conversación NO está esperando voucher:

1. n8n descarga el archivo desde Meta usando sus credenciales.
2. n8n lo convierte a `data:image/...;base64,...` o proporciona una URL HTTP(S) accesible.
3. Llama `POST /api/internal/chat/router-v2/vision` con `imageUrl` y `customerMessage`.
4. Si `analysis.status = READY`, enviar `visualHints` al endpoint principal del Router V2.
5. Si Vision falla o la confianza es baja, el Router pide una foto más clara/etiqueta y nunca adivina el SKU.

No ejecutar Vision cuando el estado sea `AWAITING_PAYMENT_CONFIRMATION`; una imagen en esa etapa puede ser un voucher.

## Nota de voz / audio

1. n8n descarga el audio desde Meta.
2. n8n lo convierte a un Data URL de audio base64.
3. Llama `POST /api/internal/chat/router-v2/transcribe`.
4. Si `transcription.status = READY`, usar el texto transcrito como `content` del Router V2.
5. Si no se puede transcribir, no inventar el contenido; derivar o pedir al cliente que escriba el dato importante.

## Router principal

Llamar `POST /api/internal/chat/router-v2` con:

```json
{
  "conversationId": "...",
  "content": "mensaje consolidado o transcripción",
  "messageType": "TEXT|IMAGE|AUDIO|DOCUMENT|...",
  "mediaUrl": "...",
  "visualHints": null
}
```

El backend devuelve, entre otros:

- `analysis`
- `persistedState`
- `commercialPrice`
- `productInformation`
- `responsePlan`
- `responseContext`
- `draftText`
- `outboundMessages`
- `checkoutDecision`
- `orderCreation`
- `orderStatus`

## Human handoff

Si `nextAction = HUMAN_HANDOFF` o `responsePlan.answerType = HUMAN_HANDOFF`:

- no enviar una respuesta comercial adicional;
- marcar/encaminar la conversación para atención humana según el workflow de n8n;
- preservar el `ConversationSalesState` para que el asesor vea el contexto acumulado.

## Redacción con IA opcional

El Router siempre genera `draftText` determinista. Opcionalmente n8n puede llamar:

`POST /api/internal/chat/router-v2/draft`

con:

```json
{
  "baseline": "draftText",
  "context": {}
}
```

Si devuelve `status = GENERATED`, usar el texto generado. Si devuelve `FALLBACK` o `NOT_CONFIGURED`, usar el texto retornado, que conserva el borrador seguro.

El guard de redacción rechaza cambios de números y de identificadores protegidos.

## Outbound

`outboundMessages` es la propuesta estructurada para el canal. Puede contener:

- `TEXT`
- `IMAGE`
- `DOCUMENT`

n8n debe enviarlos en orden mediante el workflow Outbound. No debe recalcular precios ni modificar contenido comercial estructural.

## Flujo catálogo

`CATALOG_REQUEST` sin modalidad:

1. preguntar `por mayor` o `por unidades`;
2. guardar `catalogPending`;
3. si responde mayorista, enviar PDF solo si hay URL oficial configurada;
4. si responde retail/unidades, mostrar productos concretos con imagen y precio en vez de mandar un PDF genérico;
5. al elegir producto, retomar selección de variante/cantidad/checkout.

## Flujo de checkout

Producto → variante → intención → cantidad → precio real → confirmación → datos del cliente → boleta/factura → documento → entrega → detalles de entrega → confirmación final → crear pedido PENDING → método de pago → voucher → validación humana/externa.

No crear orden antes de la confirmación final. No marcar `PAID` por recibir una imagen.

## Configuración requerida antes de activar

Variables sin valores en el repositorio:

- `N8N_INTERNAL_API_KEY`
- `OPENAI_API_KEY` para Vision, transcripción y redacción opcional
- `ROUTER_V2_VISION_MODEL` opcional
- `ROUTER_V2_TEXT_MODEL` opcional
- `ROUTER_V2_TRANSCRIBE_MODEL` opcional
- `ROUTER_V2_WHOLESALE_CATALOG_URL`
- `ROUTER_V2_PAYMENT_METHODS`
- `ROUTER_V2_DELIVERY_METHODS`

Antes del cutover también se deben rotar las claves internas que hayan sido expuestas durante desarrollo.

## Regla de activación

No activar Router V2 ni desconectar ManyChat hasta que:

1. TypeScript y tests estén verdes.
2. Las variables de negocio estén configuradas con datos reales.
3. Se ejecuten pruebas controladas contra PostgreSQL en el worktree.
4. Se pruebe n8n end-to-end con un canal de prueba o una ventana controlada.
5. Exista rollback claro hacia la integración actual.
