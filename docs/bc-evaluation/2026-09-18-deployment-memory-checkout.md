# Despliegue de memoria, agrupación y checkout

Publicado por solicitud del usuario el 18 de septiembre de 2026.

- Web: `6fe447a`, incluye `2b092b3` (memoria, agrupación, adjuntos) y los cambios recientes de catálogo PDF.
- Motor: `cd87fc0`, en `codex/bc-router-simulador`.
- Ambas ramas publicadas en origin. Ambos procesos PM2 respondieron HTTP 200 después de activar las compilaciones aisladas.
- Migración `20260918040000_add_customer_conversation_memory` aplicada con respaldo previo de PostgreSQL. `BC_CUSTOMER_MEMORY_ENABLED=true` en la web; agenda activa.
- n8n: publicados y comparados con la versión preparada los flujos `HVFMz7fCQXRNXB3U` (entrada del simulador) y `YXvIlOEj45LpjONf` (motor). Se conservaron las credenciales, posiciones del editor y espera explícita en segundos. No se modificaron los flujos de atención a clientes reales.

## Evidencia

- 82 pruebas de regresión web y 63 del motor superadas; ambas compilaciones de producción completadas.
- Prueba mediante API administrativa → webhook n8n → agenda → respuestas persistidas: tres grupos de cinco mensajes, con cinco, cuatro y una consultas respectivamente. Se verificaron tipos y orden de las consultas, conservación de los cinco mensajes y cotización de seis unidades cuando correspondía.
- Tiempos hasta primera respuesta: 12.5–12.9 segundos, incluida la pausa de agrupación de 12 segundos.
- Tres contactos SIMULATOR temporales eliminados; ninguno restante. No se modificó inventario ni se crearon pedidos reales en estas pruebas.
- Evidencia y respaldos privados del servidor: `/home/IMPORTADORA-backups/bc-memory-2b092b3` y `/home/IMPORTADORA-backups/bc-checkout-cd87fc0`.

Acceso: https://tiendavirtualsuper.com/admin/mensajes/simulador

El despliegue no acredita el objetivo completo. La interpretación real de imágenes sigue pendiente de configurar y validar un proveedor/modelo; no se habilitó consumo de IA. Continúan pendientes referencias sociales, casos ambiguos, cesta de varios productos y las restantes validaciones de venta completa.
