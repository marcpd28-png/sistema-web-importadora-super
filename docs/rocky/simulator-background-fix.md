# Simulador: respuestas largas — 21/09/2026

Los registros de producción mostraron catálogos que demoraban 91.563, 171.802 y
177.445 ms. La pantalla cancelaba el POST a los 65 segundos y perdía la respuesta,
aunque ROCKY terminaba guardándola.

La pantalla ahora envía `background: true`. El POST guarda la entrada y devuelve
202 con los identificadores; `after()` de Next.js ejecuta ROCKY en el servidor.
El navegador consulta el mismo endpoint con GET cada dos segundos para recuperar
mensajes, PDF y diagnóstico completo de Rocky. No inicia otra consulta de ROCKY
en esa sesión mientras espera. Las consultas sin `background` conservan su contrato
anterior y BC conserva su flujo n8n.

El GET requiere administrador y un mensaje entrante de una conversación simulada.
Los errores del trabajo se registran en el mensaje y se muestran al consultar.
La espera de resultados termina con aviso después de 300 consultas pendientes.
Este trabajo vive en el proceso web: un reinicio mientras se prepara una respuesta
no la reanuda automáticamente; se debe iniciar una sesión nueva.

## Instalación

- Release: `/home/IMPORTADORA-releases/rocky-20260921-simulator-async`.
- PM2: `importadora-rocky-simulator`, localhost 4004, guardado con `pm2 save`.
- Nginx: solo `/admin/mensajes/simulador` y
  `/api/admin/conversations/simulate` apuntan a 4004.
- Los archivos estáticos nuevos se agregaron, sin sobrescribir, al directorio
  `.next/static` de `rocky-20260921-r2`. El fallback `@rocky_static` sirve esa unión
  directamente desde Nginx; Next.js ya iniciado no reconocía los archivos nuevos.
- Backup de Nginx anterior al cambio:
  `/tmp/tiendavirtualsuper.com.conf.simulator-20260921181513.bak`.
- Los otros endpoints ROCKY, catálogo de imágenes y BC siguen en 4003.

## Validación

TypeScript sin errores. Cinco pruebas existentes de mensajes y peticiones pasaron.
ESLint sin errores (una advertencia previa sobre `<img>`). Build de producción
completado en el nuevo release.

`scripts/rocky/verify-simulator-background.mjs --execute` crea únicamente mensajes
simulados, comprueba 202 inmediato, consulta autenticada, respuesta final y acceso
al PDF. Primera prueba: aceptación en 153 ms, respuesta en 39.349 ms, tres mensajes
y un documento. La página pública y sus 19 recursos respondieron correctamente;
la tienda respondió 200 y el health confirmó envío real desactivado.
Segunda prueba desde `https://tiendavirtualsuper.com`, catálogo de parlantes:
aceptación en 227 ms, respuesta en 53.758 ms, tres mensajes y PDF descargable.

Para revertir, restaurar el backup de Nginx, ejecutar `nginx -t` y recargar Nginx.
El proceso anterior continúa disponible en 4003. Los recursos estáticos agregados
son inmutables y pueden permanecer.
