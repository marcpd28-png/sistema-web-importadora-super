# Verificación del despliegue — 16 de septiembre de 2026 (Lima)

## Corrección de catálogos por marca y categoría

La entrada de n8n ahora deriva toda solicitud explícita de catálogo al generador filtrado antes de consultar el modo de compra. Se verificaron las frases del usuario mediante el mismo endpoint del simulador, con una sola respuesta y un PDF descargable en cada caso:

| Solicitud | Productos publicados en la prueba | PDF |
| --- | ---: | ---: |
| Catálogo JBL | 92 | 23 páginas |
| Catálogo de audofnos JBL | 49 | 13 páginas |
| Catálogo de audífonos, todas las marcas | 273 | 69 páginas |
| Catálogo de parlantes, todas las marcas | 271 | 68 páginas |

Los PDF se agrupan por marca e incluyen productos sin imagen. Se extrajeron todos sus códigos y se compararon con la selección original: coincidencia exacta en los cuatro archivos. Se revisaron visualmente páginas renderizadas. Los archivos generados quedan cacheados; las respuestas de integración tardaron unos 2 segundos. Sin coincidencias se responde por texto sin sustituir el filtro por otros productos.

Validación: nueve pruebas del selector/PDF y cuatro del grafo de n8n, ESLint sin errores y compilación completa en el VPS. La compilación local superó TypeScript, pero no pudo generar el sitemap porque no hay PostgreSQL local. Los registros de esta corrección están en `/home/IMPORTADORA-backups/bc-catalog-filters-20260917/`.

## Despliegue inicial (histórico)

Las dos aplicaciones se compilaron correctamente en el VPS con Next.js 16.2.4 y TypeScript, y se reiniciaron sus procesos PM2. Los cinco flujos modificados en n8n quedaron publicados en su versión actual.

Las pruebas de integración invocaron el mismo endpoint del panel, `POST /api/admin/conversations/simulate`, y comprobaron las respuestas guardadas en la base de datos:

| Prueba | Resultado |
| --- | --- |
| Saludo | Respuesta de BC en unos 4 segundos |
| Catálogo general | Pregunta si la compra es mayorista o por unidades |
| Stock/precio de O58-NEGRO | Producto real, imagen y precios unitario/mayorista |
| Catálogo de proyectores | PDF generado y registrado en unos 14 segundos |
| Confirmación de compra | Referencia `SIM-*` en el estado de prueba; cero pedidos reales para esa conversación |
| Contacto ajeno al simulador en su webhook | Rechazado antes de persistir el mensaje |
| Entradas reales WhatsApp/ManyChat | Sin conexiones alcanzables hacia ejecuciones automáticas de BC/catálogo; se conserva recepción |

La prueba de confirmación preparó el estado de una conversación simulada directamente para comprobar el punto de creación del pedido. No representa todavía una validación completa de todas las variantes del checkout.

Pruebas automatizadas: tres comprobaciones del grafo/entrada/salida de n8n y una prueba del servicio de pedidos, incluida la validación de stock. ESLint de los archivos web modificados: cero errores, una advertencia preexistente sobre el uso de `img`. La comprobación local completa de tipos encontró dependencias y Prisma generados de la antigua rama; la validación de compilación definitiva se realizó en el VPS con las dependencias correspondientes a cada servicio.

Pendiente de información comercial: `ROUTER_V2_DELIVERY_METHODS`, `ROUTER_V2_PAYMENT_METHODS` y catálogo mayorista no estaban configurados en el motor. El bot informa esa ausencia cuando necesita esos datos. Deben completarse con las condiciones oficiales antes de dar por validado todo el recorrido de envío y pago.

Las copias previas y los registros de compilación/pruebas están en `/home/IMPORTADORA-backups/bc-simulator-20260917/`. Las copias completas de n8n también se guardaron fuera del contenido versionado, dentro del directorio privado de Git local.
