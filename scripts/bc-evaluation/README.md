# Evaluación del BC con consultas de la bandeja

Banco de 150 casos / 232 mensajes de 150 conversaciones reales distintas, seleccionadas entre 300 conversaciones recientes. Los textos conservan errores de escritura. Se omitieron saludos innecesarios y datos identificativos; no son consultas generadas por IA. La relación con IDs reales queda en el respaldo privado del VPS, fuera de Git.

Los casos se ejecutan **exclusivamente por `/api/admin/conversations/simulate`**. Cada caso usa un contacto nuevo `SIMULATOR:` y sus mensajes se envían como una ráfaga, conservando el orden. Los tiempos originales entre mensajes no se reproducen; tampoco se reconstruyen fotos, audios ni intervenciones previas del vendedor. No es una prueba de conversaciones largas con turnos alternados.

## Archivos

- `cases.json`: mensajes, solicitudes esperadas y grupos de productos pertinentes.
- `catalog-labels.json`: códigos de referencia revisados contra una foto del inventario. No usa el buscador del BC para decidir la relevancia. Las etiquetas se revisaron durante el diagnóstico; esta primera medición no es un experimento ciego.
- `replay.cjs`: prueba integral con la API de administración, webhook de n8n, BC, persistencia y documentos.
- `grade.cjs`: evaluación diagnóstica reproducible de respuestas, cobertura, productos mostrados, aclaraciones y entrega de PDF.
- `*.test.cjs`: pruebas del evaluador, referencias y ausencia de identificadores obvios en el corpus. El filtro automático complementa la revisión manual; no garantiza por sí solo anonimización.

Se reservaron 35 conversaciones y se separaron 115 para desarrollo. Es una separación por conversación, no por familia semántica: hay consultas parecidas en ambos grupos. No utilizarla para afirmar generalización a todos los clientes. Para una comparación ciega posterior, incorporar también conversaciones nuevas y congelar etiquetas antes de modificar el buscador.

## Ejecución

Desde la raíz del repositorio, con Node y las dependencias instaladas:

```sh
node --test scripts/bc-evaluation/grade.test.cjs scripts/bc-evaluation/corpus.test.cjs
```

La repetición integral requiere configuración del VPS (`DATABASE_URL`, `AUTH_SECRET`, n8n y un usuario administrador). Crea contactos temporales y solicita los PDF reales del simulador. El indicador explícito evita una ejecución accidental:

```sh
node scripts/bc-evaluation/replay.cjs --execute-simulator --concurrency=2 --output=.cache/bc-evaluation/run.json
```

Opciones: `--origin=http://127.0.0.1:4000`, `--cases=BC007,BC008`, `--timeout-ms=90000` (máximo 180000), `--concurrency=1` (máximo 3). No hay una opción para enviar mensajes a clientes reales. Los contactos de esta ejecución se eliminan por ID, nombre de ejecución y prefijo `SIMULATOR:`; los PDF quedan en la caché normal del catálogo. Una interrupción forzada requiere comprobar los contactos temporales de ese `runId` antes de volver a ejecutar.

Guardar el resultado completo y la foto de inventario fuera de Git: contienen metadatos internos de prueba y precios/stock históricos. No copiar el export original de la bandeja al repositorio.

```sh
node scripts/bc-evaluation/grade.cjs RUTA_RUN.json RUTA_SNAPSHOT.json RUTA_INFORME.json
```

La foto original está en el respaldo privado `/home/IMPORTADORA-backups/bc-inbox-eval-20260918/catalog-snapshot.json`. Las etiquetas no se deben aplicar a un inventario posterior sin revisión: stock, precio y publicación cambian. El historial no es la fuente para cotizar una venta.

## Interpretación de las métricas

- **Precisión de productos mostrados:** recomendaciones pertinentes / recomendaciones con etiqueta completa. No incluye links al catálogo general, candidatos guardados que el cliente no vio ni grupos con etiquetas incompletas. Cuenta cada código una vez por caso.
- **Cobertura por objetivo:** grupos solicitados con al menos un producto encontrado / grupos solicitados con productos de referencia. Pedir dos familias y mostrar solo una no cubre ambos objetivos. No es recall exhaustivo de todo el inventario.
- **Recall de catálogo:** fracción de códigos pertinentes de referencia incluidos en el PDF; media por solicitud de catálogo con referencia completa y no vacía. Sin PDF, la cobertura es cero. Se basa en evidencia del generador; no verifica visualmente todas las páginas.
- **Solicitudes cubiertas:** criterio explícito de cada intención. Un precio unitario no acredita una cotización por caja ni por 96 unidades. Confirmar que falta una ficha puede ser una respuesta correcta; inventar características no lo es.
- **Aclaración evitable:** pedir código/modelo cuando hay un único producto pertinente conocido, salvo insuficiencia de stock para la cantidad. Es un indicador automático que debe revisarse antes de una decisión comercial.
- **PDF válido:** HTTP exitoso y cabecera `%PDF-`. No acredita que el catálogo contenga los productos correctos: la relevancia se mide por separado.
- **Precios en texto:** compara importes explícitamente asociados a un SKU contra la foto de precios unitarios/mayoristas y sus totales. No comprueba precios dentro del PDF, fletes, descuentos negociados ni políticas comerciales. Una diferencia requiere comprobar si cambió el inventario.
- **Tiempo de respuesta:** desde el último mensaje, incluyendo los 12 segundos de agrupación. Una respuesta posterior al plazo se registra como tardía; no se convierte retrospectivamente en éxito dentro del plazo.

`PASS` significa que pasó los controles declarados, **no que toda la conversación sea comercialmente perfecta**. Las comprobaciones de originalidad, demostraciones en tienda y catálogos sin precios requieren revisión manual. La coincidencia de palabras no puede certificar esas afirmaciones. El informe separa observaciones manuales y puntuación automática.

Esta suite establece la línea base previa a un intérprete de IA. Un cambio posterior debe ejecutar el mismo corpus y las mismas etiquetas, añadir casos de los errores nuevos y comprobar que mejora cobertura sin aumentar productos incorrectos. Precio, stock y especificaciones deben continuar viniendo de datos verificados.

Metodología consultada: [OpenAI Docs: evaluación con datos de producción, criterios explícitos y casos representativos](https://developers.openai.com/api/docs/guides/evaluation-best-practices), [Stanford: precisión y recall en recuperación de información](https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-of-unranked-retrieval-sets-1.html).

## Ortografía y nombres incompletos sobre inventario

`spelling-audit.cjs` trabaja únicamente con una copia local `{ capturedAt, products, brands }`, con los campos del selector comercial. No conecta a la base, modifica productos ni envía mensajes. Guardar la copia y el informe en `.cache`, fuera de Git.

```sh
node --import tsx scripts/bc-evaluation/spelling-audit.cjs .cache/inventory.json .cache/spelling-report.json
```

El tercer argumento opcional es un módulo anterior que exporte `createCatalogIndex`, para comparar ambas versiones sobre la misma copia. Se prueban prefijos de cuatro/cinco letras, eliminación de letras y transposición, por familia y marca; códigos exactos de todos los productos; y fragmentos de precio, familia, marca y cantidad para los prefijos reconocidos. Los tipos de menos de seis letras quedan fuera de la generación de variantes, pero sus productos participan en la prueba de códigos.

La comparación de variantes usa como referencia la consulta completa del mismo selector: mide estabilidad, no precisión comercial independiente. Una variante puede ser ambigua o una palabra real distinta. Revisar resultados adicionales y regresiones, y no contar consultas completas vacías como éxitos. La prueba de fragmentos se limita a prefijos que ya dieron coincidencias y no acredita cualquier conversación ni el transporte por WhatsApp.
