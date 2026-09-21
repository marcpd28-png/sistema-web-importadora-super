# Reconocimiento por nombre: despliegue del 21/09/2026

Release activo: `/home/IMPORTADORA-releases/rocky-20260921-image-names`.
Proceso PM2: `importadora-rocky-image-names`, localhost:4005.

Se construyó sobre `rocky-20260921-simulator-async`, conservando la corrección de respuesta en segundo plano del simulador. Se añadieron los cambios de `image-names.ts`, `image-codes.ts`, `orchestrator.ts` y `service.ts`. No hubo migraciones de base de datos.

Los nombres completos cortos pueden identificar productos sin código impreso. Se conservan colores, capacidades y especificaciones entre paréntesis; las coincidencias incompletas requieren aclaración. Se exigen dos vistas OCR y la confianza se calcula con las lecturas de apoyo, limitada a 0,95; es una heurística, no una probabilidad calibrada. Las preguntas de precio y stock aprovechan la búsqueda visual.

Validación Linux: 49 pruebas aprobadas y compilación Next.js con webpack completada. La comprobación pública devolvió 200 para simulador y tienda, verificó 19 recursos estáticos y confirmó 401 sin autenticación en la API interna. Ollama y pgvector disponibles; envío automático real desactivado.

Prueba integrada local y pública: imagen sintética con el texto `LAMPARA LED MEDUSA`, sin código. Ambas consultas, precio y stock, identificaron N2247 mediante `local-catalog-name-multipass`, con confianza aproximada de 0,949 y valores coincidentes con la base. También pasó la recepción asíncrona del simulador (202 y resultado posterior). Esta prueba acredita el recorrido OCR/API con una etiqueta legible; no mide precisión sobre fotografías reales de clientes.

Nginx dirige las siete rutas HTTP del bloque ROCKY a 4005. Los recursos estáticos nuevos se copiaron al directorio compartido de `rocky-20260921-r2/.next/static`, conservando los anteriores. Los procesos previos se mantienen disponibles para reversión. PM2 quedó guardado.

Respaldo de Nginx y logs: `/home/IMPORTADORA-backups/rocky-image-names-20260921`. Para revertir, restaurar su `nginx.conf` en `/etc/nginx/sites-enabled/tiendavirtualsuper.com.conf`, ejecutar `nginx -t` y recargar Nginx. Esto devuelve el simulador a 4004 y las otras rutas ROCKY a 4003; no requiere revertir datos.
