# Búsqueda directa de cámaras — 26/09/2026

El mensaje «camara espia» caía en UNKNOWN porque el reconocimiento directo no incluía cámaras. Las dos trazas revisadas mostraron MODEL_UNAVAILABLE_OR_INVALID, sin herramientas ejecutadas. La respuesta genérica repetía la pregunta por el producto aunque el cliente ya lo había nombrado.

El planificador reconoce ahora cámara/cámaras, con o sin tilde, como búsqueda de producto. Conserva los calificadores (espía, modelo, etc.) y consulta el catálogo sin depender del modelo. Reclamos, devoluciones, asesor y seguimiento de pedidos mantienen su prioridad. Esta corrección no habilita AUTO ni incorpora aprendizaje automático general.

Validación local: 136 pruebas de Rocky correctas y ESLint sin errores en los archivos modificados. La regresión reproduce saludo, consulta, repetición y variantes con tildes y plural usando un proveedor no disponible.

Verificación de integración: `node --env-file=.env scripts/rocky/verify-camera-search.mjs --execute`, con `ROCKY_TEST_BASE` apuntando al canario o al dominio público. Usa exclusivamente un contacto de simulación nuevo; no envía mensajes a clientes ni crea pedidos reales.

## Despliegue verificado

Release `/home/IMPORTADORA-releases/rocky-camera-20260926`, PM2 `importadora-rocky-camera`, puerto 4025. Las API de simulación, administración de Rocky, `/api/internal/rocky/` y `/api/shop-assistant` apuntan a esta instancia. Las páginas administrativas mantienen el proceso 4024.

Pasaron las 136 pruebas en el VPS, la compilación de producción, cinco turnos de búsqueda tanto privada como pública (N437 y N1372 en las cuatro consultas), doce turnos de comunicación y doce de venta simulada. El asistente de tienda pasó su verificación privada y pública. No hubo migraciones ni activación de AUTO.

Durante el canario se detectó saturación de conexiones PostgreSQL. Se verificó que ninguna configuración Nginx referenciaba 4015 o 4016 y se detuvieron las instancias antiguas `importadora-rocky2-learning` e `importadora-rocky2-precision`, conservando sus archivos. La nueva instancia limita su pool a dos conexiones.

Respaldo y logs: `/home/IMPORTADORA-backups/rocky-camera-20260926/`. Para revertir, devolver solo las tres rutas API de Rocky a 4017 y `/api/shop-assistant` a 4012, validar con `nginx -t` y recargar Nginx. Ambos procesos anteriores se conservan activos. No restaurar el archivo completo de Nginx si hubo cambios posteriores.
