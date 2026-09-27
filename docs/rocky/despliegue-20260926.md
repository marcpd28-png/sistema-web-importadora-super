# Despliegue de los cambios pendientes — 26/09/2026, Lima

Código publicado en GitHub: `8dd84af2a9cb329018d9fa7a492fb0074a3fe585`, rama `codex/desarrollo-actualizado` (67 archivos pendientes). La actualización documental posterior no cambia el código ejecutable.

Release activo: `/home/IMPORTADORA-releases/roky-real-8dd84af`. Proceso PM2 `importadora-roky-real-8dd84af`, localhost **4031**; configuración PM2 guardada. Nginx sirve desde esta versión la web principal, mensajes, simulador, aprendizaje, evaluación reciente, asistente de tienda y APIs de Roky. Las rutas dedicadas del router BC y los archivos subidos mantienen sus conexiones existentes. No se modificaron workflows n8n, secretos ni base de datos mediante migraciones.

## Verificaciones

- Build Linux con Webpack completado; Prisma generado y validado; **177 pruebas de Roky aprobadas**.
- Tienda, simulador, aprendizaje, evaluación reciente y API administrativa: HTTP **200**.
- **29 recursos estáticos** respondieron HTTP 200; API interna sin autenticación: **401**.
- Health autenticado: PostgreSQL/pgvector disponible, 1679 documentos, LLM y vectores habilitados, `liveSending=false`.
- Conversación interna de saludo persistida correctamente. No se enviaron mensajes a clientes.
- Archivos estáticos agregados a la unión existente, comprobando que no hubiera colisiones de contenido.

Evidencia: [HTTP público](deployment-20260926/public-verification.json), [modelos](deployment-20260926/model-verification.json), [respaldo del simulador](deployment-20260926/simulator-fallback-verification.json).

## Limitación real del modelo en el VPS

La versión anterior configuraba `qwen3.5:2b`. Esta versión configura **qwen3.5:9b** y **qwen3-embedding:0.6b**, ya descargados, conforme a la validación local solicitada. El envío automático continúa desactivado.

En este VPS, **dos intentos reales con qwen3.5:9b agotaron el timeout de 30 segundos**. Por tanto, la validación satisfactoria del modelo en la computadora local no se extiende al rendimiento de este servidor. Embeddings sí produjo vectores reales de 1024 dimensiones en aproximadamente 2,24 segundos.

Se comprobó el comportamiento de respaldo en la versión desplegada: «Me orientas por favor» terminó en 30,56 segundos, `model=deterministic-safe-fallback`, `reason=MODEL_UNAVAILABLE_OR_INVALID`, respuesta de derivación a un asesor. No se cambió a otro modelo ni se ampliaron silenciosamente los límites. El despliegue web está verificado; la inferencia 9B dentro del tiempo permitido queda pendiente de resolver en el VPS.

## Incidencias de arranque resueltas

- La carga de `.env` mediante `source` encontraba una línea incompatible con Bash. El nuevo proceso usa el parser existente de Next.js; no se modificaron valores secretos.
- Existía un enlace `/home/IMPORTADORA/public/uploads/uploads` que apuntaba a su propia carpeta contenedora y provocaba `ELOOP`. Se trasladó únicamente ese enlace a `/home/IMPORTADORA-backups/roky-real-8dd84af/circular-uploads-link`. Todos los archivos subidos se conservaron.

## Reversión

Backup de Nginx: `/home/IMPORTADORA-backups/roky-real-8dd84af/nginx.conf`. Para revertir el tráfico, restaurar ese archivo sobre `/etc/nginx/sites-enabled/tiendavirtualsuper.com.conf`, ejecutar `nginx -t` y recargar Nginx. Las versiones anteriores se conservaron; el backup contiene también la ruta de evaluación anterior que apuntaba al proceso detenido en 4030. No hace falta revertir datos ni borrar los estáticos agregados.

Los logs de build y validación y el manifiesto `deployment.json` permanecen en el release. No se desplegaron `.env.development.local`, bases de pruebas ni modelos Docker de la computadora local.
