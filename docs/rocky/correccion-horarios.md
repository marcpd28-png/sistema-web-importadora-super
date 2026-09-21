# Corrección de horarios — 21/09/2026

La respuesta reportada fue generada por BC. El simulador seleccionaba BC inicialmente y su detector reconocía «horario», pero no «horarios». StoreSettings ya contenía `Lun a sáb 8:00 am - 7:00 pm` y `Jr. Huallaga 420, Cercado de Lima`.

Se comparte el detector de horarios/dirección entre BC y ROCKY. ROCKY añade BUSINESS_QUERY y getBusinessInfo, consulta StoreSettings en cada ejecución y conserva la fuente en la traza. No necesita embeddings ni inferencia para recuperar esta configuración. Si falta el dato, deriva al asesor. No afirma apertura actual ni excepciones de feriados.

El simulador abre en ROCKY y etiqueta cada respuesta con el motor seleccionado. Cambiar de motor conserva sesiones separadas. AUTO real permanece desactivado.

Despliegue: release rocky-20260921-r2, PM2 importadora-rocky-web-v2, localhost:4003. Nginx publica el simulador, API ROCKY y el planificador /api/internal/chat/requests. La configuración BC fue comparada con producción sin diferencias. La tienda y los workers existentes permanecen en sus procesos anteriores. El código del planificador BC coincide con producción salvo el hook ROCKY opt-in apagado y la corrección del detector.

Validación: 55 pruebas de ROCKY, agenda BC, carrito y clasificación; ESLint sin errores (advertencia existente de imagen). Prueba HTTP `scripts/rocky/verify-hours.mjs --execute` usa contactos SIMULATOR y la frase exacta reportada para ambos motores. Evidencia final: hours-verification.jsonl.
