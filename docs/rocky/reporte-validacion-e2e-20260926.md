# ROKY — auditoría y validación E2E

Fecha de trabajo: 26/09/2026, America/Lima. Las evidencias utilizan timestamps UTC del 27/09/2026.

## 1. Resumen ejecutivo

**ROKY E2E PARCIALMENTE VALIDADO.** Se auditó el código contra el reporte anterior y se ejecutaron intentos reales de conexión, recorridos del orquestador con el backend real, pruebas de fallo y concurrencia local. PostgreSQL y Ollama no están disponibles. No se ha validado el recorrido completo con persistencia, pgvector e inferencia real.

Se reprodujeron cinco defectos mediante pruebas que fallaban antes de corregirlos. Los cambios productivos de este turno se limitan a tres archivos: tools.ts, learning.ts y orchestrator.ts. Se mantienen las 168 pruebas anteriores y pasan siete pruebas adicionales: **175/175**. TypeScript, Prisma validate, lint de los archivos de este turno y build pasan con las limitaciones detalladas. No hubo cambios de secretos, schema, n8n, modelos, despliegue, push, merge, instalación de servicios ni operaciones de escritura en bases reales.

Evidencia reproducible: [runtime-evidence.json](e2e-validation-20260926/runtime-evidence.json), [real-services.json](e2e-validation-20260926/real-services.json). El diagnóstico se ejecuta con `node --import tsx scripts/rocky/validate-e2e.ts`; es de solo lectura y no crea conversaciones ni envía mensajes.

## 2. Estado real de las cinco capas

| Capa | Estado del código | Validación real |
|---|---|---|
| MODEL | IMPLEMENTADO CORRECTAMENTE en contrato, configuración y guardas | OLLAMA REAL NO VALIDADO; no hay servicio ni CLI disponibles |
| RAG | IMPLEMENTADO PARCIALMENTE respecto de una validación integral: SQL, filtros y fallback presentes | PostgreSQL/pgvector y embeddings no ejecutaron consultas exitosas |
| MEMORY | IMPLEMENTADO PARCIALMENTE: contexto acotado y resumen de estado; no resumen semántico progresivo del historial | Aislamiento en memoria comprobado; persistencia sin validar |
| TOOLS | IMPLEMENTADO PERO DEFECTUOSO al inicio; dos defectos corregidos | Registro/validación/deadline probados; lecturas reales fallaron de forma segura |
| LEARNING | IMPLEMENTADO PARCIALMENTE; comparación y selección tenían defectos corregidos | Selectores/comparación probados; almacenamiento y exportación HTTP sin validar |

«Implementado» describe inspección y pruebas locales; no implica que las dependencias reales hayan funcionado.

## 3. Comparación del reporte anterior con código real

| # | Punto | Clasificación al inicio | Evidencia y conclusión |
|---|---|---|---|
| 1 | Provider Ollama | IMPLEMENTADO CORRECTAMENTE | provider.ts: plan/embed/health, localhost, schemas, exclusión mutua y aborts HTTP |
| 2 | Modelo principal | IMPLEMENTADO CORRECTAMENTE | config.ts y provider.ts: ROCKY_MODEL, default qwen3.5:9b; el flag LLM está desactivado por ausencia |
| 3 | Modelo embedding | IMPLEMENTADO CORRECTAMENTE | ROCKY_EMBEDDING_MODEL, default qwen3-embedding:0.6b, 1024 dimensiones |
| 4 | Context Builder | IMPLEMENTADO CORRECTAMENTE | context.ts: mensaje acotado, cuatro mensajes de historial, summary/sales selectivos, datos separados del system prompt |
| 5 | Intent Classifier | IMPLEMENTADO PARCIALMENTE | Reglas tipadas y aliases comerciales; confidence 0.9/0.2 no calibrada; PURCHASE_INTENT/MEDIA_RECEIVED son clasificación adicional, no nuevas acciones |
| 6 | Memory Manager | IMPLEMENTADO PARCIALMENTE | RockySession JSON y revisión optimista; no existe módulo de gestión separado, lo hace service.ts |
| 7 | Conversation Summary | IMPLEMENTADO PARCIALMENTE | summarizeMemory reconstruye una síntesis del estado; no resume semánticamente todo el historial ni acumula todos los hechos |
| 8 | Customer Memory | IMPLEMENTADO PARCIALMENTE | Se reutilizan preferencias y aliases confirmados por contacto; no hay perfil nuevo inferido ni se verificó persistencia real |
| 9 | Sales State | IMPLEMENTADO PARCIALMENTE | Etapa, objeciones, selección y siguiente acción; purchaseIntent se recalcula por mensaje/carrito, no es una probabilidad ni una conversión |
| 10 | RAG | IMPLEMENTADO PARCIALMENTE | Híbrido/metadata/filtros implementados; el planner no recibe automáticamente los resultados posteriores de tools/RAG |
| 11 | Tool Registry | IMPLEMENTADO PERO DEFECTUOSO | Rechazos de schema/permisos no se registraban; límite concurrente contaba solo completadas. Corregido |
| 12 | Risk levels | IMPLEMENTADO CORRECTAMENTE | READ_ONLY/LOW_RISK actuales; otras categorías bloqueadas; nombres reservados no son adaptadores |
| 13 | Timeouts | IMPLEMENTADO PARCIALMENTE | Deadline de espera y AbortSignal en HTTP; Prisma/PDF subyacentes no se cancelan por Promise.race |
| 14 | Confidence | IMPLEMENTADO PARCIALMENTE | Usa coincidencia, presencia de evidencia, fallos, ambigüedad y contradicción; varias señales se registran pero no se ponderan |
| 15 | Autonomy | IMPLEMENTADO CORRECTAMENTE | Gate adicional para encolado; no reemplaza modo, master switch ni control humano; nivel 4 no agrega capacidades |
| 16 | Human handoff | IMPLEMENTADO PARCIALMENTE | Decisión y cambio transaccional de botEnabled presentes; no se probó el cambio persistido por falta de DB |
| 17 | Feedback | IMPLEMENTADO PERO DEFECTUOSO | Comparar después de redactar ocultaba diferencias. Corregido; humanEdited exacto no es columna persistida |
| 18 | Dataset/export | IMPLEMENTADO PERO DEFECTUOSO | Empate de createdAt podía ignorar una revocación. Corregido conservadoramente; exportación HTTP no ejecutada |
| 19 | Logging | IMPLEMENTADO PERO DEFECTUOSO | Consultas compuestas heredaban interacción y toolSuccess solo del primer fragmento. Corregido |
| 20 | Fallbacks | IMPLEMENTADO CORRECTAMENTE en recorridos comprobados | Fallo real de DB no produce cifras inventadas; el fallback de embeddings continúa cubierto por pruebas controladas |

El reporte anterior acertaba al declarar limitaciones de runtime, timeout y redacción. No debe interpretarse que «contexto central» significa que Qwen ve todos los resultados: el modelo planea antes de las tools; las afirmaciones comerciales se renderizan después desde datos del backend. En turnos compuestos el contrato conserva una intención principal y un único plan registrado; no es una traza completa de todos los subplanes.

## 4. Modelo Ollama realmente configurado

Se cargó el entorno con `@next/env`, igual precedencia que la aplicación en producción, sin imprimir secretos. ROCKY_MODEL está **UNSET**; el modelo efectivo del provider es **qwen3.5:9b**. ROCKY_LLM_ENABLED está **UNSET**, por lo tanto el servicio no instancia el provider de planificación en el flujo normal. El comportamiento efectivo local es reglas/tools, no inferencia Qwen.

OLLAMA_MODEL=qwen2.5:7b sigue consumida en src/lib/ollama.ts por el proveedor antiguo. No fue eliminada ni cambiada. Ninguna variable secreta fue mostrada o modificada.

## 5. Modelo embedding realmente configurado

ROCKY_EMBEDDING_MODEL está **UNSET**: default **qwen3-embedding:0.6b**. ROCKY_RAG_VECTOR_ENABLED está **UNSET**: el flujo normal no activa embeddings. El provider y el índice usan la propiedad embeddingModel; cache y SQL separan modelos. Configuración correcta no demuestra que el modelo esté instalado.

## 6. Resultado de ollama list

El shell no encuentra el ejecutable: **OLLAMA_CLI_NOT_FOUND**. No se pudo ejecutar `ollama list`. La alternativa real `/api/tags` en 127.0.0.1:11434 devuelve **ECONNREFUSED**. Una lista vacía de health es fallback de indisponibilidad, no evidencia de que Ollama esté instalado sin modelos.

## 7. Prueba real de qwen3.5:9b

**OLLAMA REAL NO VALIDADO.** Sin servicio disponible, no se pudo obtener inferencia, latencia de generación ni comportamiento real frente a inyección. No se descargó ni cambió ningún modelo. Los tests con providers controlados no se presentan como inferencia real.

## 8. Prueba real de qwen3-embedding:0.6b

**OLLAMA REAL NO VALIDADO.** No se generaron embeddings reales ni se verificó su dimensión real. Las validaciones de 1024 dimensiones, caché y fallback se comprobaron en código/pruebas controladas.

## 9. Conexión PostgreSQL

Prisma intentó `SELECT 1 AS connected`, solo lectura. Resultado: **PrismaClientInitializationError**, aproximadamente **2040.34 ms** en la ejecución final. El build confirma servidor inaccesible en 127.0.0.1:5432. No se pudieron contar productos/documentos/sesiones ni comprobar pgvector. No se ejecutaron migraciones, db push, reset, indexaciones, inserciones o borrados.

## 10. Resultados de los 13 casos E2E

Estos recorridos utilizan el orquestador real y adaptadores reales, salvo el fallo deliberado del caso 8. No incluyen persistencia del Centro de Mensajes: sin DB no se pueden crear contactos/conversaciones de prueba, persistir handoff o llamar feedback con una ejecución guardada.

| Caso | Resultado observado | Alcance/veredicto |
|---|---|---|
| 1. hola | GREETING, 0 tools, saludo breve, confianza 0.95 | Recorrido local correcto; no E2E persistido |
| 2. tienes el proyector HY300 | PRODUCT_SEARCH, referencia HY300, searchProducts falla por DB, confianza 0.3 | Disponibilidad real NO VALIDADA; fallback seguro observado |
| 3. cuánto cuesta HY300 | PRICE_QUERY / PRODUCT_PRICE, getProductByCode falla; no imprime precio | Precio real NO VALIDADO; no llega a getPrice al fallar la primera lectura |
| 4. hay stock HY300 | STOCK_QUERY / PRODUCT_STOCK; no imprime sí/no ni unidades inventadas | Stock real NO VALIDADO; lectura inicial bloqueada |
| 5. Bluetooth | PRODUCT_DETAILS; falla lectura de producto | RAG técnico real NO VALIDADO; no inventa especificación |
| 6. tres mensajes HY300/precio/stock | Conserva HY300 como referencia en los tres turnos | Memoria en proceso comprobada; memoria persistida y datos reales NO VALIDADOS |
| 7. cuánto está sin referencia | Pide nombre/código, cero productos y tools, confianza 0.35 | Aclaración local correcta |
| 8. tool failure controlado | getProductByCode rechazado deliberadamente, toolSuccess=false, confianza 0.3, handoff | Inyección de fallo explícita; no sustituye prueba de stock real |
| 9. quiero una persona | HUMAN_REQUEST, handoffToHuman, requiresHuman | Decisión local correcta; botEnabled persistido NO VALIDADO |
| 10. prompt injection | UNKNOWN, no muestra prompt ni secretos, autonomía pide handoff | Orquestador determinista comprobado; resistencia de Qwen real NO VALIDADA |
| 11. fuente contradictoria | Fuentes reales inaccesibles | BLOQUEADO; tests controlados existentes comprueban precio recargado y contradicciones estructuradas |
| 12. SENT_AS_IS y EDITED | Comparación pura: sin edición y con edición, respectivamente | Almacenamiento real NO VALIDADO; no se crearon filas |
| 13. dataset | Selector puro excluye no aprobados y selecciona aprobación sintética explícita | Exportación HTTP/DB NO VALIDADA |

Prueba RAG directa adicional: query `HY300 bluetooth`, topK=5, hybrid, vector runtime desactivado; falla por PostgreSQL. No hay documentos ni scores reales que reportar. No se sustituyen por resultados ficticios.

## 11. Latencias medidas

Ejecutadas con performance.now; son muestras únicas, no percentiles ni benchmark de producción. Valores de la última ejecución guardada en runtime-evidence.json:

| Operación real | Tiempo aproximado |
|---|---:|
| Salud de Ollama, conexión fallida | 5.53 ms |
| Conexión Prisma, fallida | 2040.34 ms |
| Consulta RAG, fallida | 2044.16 ms |
| Saludo completo local | 7.81 ms |
| Consulta de precio con fallo real DB | 2029.99 ms, de los cuales 2028.62 ms en tool |
| Consulta de stock con fallo real DB | 2072.75 ms, de los cuales 2072.32 ms en tool |
| Aclaración sin referencia | 0.34 ms |
| Handoff local | 0.96 ms |
| Tres consultas concurrentes con DB caída | 2056.51 ms en conjunto |
| Inferencia y embeddings reales | NO MEDIDOS; cero llamadas en el flujo con flags desactivados |

Microejecuciones separadas de funciones reales: intent 0.111 ms, parse memoria 0.131 ms, summary 0.111 ms, context 0.479 ms, confidence 0.032 ms, autonomy 0.749 ms. No se deben sumar a los totales anteriores. Un historial artificial de 1000 mensajes produjo un contexto de 4555 caracteres; no se envió a Qwen.

El test del deadline configura 100 ms y verifica retorno seguro entre 90 y 3000 ms; la ejecución del test duró aproximadamente 114 ms. Es una prueba de timer con trabajo bloqueado deliberadamente, no latencia de una base sana.

## 12. Tools reales disponibles

Registro ejecutable de **12** entradas. Deadline común configurado: **15000 ms** por execute; máximo **12 intentos por instancia**, reservado antes de esperar. Queries de búsqueda: hasta 120 caracteres; código: 1–64 salvo getProduct hasta 191. Schemas rechazan campos extra.

| Nombre | Función/input | Riesgo | Fuente / resultado |
|---|---|---|---|
| getCatalog | query, hasta 1200 | LOW_RISK | Catálogo comercial y generador PDF existentes; el diagnóstico desactiva PDF |
| getBusinessInfo | query | READ_ONLY | StoreSettings, horario/dirección publicados |
| searchProducts | query, budget opcional | READ_ONLY | Búsqueda interna, catálogo y sinónimos aprobados |
| getProduct | code o ID | READ_ONLY | Product visible y ficha; resolución por backend |
| getProductByCode | code | READ_ONLY | Mismo backend de producto |
| getStock | code | READ_ONLY | Stock actual desde producto |
| getPrice | code | READ_ONLY | Precio/tier actual desde producto |
| getPromotions | code | READ_ONLY | Devuelve NO_VERIFIED_PROMOTION_ADAPTER; no hay integración de promociones |
| checkCompatibility | code | READ_ONLY | Consulta ficha; no certifica compatibilidad automáticamente |
| compareProducts | codes, 2–6 | READ_ONLY | Consulta productos y compara hechos disponibles |
| searchKnowledge | query, productId/sourceType opcionales | READ_ONLY | PostgresKnowledge, documentos aprobados |
| handoffToHuman | reasonCode, hasta 80 | LOW_RISK | Devuelve solicitud; service.ts valida y persiste control humano |

Errores: llamadas de backend/deadline registran TOOL_FAILED sin propagar secretos; errores de input registran INVALID_TOOL_INPUT; prohibidas/límite registran TOOL_NOT_AUTHORIZED. Promociones sin adaptador es un resultado explícito vacío, no una promoción exitosa. El contador de herramientas exitosas no equivale a información comercial disponible.

createCheckout/createCart/sendImage/sendProduct/sendCatalog/runWorkflow y los demás nombres reservados no son entradas ejecutables del registro. WorkflowRegistry aparte exige registro explícito y pasa AbortSignal; no fue utilizado ni modificado. No hay ejecución financiera automática.

## 13. Memoria

Inspección: consultas por conversationId; trigger pertenece a la misma conversación; preferencias y memoria vienen del contacto relacionado. Persistencia protege revisión, último mensaje y control humano con transacción/locks. No se observó mapa global de memoria conversacional. Los tres orquestadores concurrentes conservaron HY300/HY320/LK618 por separado.

Resumen determinista acotado: etapa, intención, activos, preguntas, necesidades y presupuesto; objeciones máximas 5. Historial máximo cuatro mensajes; datos personales se redactan parcialmente. La memoria de cliente reutilizada guarda aliases confirmados con evidencia y expiración de 180 días. Esto es aislamiento por diseño y en proceso; no demuestra carreras PostgreSQL ni aislamiento de filas bajo concurrencia real.

## 14. RAG

- Chunking de caracteres: tamaño 1400, overlap160; no tokenización semántica.
- Metadata: tipo, sourceId, productId, brand/category, version, approval, timestamps; JSON embeddingModel/language/tags.
- TopK default5, máximo8; candidatos hasta 3×limit.
- Léxico en español y exact sourceId; vector coseno mínimo0.55; RRF k60. Scores fusionados no son probabilidades.
- Filtra aprobación, INTERNAL, producto visible, productId, marca, categoría, tipo; generalOnly impide mezclar políticas de productos en consultas generales.
- Deduplicación de resultados por chunkId; indexación por hash/documento. No deduplica semánticamente textos iguales de fuentes distintas.
- Actualización transaccional de chunks/vectores; no fue ejecutada.
- Modelo efectivo esperado qwen3-embedding:0.6b; caché 128 entradas, TTL5min, clave por endpoint/modelo/texto hash.
- Si falla vector en híbrido, conserva léxico; si falla PostgreSQL no existe fuente alternativa real de datos. El orquestador informa/deriva.

SQL, filtros y modelo se inspeccionaron; consultas/índices/modelo reales **NO VALIDADOS**. El renderer no usa RAG como precio/stock; no todas las posibles formulaciones de datos dinámicos o contradicciones en prosa están formalmente detectadas.

## 15. Confidence engine

Puntuación exacta actual: humano/fallo limita a0.3; saludo0.95; match exacto0.95; productos encontrados0.75; fuentes presentes0.7; sin evidencia0.35. Ambigüedad limita a0.35; contradicción0.1. El mínimo de subrespuestas gobierna mensajes compuestos.

Influyen realmente: intención GREETING, coincidencia exacta/productos, presencia de fuentes, fallos, ambigüedad y contradicción. Solo se registran como diagnóstico, sin ponderación independiente: intentConfidence0.9/0.2, entityConfidence1/0.65/0, score numérico de recuperación y freshness LIVE_LOOKUP/NOT_VERIFIED. Freshness significa que una consulta tuvo éxito, no una evaluación temporal de updatedAt.

Tests controlados: match exacto → AUTO elegible; producto amplio → ASSISTED; fallo tool → HANDOFF. Se corrigió toolSuccess agregado en consultas compuestas. No se cambió la fórmula ni se atribuye calibración estadística.

## 16. Autonomy engine

Defaults: nivel2, auto0.85, assisted0.60, handoff0.30. La tabla describe elegibilidad del motor, no un envío observado; ROCKY_AUTO_ENABLED está desactivado y no se realizó ningún envío.

| Intención / condición | Nivel mínimo | Acción del motor con defaults | Requiere humano |
|---|---:|---|---|
| GREETING, confianza0.95 | 1 | AUTO elegible | No |
| BUSINESS/WARRANTY/SHIPPING/PAYMENT, fuentes0.7 | 1 | ASSISTED, por debajo0.85 | Revisión para enviar automáticamente |
| PRODUCT_PRICE/STOCK/INFORMATION, coincidencia exacta0.95 | 2 | AUTO elegible con tool válida | No, si conserva control automático |
| PRODUCT_SEARCH amplio,0.75 | 2 | ASSISTED | Revisión |
| PRODUCT_COMPARISON exacta | 2 | AUTO elegible si todos los datos son suficientes | Según evidencia |
| CATALOG_REQUEST | 2 | Propuesta según confianza; catálogo solo no garantiza0.85 | Según umbral |
| FOLLOW_UP/OBJECTION | 1 o2 según intención | Frecuentemente CLARIFY/ASSISTED por confianza | Según evidencia |
| Carrito existente | 3 | El checkout sigue limitado al simulador | Acciones reales no habilitadas |
| HUMAN_REQUEST/COMPLAINT/RETURN/ORDER_STATUS | Cualquiera | HANDOFF; pedidos requieren verificar identidad | Sí |
| UNKNOWN, tool falla o contradicción | Cualquiera | HANDOFF | Sí |
| Ambigüedad sin producto,0.35 | 2 | CLARIFY/SUGGEST | No necesariamente |
| Acciones MEDIUM_RISK/HIGH_RISK | Ninguno habilitado | Bloqueadas en registro | No se ejecutan automáticamente |

Nivel0 bloquea encolado automático; nivel4 no habilita adaptadores extra. El cambio de control por seguridad/handoff y las simulaciones tienen reglas propias del servicio. Persistencia de handoff y carrera entre control humano/inferencia: **NO VALIDADAS con DB real**.

## 17. Feedback

Estados existentes: THUMBS_UP, THUMBS_DOWN, EDITED, SENT_AS_IS, HUMAN_OVERRIDE. Original reside en RockyRun.result.reply; el plan validado en interaction.modelResponse; respuesta propuesta en interaction.finalResponse; corrección final en RockyFeedback.humanResponse y status/outcome/reviewer/createdAt. humanEdited se calcula y devuelve/registra; no tiene columna propia. El texto final corregido no sustituye el original del run.

Defecto corregido: comparar tras anonimizar hacía que dos correos distintos pareciesen SENT_AS_IS. Ahora la comparación de entrada es literal antes de redactar; la salida sigue redactada. La marca exacta de edición de datos redactados no puede reconstruirse siempre después desde DB; debe interpretarse junto al estado EDITED/HUMAN_OVERRIDE. Almacenamiento real de ambos eventos no se ejecutó. Ningún camino de feedback invoca indexación RAG.

## 18. Exportación dataset

Solo aprobación explícita APPROVED_FOR_DATASET + VERIFIED_SUCCESS + revisor, evaluación más reciente, no UNKNOWN ni tool fallida ni contradicción. Un thumbs-up no aprueba. El endpoint consulta hasta500 runs candidatos y produce JSONL. Se corrigieron empates conflictivos de timestamp: ahora excluyen el ejemplo sin asumir orden.

Selector puro y revocación se probaron; endpoint autenticado, lectura PostgreSQL y archivo exportado desde registros reales **NO VALIDADOS**. Dataset sigue requiriendo revisión de privacidad/datos dinámicos. La comparación humanCorrected de export usa textos redactados, no afirma conocer diferencias privadas eliminadas. No se entrenó ningún modelo.

## 19. Concurrencia

Tres orquestadores en paralelo, memorias distintas, backend real caído: 2056.51ms en conjunto; referencias independientes=true. Gate singleInference comprobado sin inferencia sustituta: segundo acceso recibe ROCKY_BUSY y, tras liberar, vuelve a aceptar trabajo. No hay cola de cinco inferencias; hay exclusión mutua con fallback. Concurrencia real de Ollama y transacciones de conversación PostgreSQL **NO VALIDADAS**.

Se corrigió y probó la carrera del presupuesto de tools: trece solicitudes concurrentes al mismo executor ejecutan doce adaptadores y rechazan una antes de ejecutarla.

## 20. Fallos encontrados

Los cinco primeros tienen reproducción en [defects-before.txt](e2e-validation-20260926/defects-before.txt) y verificación en [defects-after.txt](e2e-validation-20260926/defects-after.txt):

1. Rechazos de schema/autorización no entraban en toolCalls: podía aparecer toolSuccess=true pese al fallo.
2. Presupuesto de tools comprobaba llamadas completadas, permitiendo trece o más simultáneas.
3. Redacción de feedback ocultaba cambios literales y aceptaba incorrectamente SENT_AS_IS.
4. Empate de timestamp podía exportar aprobación pese a revocación simultánea.
5. Un mensaje compuesto heredaba toolSuccess/interacción del primer fragmento y perdía evidencia del segundo.

Limitaciones de entorno: CLI Ollama ausente, API Ollama ECONNREFUSED, PostgreSQL inaccesible. Primer build falló EPERM por DLL Prisma usada por el diagnóstico concurrente; no fue un error de TypeScript. Se repitió secuencialmente después de terminar ese proceso y pasó.

## 21. Correcciones realizadas

- tools.ts: reserva intento antes del await; registra rechazos sin guardar argumentos ni exponer errores sensibles; conserva rechazo de Zod y permisos.
- learning.ts: compara entradas antes de redactar; export excluye revisiones empatadas conflictivas; comparación de dataset explícitamente sobre texto redactado.
- orchestrator.ts: registra mensaje/respuesta completos de consultas compuestas y combina señales de tools, ambigüedad, contradicción, coincidencia y recuperación.

No se añadieron capas, funcionalidades comerciales, modelos ni entidades. No se modificó el reporte anterior; este documento aclara sus límites.

## 22. Archivos modificados

Modificados en este turno: `src/lib/rocky/tools.ts`, `src/lib/rocky/learning.ts`, `src/lib/rocky/orchestrator.ts`.

Nuevos: `src/lib/rocky/validation-regressions.test.ts`, `scripts/rocky/validate-e2e.ts`, este reporte y evidencias en `docs/rocky/e2e-validation-20260926/`.

Los demás cambios que aparecen en git status proceden del turno anterior y se conservaron. Se guardaron hashes de inicio y comparación en baseline-hashes.json/change-and-baseline-check.json. Sin cambios de schema/variables/secretos/n8n.

## 23. Tests

`node --import tsx --test src/lib/rocky/*.test.ts`: **175/175**, cero fallos; las 168 anteriores continúan pasando. Siete nuevas: cinco regresiones reproducidas, deadline del executor y niveles de confianza/autonomía. [Salida completa](e2e-validation-20260926/rocky-tests.txt).

Selección de pruebas preexistentes externas: **68/76**, los mismos ocho fallos conocidos. No se presentan como un conjunto global verde.

## 24. TypeScript

`npx tsc --noEmit`: código0, sin diagnósticos. El build también completó TypeScript. No se omitieron errores ni se relajó configuración.

## 25. Prisma

`npx prisma validate`: schema válido; aviso preexistente de deprecación package.json#prisma. **Validar schema no implica conexión DB**. La conexión real falló. Build ejecutó prisma generate sin migrar datos.

## 26. Lint

Archivos de este turno: **0 errores y 0 warnings**. Global: **358 errores y 3844 warnings**, mismos conteos del reporte previo, ninguno en los archivos productivos cambiados este turno. Evidencia JSON completa y resumen en e2e-validation-20260926. No se ejecutó --fix global ni se tocaron módulos ajenos.

## 27. Build

Intento1: EPERM al reemplazar query_engine-windows.dll.node mientras el diagnóstico Prisma estaba activo. Conservado en build-attempt-1.txt.

Intento2, secuencial: **código0**, compilación5.7s, TypeScript10.0s, 53/53 páginas. Conserva warning Turbopack y error de lectura de categorías por PostgreSQL127.0.0.1:5432 inaccesible. No equivale a probar runtime con catálogo real. [Salida completa](e2e-validation-20260926/build.txt).

## 28. Fallos preexistentes / fuera de alcance

**PREEXISTENTES / FUERA DE ALCANCE**:

- Cuatro del asistente antiguo: seguimiento de precio, similares, cantidad/mayorista y mezcla audífonos/teclados. Sus doce dependencias locales se compararon contra HEAD: cero diferencias.
- Cuatro incoming-media: mock sin conversation.findUnique; ruta preexistente lo llama en línea28. Los archivos de ruta/test se conservan sin cambios; se reproduce el mismo TypeError antes de entrar en Roky.
- Lint global: se conservaron358 errores/3844warnings; el ámbito modificado no introduce errores.

Evidencias: preexisting-tests.txt y change-and-baseline-check.json. No se corrigieron esos módulos para evitar ampliar el alcance.

## 29. Riesgos restantes

- Falta evidencia real de instalación/calidad/latencia de Qwen y embeddings, datos HY300, SQL/pgvector y persistencia completa.
- Falta E2E autenticado del Centro de Mensajes: runRocky, botEnabled, feedback SENT_AS_IS/EDITED y export con filas reales de prueba.
- Confianza heurística sin calibración y resumen de estado limitado; no deben presentarse como razonamiento probabilístico ni memoria semántica completa.
- Deadline no cancela tareas Prisma/PDF; singleInference rechaza simultáneas en vez de encolarlas; ambos comportamientos requieren validación bajo infraestructura real.
- Dataset sigue requiriendo anonimización/revisión; createdAt ordena eventos por creación, no por posteriores cambios de estado de una fila antigua.
- No se verificó concurrencia persistida, workers/outbox/Meta/n8n end-to-end; no se enviaron mensajes externos.

## 30. Veredicto técnico

**ROKY E2E PARCIALMENTE VALIDADO**

Validado: código auditado, 175 pruebas, correcciones reproducidas, decisión de confianza/autonomía, contexto acotado, aislamiento en memoria, deadline, gate de inferencia y fallback ante fallos reales de conexión.

Falta exactamente: disponer de PostgreSQL/pgvector con datos y conversaciones de prueba, Ollama con ambos modelos, probar inferencia/embeddings reales, ejecutar el servicio persistido y API autenticada de feedback/export, comprobar handoff/botEnabled y concurrencia transaccional. Debe repetirse en un entorno de prueba identificado; no se certifica producción ni se autoriza activar AUTO con esta evidencia.
