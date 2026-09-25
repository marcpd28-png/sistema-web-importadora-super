# Mejorar Rocky con conversaciones revisadas

Rocky no modifica su modelo con cada mensaje. Esta entrega corrige errores de interpretación observados y prepara ejemplos revisados para evaluación. No se entrenó un modelo, no se publicaron políticas nuevas y no se convierten conversaciones de clientes en reglas automáticamente.

## Trabajo del vendedor

1. En el simulador, abrir «Corregir sugerencia», escribir la respuesta correcta y guardarla.
2. Abrir «Revisar correcciones de Rocky» o `/admin/rocky/aprendizaje` con una cuenta administradora.
3. Comparar pregunta, respuesta original y corrección. Aprobar para evaluación únicamente si la corrección es pertinente y verificable; descartar los ejemplos equivocados.
4. La aprobación organiza ejemplos de evaluación. No los inserta en respuestas, no habilita envíos y no alimenta automáticamente el modelo.

La vista muestra hasta 50 pendientes por vez. La aprobación o descarte solo cambia registros que siguen pendientes, para no sobrescribir una decisión concurrente. La autoría guardada de la corrección se conserva.

## Exportación privada para evaluación

```powershell
node --env-file=.env --import tsx scripts/rocky/export-reviewed-feedback.ts --output=.cache/rocky-feedback-revisado.json
```

Solo exporta ejemplos aprobados. Crea un archivo nuevo y no sobrescribe uno existente. Separa por conversación aproximadamente 80% para desarrollo y 20% para validación; esa proporción no es exacta en muestras pequeñas. Los ejemplos de una conversación nunca se reparten entre ambos grupos.

Se eliminan patrones de credenciales, correos y números largos; la anonimización es parcial. Revisar manualmente nombres, direcciones y otros datos antes de compartir el archivo con terceros o usarlo para entrenamiento. Ninguna exportación se envía automáticamente a un proveedor. Las respuestas con precios o stock sirven para evaluar el uso de datos actuales, no para memorizar valores.

## Evaluación reproducible de los fallos observados

```powershell
node --import tsx --test src/lib/rocky/real-message-regressions.test.ts
node --import tsx --test src/lib/rocky/*.test.ts
```

Los casos proceden de frases anónimas de la auditoría y ejemplos controlados. Comprueban catálogo general/filtrado, precio sin referencia, cambio de producto, teléfono frente a accesorio, dirección y horario y códigos múltiples. Son regresiones conocidas, no un conjunto ciego ni una medición nueva de cobertura sobre 3.530 mensajes. No actualizan la cifra de 866 publicada en la auditoría.

## Información comercial que todavía debe aprobar la tienda

Para cada política de envíos, pagos, garantías o devoluciones: redactar la regla, alcance, excepciones, fecha de vigencia y responsable que la aprueba. Ingresarla por el mecanismo existente de documentos de conocimiento aprobados. No deducir políticas de afirmaciones de clientes ni de respuestas aisladas de vendedores. Precios, stock y promociones requieren sus fuentes actuales.

Después de corregir e incorporar información aprobada, repetir la auditoría con datos separados de los usados para corregir. Contar por separado: resolución comercial correcta, aclaración necesaria, derivación correcta y respuesta equivocada. Un aumento de saludos contestados no equivale a más ventas resueltas.

## Publicación verificada el 25/09/2026

Release `/home/IMPORTADORA-releases/rocky2-learning-20260925`, PM2 `importadora-rocky2-learning`, localhost 4015. Recibe las cuatro rutas de Rocky y la nueva ruta `/admin/rocky/aprendizaje`. La tienda conserva su instancia. Envío autónomo apagado; no hay migraciones de base de datos.

Validación: 91 pruebas locales, TypeScript sin errores, ESLint sin errores (un aviso de imagen HTML preexistente en el simulador); 85 pruebas de Rocky 2 en Linux y compilación Next.js. Pruebas privadas y públicas de seis consultas reales anonimizadas, revisión y descarte de una corrección propia del simulador y acceso anónimo denegado. El flujo de venta de 12 turnos y 29 recursos estáticos también pasaron. Los ejemplos técnicos pendientes de intentos anteriores fueron descartados con un filtro limitado a su texto exacto y contactos SIMULATOR.

Se detectó saturación de conexiones PostgreSQL. Se detuvieron `importadora-rocky-web-v2` (4003), `importadora-rocky-simulator` (4004) e `importadora-rocky-sales` (4008), tras comprobar que ninguna configuración Nginx los utilizaba. Sus releases se conservaron. La instancia nueva tiene un pool limitado a tres conexiones por cliente Prisma. La versión anterior 4014 permanece disponible para reversión. Volver a 4008 exige iniciar antes su proceso, que ahora está detenido.

Respaldo y evidencias: `/home/IMPORTADORA-backups/rocky2-learning-20260925/`. Para revertir, retirar solo la nueva ruta de aprendizaje y devolver las cuatro rutas de Rocky a 4014; ejecutar `nginx -t` y recargar. El respaldo completo de Nginx sirve únicamente si no hubo cambios posteriores de otras tareas.
