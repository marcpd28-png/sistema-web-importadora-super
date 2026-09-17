# Verificación del despliegue — 16 de septiembre de 2026 (Lima)

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
