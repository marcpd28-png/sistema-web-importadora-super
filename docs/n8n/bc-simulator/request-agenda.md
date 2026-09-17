# Consultas de productos y solicitudes pendientes de BC

La entrada del simulador reúne los mensajes durante 12 segundos de silencio y consulta
`POST /api/internal/chat/requests` antes de decidir entre las ramas anteriores.
El servicio está controlado por `BC_REQUEST_AGENDA_ENABLED=true` en la web.
Con la variable deshabilitada se conserva el recorrido anterior. WhatsApp y ManyChat
siguen fuera del recorrido automático de prueba.

## Comportamiento

- Texto, fichas, imágenes y PDF consultan `commercial-catalog.ts`. Los PDF incluyen
  solamente productos visibles con stock positivo; las consultas puntuales pueden
  identificar un producto publicado agotado y comunicar su disponibilidad.
- El identificador literal del ERP conserva puntos y sufijos. Color, presupuesto,
  exclusiones, marca, tipo y versión del modelo restringen la búsqueda. Un modelo
  base no se reemplaza por Pro/Max. Los errores de escritura no corrigen cifras.
- Cada solicitud conserva tipo, tema/producto, cantidad, atributos, mensajes de
  origen, estado y referencias de evidencia. Una respuesta parcial no termina las
  preguntas restantes. Las correcciones actualizan el tema correspondiente.
- Las especificaciones se responden por atributo desde fichas PUBLICADA. Los datos
  faltantes se señalan expresamente y quedan pendientes; no se completan usando
  características supuestas de la marca o de modelos parecidos.
- Dirección/horario salen de StoreSettings. Entrega y pago usan las mismas variables
  ROUTER_V2_DELIVERY_METHODS/ROUTER_V2_PAYMENT_METHODS y valores predeterminados
  confirmados que el motor existente. No se inventan tarifas, plazos ni cobertura.
- Elegir un SKU de una lista resuelve las preguntas pendientes de ese tema. Una
  referencia ordinal ambigua entre varias listas pide identificación por código.
- La solicitud de asesor, comprobantes, audio, imágenes entrantes y la continuación
  del checkout conservan el motor anterior. Una selección inequívoca se comparte
  con su estado comercial sin crear pedidos ni sobrescribir los datos de checkout.

## Persistencia y concurrencia

La migración `20260918010000_add_conversation_request_agenda` añade una tabla
independiente relacionada con Conversation. No cambia productos, precios, stock,
identificadores ERP ni las variantes existentes. Reconcilia además el campo
StoreSettings.storeAddress que ya utiliza el esquema del motor.

La migración `20260918020000_align_sales_stage_enum` alinea el tipo de etapa
comercial de Prisma con el enum que ya utiliza BC en PostgreSQL. Conserva los
valores existentes y permite que la web comparta la selección sin errores de tipo.

El endpoint de lotes guarda agenda y mensajes en una sola transacción, con bloqueo
por conversación, revisión optimista e idempotencia `bc:<último mensaje>`.
Antes de publicar verifica que el mensaje siga vigente, la atención siga automática
y los productos conserven visibilidad, precio y stock. Si cambia el inventario se
recalcula una vez; los fallos persistentes se señalan y no publican una cotización
obsoleta. Las llamadas HTTP fallidas tienen un reintento en n8n.

Los PDF tienen una huella que incluye consulta, inventario, precios e imágenes.
El manifiesto con filtros y códigos se guarda en `.cache/catalog-manifests`, fuera
del directorio público y de Git. Los pedidos reales no intervienen en estas pruebas.

## Verificación

```powershell
node --import tsx --test src/lib/bc-request-agenda.test.ts src/lib/catalog-selection.test.ts src/lib/catalog-pdf.test.ts src/lib/chat-input-batch.test.ts src/lib/chat-greeting.test.ts src/lib/quote-pricing.test.ts src/app/api/internal/chat/simulator-batch/*.test.ts src/app/api/internal/chat/simulator-input-batch/route.test.ts
node --test scripts/test-bc-simulator.mjs scripts/n8n/enable-request-agenda.test.mjs
npx tsc --noEmit --incremental false
npm run build
```

Las verificaciones del VPS deben incluir mensajes fragmentados, catálogo + consulta
técnica + precio + envío, selección posterior por código, reintentos, PDF descargable,
correcciones y el saludo/checkout anterior. Registrar respuestas y revisiones en el
directorio privado de respaldo del despliegue.

## Límites operativos

El análisis de solicitudes es determinista y conservador. No promete interpretar
cualquier formulación del lenguaje natural. Si una referencia o producto no se puede
identificar, pide aclaración. La exactitud de la información depende de las fichas
publicadas y las políticas configuradas. Confirmar un dato pendiente requiere
completar su fuente, no aumentar la confianza artificialmente.

Se conservan todas las solicitudes sin resolver y las últimas 50 terminadas. La
agenda admite hasta 200 solicitudes y 100 temas; no se fusionan SKUs por similitud.
La capa completa de perfiles comerciales, revisión humana y familias del documento
inicial no se sustituye por este cambio: aquí se implementa la integración de consulta
y seguimiento sobre los datos existentes.

## Despliegue verificado — 17 de septiembre de 2026

- Web: código `09c3a9201dab493821ff370fa1b601a3c614a1b1`, rama
  `codex/desarrollo-actualizado`, PM2 `importadora`, puerto 4000.
- Motor: `fe81989fe6c9dc7e937892d8f55717f5f6155866`, rama
  `codex/bc-router-simulador`, PM2 `importadora-router-v2-staging`, puerto 4001.
- Entrada del simulador `HVFMz7fCQXRNXB3U` publicada y comparada con el grafo
  preparado. Versión: `7dfdb014-9303-454d-b74c-cf5c04c20928`.
- Dos migraciones aplicadas; compilaciones completas de ambas aplicaciones,
  TypeScript y ESLint de los archivos modificados sin errores.
- 104 pruebas automatizadas aprobadas: 58 de web, 40 del motor y 6 de workflows.
- Auditoría a las 23:49:48 UTC: 1.663 productos publicados, todos con stock,
  recuperados exclusivamente por su código. Cero fallos, incluidos códigos con
  puntos y sufijos espaciados como `N755 - SQ`. Es una fotografía del inventario,
  no una cifra fija.

La prueba HTTP verificó seis mensajes fragmentados, cinco solicitudes persistidas,
un PDF descargable, la cotización mayorista de seis unidades al elegir un SKU,
ausencia de catálogos duplicados, todos los atributos pedidos (con datos faltantes
explícitos), autorización y rechazo de conversaciones reales.

El recorrido completo panel/API administrativa → n8n → web/motor → simulador
verificó la consulta mixta en 12,658 segundos desde el último mensaje, sin respuestas
duplicadas de ejecuciones anteriores; cuatro fotografías de extensores de pantalla
en 14,572 segundos; saludo, precio actual y conservación del producto seleccionado
al continuar la compra. Los tiempos incluyen los 12 segundos de agrupación y son
casos concretos, no un percentil de carga. Se eliminaron los contactos de prueba.

Respaldo inicial de aplicación, entorno, base de datos y workflow, junto con
`api-verification.json`, `workflow-verification.json` y `sku-audit.json`:
`/home/IMPORTADORA-backups/bc-agenda-23c9545/`.
Compilación y pruebas finales de web en `bc-agenda-62c1139/`; del motor en
`bc-agenda-router-4b1a836/`, dentro del mismo directorio de respaldos.
