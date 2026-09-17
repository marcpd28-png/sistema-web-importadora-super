# Regla general de consulta de productos

Aplicada al motor BC del simulador el 17 de septiembre de 2026. El código del motor está en la rama `codex/bc-router-simulador`, checkout local `.git/bc-router-worktree`, y se ejecuta en `/home/IMPORTADORA-router-v2-staging` (PM2 `importadora-router-v2-staging`, puerto 4001).

## Comportamiento

1. Interpretar la identidad del producto antes de filtrar disponibilidad: eliminar saludos y frases de consulta/cortesía, normalizar acentos, plurales y errores comunes de escritura.
2. Usar el inventario para corregir errores leves de palabras. Los números de modelo, capacidades y versiones no admiten aproximación. No sustituir silenciosamente un modelo base por Pro, Pro+, Max, Lite u otra versión.
3. Consultar de nuevo visibilidad, stock y precio antes de responder. Solo se almacenan temporalmente los datos de identidad (30 segundos); los datos comerciales no se cachean.
4. Producto publicado con stock: responder con datos actuales; si hay varias coincidencias, ofrecer las opciones y pedir selección.
5. Producto publicado sin stock: informar que está agotado y permitir buscar alternativas. No avanzar a compra ni cotizarlo como disponible.
6. Producto oculto: indicar que la consulta no está disponible en el catálogo, sin exponer nombre interno, SKU, precio, foto ni enlace. La referencia en la respuesta procede de las palabras del cliente, normalizadas.
7. Sin coincidencia suficiente: pedir modelo, código o datos adicionales. No sustituir la búsqueda por productos que solo compartan una palabra.
8. Al cambiar de producto, descartar los importes de la selección anterior. Comprobar también los productos seleccionados antes de continuar si han perdido stock o visibilidad.

La misma resolución se utiliza para consultas por texto y para identidad/código obtenidos de imágenes con confianza suficiente. La entrada de audio transcrita utiliza la ruta textual. Una consulta de producto tiene prioridad frente a una pregunta pendiente de modalidad de compra. Las solicitudes explícitas de catálogo conservan su flujo de PDF.

## Implementación y comprobaciones

Archivos principales del motor: `router-v2-product-query.ts`, `router-v2-text-product-resolver.ts`, `router-v2-product-decision.ts`, `router-v2-visual-product-resolver.ts` y la ruta `/api/internal/chat/router-v2`. Los estados sin disponibilidad producen respuestas deterministas; no se encargan a la redacción opcional con IA.

- 56 pruebas automatizadas del motor aprobadas y compilación completa de Next.js 16.2.4 en el VPS.
- Casos de prueba con celulares, parlantes, audífonos, cables y licuadoras; protección de capacidades/modelos, datos ocultos, stock agotado, cambio de precio y ambigüedad.
- Auditoría de códigos: los 1.630 productos publicados se identifican por su código, sobre 7.135 identidades de inventario. No se incluyen precios de artículos ocultos en los resultados de búsqueda.
- Seis mensajes por el endpoint real del simulador, pasando por n8n y verificando las respuestas persistidas: Redmi con error de escritura, opciones JBL Charge 6, precio O912, cambio de O912 a Redmi en la misma conversación, `audofnos JBL` y modelo inexistente. Aproximadamente cuatro segundos por respuesta.
- Seis mensajes adicionales verificaron información de un producto nuevo durante otra selección, un producto previamente seleccionado que ahora está oculto y una consulta de producto con catálogo pendiente/modo minorista. Los estados se prepararon únicamente en contactos `SIMULATOR:`; no se alteró el inventario. Resultados en `simulator-followup-verification.json`.
- El inventario publicado no contenía productos agotados durante la auditoría; esa rama se verificó con fixtures automatizados, sin alterar existencias reales.

Limitación observada en la entrada existente: sus timestamps tienen precisión de segundos. Una prueba que envió el siguiente mensaje en el mismo segundo de la respuesta previa fue descartada por la protección contra respuestas duplicadas del agrupador. Las pruebas de seguimiento se repitieron con 1,2 segundos entre turnos para verificar la resolución de productos de forma independiente. Esta regla de búsqueda no modifica ese mecanismo de agrupación.

La copia anterior del motor y sus registros de compilación/pruebas están en `/home/IMPORTADORA-backups/bc-product-rule-20260917/`. Las respuestas de integración se conservan en `simulator-verification.json` en ese directorio. El despliegue utiliza el proceso del motor del simulador y conserva el aislamiento de WhatsApp real.
