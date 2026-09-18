# BC: mejora de interpretación sin IA

## Alcance

Se implementa procesamiento local, sin llamadas a modelos ni nuevas credenciales. Se conservan la espera de 12 segundos desde el último mensaje recibido, los saludos horarios, la bienvenida, los bloqueos contra respuestas obsoletas y la prioridad del asesor y del flujo de compra. El canal de prueba continúa siendo SIMULATOR; este cambio no activa WhatsApp automático.

La búsqueda ahora separa el contexto conversacional de las entidades del inventario. Conserva requisitos desconocidos dentro del asunto para pedir aclaración, en lugar de eliminarlos para obtener cualquier resultado. Los alias de productos y la morfología no equivalen a listas de frases de clientes. La recuperación ortográfica necesita una familia o un modelo acotado por otro término exacto; un término aislado como «shaver» no se convierte en «SILVER».

Cambios:

- Los fragmentos de una solicitud se unen antes de planificar, conservando todos sus IDs. Las marcas y categorías del inventario ayudan a reconocer continuaciones.
- Producto/precio, pagos y envío pueden tener solicitudes independientes en un mismo mensaje. Una cantidad posterior dentro del lote ajusta la cotización pendiente.
- Cada selección expone sus grupos y restricciones. «Todos hasta 100 soles» se aplica a cada grupo; los filtros particulares permanecen en su grupo.
- Potencia, voltaje y capacidad se distinguen de moneda y cantidad. Códigos, sufijos y puntuación ERP se conservan.
- Se comprueba la identidad contra todo el inventario publicado antes de filtrar stock y fotos. Los atributos publicados de conectividad complementan los nombres sin convertir sus números en modelos.
- Las opciones se presentan por grupo. Las referencias ordinales no eligen arbitrariamente entre listas distintas.
- La respuesta distingue búsqueda no identificada, agotado, sin referencia de foto y foto que no pudo cargarse. Ambos caminos de catálogo usan la misma selección y el mismo generador de respuestas.
- Los PDF equivalentes comparten caché por selección y datos, sin incluir la frase de cortesía en su huella. Se siguen verificando fotos y productos realmente incluidos.

## Validación antes del despliegue

- 72 pruebas automatizadas: búsqueda, agenda, disponibilidad, PDF, agrupación temporal, persistencia atómica y auditor. Incluyen los 16 controles independientes del diagnóstico anterior.
- TypeScript y ESLint de los archivos modificados correctos.
- Inventario leído el 18/09/2026 a las 07:22 UTC: 1.686 productos publicados. No se modificaron productos, stock, precios ni fichas.
- 910 reformulaciones de categorías/marcas disponibles: 910 mantienen los mismos códigos que su consulta corta. Es una prueba sintética de estabilidad, no un porcentaje de atención correcta a clientes.
- Comparación del buscador anterior `6ce69c2` con esta implementación usando la misma fotografía y los 150 casos históricos: 89 casos tienen etiquetas completas con productos todavía disponibles. Casos con algún producto esperado: 44 → 47; con cobertura completa: 20 → 28. Coincidencias con etiquetas: 1.101 → 1.115; códigos adicionales: 155 → 79. Esta prueba mide recuperación, no la respuesta completa del bot.

Las etiquetas históricas no se trataron como verdad nueva: se intersectaron con productos disponibles. Se revisaron las pérdidas: BC016 (estación de carga), BC030 (Trimer), BC097 (Dumpling sin otro dato) requieren mejor identificación o aclaración. BC041 conserva Bluetooth como requisito, mientras el intérprete anterior lo quitaba; algunos productos antes incluidos no tienen esa conectividad confirmada en los campos consultados. No se afirma una calidad de 10/10 ni que todos los términos comerciales estén resueltos.

## Reproducción

```sh
node --import tsx --test src/lib/bc-deterministic.test.ts src/lib/catalog-selection.test.ts src/lib/bc-catalog-discovery.test.ts src/lib/bc-request-agenda.test.ts src/lib/bot-product-availability.test.ts src/lib/catalog-pdf.test.ts src/lib/chat-input-batch.test.ts src/app/api/internal/chat/simulator-batch/agenda.test.ts scripts/bc-evaluation/prevention-audit.test.cjs
node --import tsx scripts/bc-evaluation/prevention-audit.cjs --read-only-inventory --enforce --output .cache/bc-prevention-current.json
```

`--enforce` impide aprobar la auditoría si falla una reformulación o un control independiente.

## Despliegue verificado

Código `6685f1578699445148e12cf1d5baf9d0f257a57a`, publicado en `codex/desarrollo-actualizado` e instalado en el VPS. Compilación de producción y las 72 pruebas correctas; web HTTP 200, proceso principal y motor online, agenda habilitada y redacción con IA desactivada. Se conservó una copia de la versión y compilación anteriores para reversión.

El 18/09/2026 a las 08:10 UTC finalizaron diez conversaciones de prueba a través del simulador y n8n: diez respuestas verificadas, seis PDF descargables y ninguna respuesta adicional o tardía. Se eliminaron los diez contactos temporales propios; no se enviaron mensajes a clientes.

- El ejemplo de proyectores y su variante en tres mensajes generan el mismo catálogo de 18 productos con stock y foto legible.
- La consulta mayorista entrega 87 cargadores y conserva pendiente «fuentes de poder»: no hay coincidencias con ese nombre en la fotografía publicada consultada. No se elimina el resultado de cargadores ni se inventa la otra familia.
- El presupuesto compartido limita el catálogo encontrado a 75 productos de hasta S/ 100.
- Audífonos JBL Bluetooth devuelve 38 productos y excluye adaptadores. La variante «xiami» devuelve los celulares Xiaomi/Redmi identificados.
- Producto, envío y Yape se contestan como solicitudes separadas. «Dos unidades» ajusta una sola cotización y «shaver» pide identificación sin devolver un reloj SILVER.

Las consultas de texto respondieron entre 12,5 y 12,7 segundos desde la última entrada; los PDF tardaron entre 29,5 y 68 segundos, incluyendo carga de fotos y generación. Los 12 segundos son el tiempo de agrupación de mensajes, no una garantía de entrega del PDF en ese plazo.

Resumen reproducible de evidencias: [deterministic-2026-09-18.json](deterministic-2026-09-18.json). Estas pruebas acreditan los escenarios descritos, no comprensión universal del lenguaje ni una calificación de 10/10.
