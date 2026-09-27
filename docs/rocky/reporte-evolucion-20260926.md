# ROKY — reporte de implementación y validación

## 1. Resumen ejecutivo

Se extendió Roky sobre su implementación existente, manteniendo Qwen 3.5 9B en Ollama y los contratos históricos. Se añadieron contexto central, resumen de memoria, clasificación comercial compatible, registro descriptivo de herramientas, confianza central, autonomía antes del outbox, feedback tipado y exportación revisada. No se modificó producción, secretos, Prisma, workflows n8n ni infraestructura. No se hizo push, merge o deploy.

168/168 pruebas de Roky pasan, incluidas 17 nuevas. TypeScript, Prisma validation y lint del ámbito modificado pasan; este último conserva una advertencia de imagen preexistente. Build termina con código 0, pero el prerender reporta PostgreSQL local inaccesible. La validación completa de runtime sigue pendiente por falta de PostgreSQL y Ollama locales. Hay fallos preexistentes en pruebas ajenas y lint global, detallados abajo.

## 2. Arquitectura encontrada originalmente

Ver [mapa de auditoría previo](arquitectura-evolucion.md). Ya existían `LLMProvider`, `OllamaLocalProvider`, planner JSON tipado, skills, ToolExecutor, RAG híbrido en PostgreSQL/pgvector, sesiones, preferencias, memoria de clientes, carrito validado, feedback y ejemplos de intención revisados. El modelo ya estaba separado del renderizado determinista de afirmaciones comerciales. Se conserva esta separación.

## 3. Problemas detectados

- La configuración de embeddings estaba repetida y fija; `OLLAMA_MODEL` seguía siendo necesaria para el proveedor antiguo.
- Un fallo vectorial anulaba también los resultados léxicos de la búsqueda híbrida.
- Las herramientas carecían de descripción/riesgo central y límite de espera del ejecutor.
- Las consultas de ficha no recuperaban conocimiento específico cuando faltaban especificaciones del backend.
- Las consultas generales de políticas podían recuperar documentos específicos de otro producto.
- Confianza y decisiones de envío no tenían umbrales centrales ni niveles de autonomía.
- No había resumen persistido, context builder ni exportación con aprobación explícita de dataset.
- «Cuánto está» no tenía regla de precio; «hay stock» conservaba «hay» como supuesto producto.
- Una objeción con producto conocido y consulta vacía intentaba una búsqueda inválida.

Seguridad, dentro del ámbito solicitado:

| ID | Severidad | Evidencia y corrección |
|---|---|---|
| ROKY-01 | Media | `service.ts`, decisión de outbox: la confianza no restringía AUTO. Ahora se aplica `autonomyDecision` antes de encolar, conservando las comprobaciones transaccionales originales. |
| ROKY-02 | Media | `orchestrator.ts`, combinación de resultados: se conservaba el primer hecho aunque una lectura posterior discrepase. Ahora precio, stock y especificaciones discrepantes derivan; `context.ts` detecta también contradicciones explícitas campo/valor en conocimiento del mismo producto. |
| ROKY-03 | Media | `api/admin/rocky/route.ts`, POST: sesión admin sin comprobación explícita de Origin. Ahora se rechaza Origin externo; se conservan clientes autenticados sin Origin. |
| ROKY-04 | Baja | `service.ts`, consola: se elimina el campo de contadores de tokens del evento; los eventos nuevos contienen metadatos, sin mensajes ni credenciales. |

Se mantienen schemas estrictos, allowlists por skill, URLs propias, Ollama restringido a localhost, autenticación interna y separación del prompt respecto de datos no confiables. Esto no constituye una auditoría de seguridad completa de todo el sitio.

## 4. Arquitectura final

1. Model/reasoning: contrato LLMProvider existente, configuración central y prompt único; el modelo propone planes, no autorizaciones.
2. Knowledge/RAG: PostgreSQL/pgvector existente, documentos aprobados, filtros y fallback léxico. Los datos dinámicos siguen saliendo del backend.
3. Memory: historial reciente + resumen estructurado + estado comercial en RockySession; memoria de cliente y preferencias existentes.
4. Tools/actions: registro validado, riesgos, timeout, hechos actuales; control de autonomía adicional antes de enviar al outbox.
5. Learning/feedback: RockyRun y RockyFeedback existentes, tipos de evaluación, diferencias y exportación explícitamente revisada. No se promueven respuestas a RAG.

## 5. Archivos creados

En `src/lib/rocky/`: `config.ts`, `prompts.ts`, `context.ts`, `intent.ts`, `memory.ts`, `confidence.ts`, `autonomy.ts`, `learning.ts`, `observability.ts`, `architecture.test.ts`.

Documentación: `docs/rocky/arquitectura-evolucion.md` y este reporte. Evidencias de comandos en `docs/rocky/validation-20260926/`.

## 6. Archivos modificados

En `src/lib/rocky/`: `contracts.ts`, `planning.ts`, `provider.ts`, `orchestrator.ts`, `rag.ts`, `backend.ts`, `tools.ts`, `service.ts`, `http.ts`, `analytics.ts`, `query-language.ts`, `skills/catalog.json`.

También: `src/app/api/admin/rocky/route.ts`, `src/app/api/internal/rocky/embed/route.ts`, `src/app/admin/rocky/aprendizaje/page.tsx`, `src/components/admin/messages/simulator/MessageSimulator.tsx`, `docs/rocky/env.example`.

## 7. Prisma

Sin cambios de schema ni migraciones. Se amplía JSON existente en RockyRun.result y RockySession.memory, metadata de KnowledgeDocument y valores de strings existentes de RockyFeedback. Campos opcionales permiten seguir leyendo sesiones y ejecuciones antiguas. No se borraron datos ni se ejecutó indexación real. `prisma generate`, ejecutado por el build existente, genera cliente sin migrar la base.

## 8. Variables de entorno

Solo se editó el ejemplo documental; no se modificó `.env` ni secretos.

| Variable | Predeterminado |
|---|---|
| ROCKY_MODEL | qwen3.5:9b |
| ROCKY_EMBEDDING_MODEL | qwen3-embedding:0.6b |
| ROCKY_AUTONOMY_LEVEL | 2 |
| ROCKY_AUTO_RESPONSE_THRESHOLD | 0.85 |
| ROCKY_ASSISTED_THRESHOLD | 0.60 |
| ROCKY_HANDOFF_THRESHOLD | 0.30 |
| ROCKY_TOOL_TIMEOUT_MS | 15000 |

Valores numéricos inválidos usan defaults; umbrales mantienen orden handoff ≤ assisted ≤ auto. Los switches actuales no se activaron. `OLLAMA_MODEL` se conserva porque `src/lib/ollama.ts` lo consume.

## 9. RAG

Se conserva fragmentación 1400 caracteres/160 de solapamiento, topK 5/máximo 8, RRF k=60 y similitud vectorial mínima 0.55. El modelo de embedding se etiqueta al guardar y se filtra al buscar; no se comparan embeddings de modelos diferentes. El índice continúa requiriendo 1024 dimensiones: cambiar modelo exige compatibilidad dimensional y reindexación explícita.

Se añaden language/tags a metadata, fallback léxico ante fallo de Ollama/pgvector, filtro por producto para fichas sin especificaciones y políticas generales sin producto ajeno. El context builder rechaza documentos de otros productos y documentos INTERNAL. El renderizado de fichas desde RAG excluye texto con indicadores de precio/stock/promoción. Las cifras dinámicas se recuperan con tools y siguen revalidándose antes del commit del servicio.

No se añadió reranker: ya existía fusión híbrida y no hay evaluación que justifique otro modelo. Caché de embeddings de 128 claves hash, TTL 5 minutos, separada por modelo/endpoint; no guarda textos originales ni cachea precios/stock.

## 10. Memoria

Se mantienen los últimos cuatro mensajes relevantes y la memoria de cliente existente. El resumen nuevo deriva del estado validado: etapa, intención, productos activos, preguntas pendientes, necesidades y presupuesto declarado. Sales memory añade intención de compra, objeciones acotadas, productos considerados y siguiente acción. No se usa otra llamada LLM ni se permite que el modelo escriba datos críticos.

Las preferencias explícitas y la recuperación de productos del cliente siguen en los servicios existentes. No se creó un perfil paralelo ni se infieren nombres/direcciones para almacenarlos automáticamente.

## 11. Tools disponibles

Registro ejecutable: `getCatalog`, `getBusinessInfo`, `searchProducts`, `getProduct`, `getProductByCode`, `getStock`, `getPrice`, `getPromotions`, `checkCompatibility`, `compareProducts`, `searchKnowledge`, `handoffToHuman`.

`getPromotions` informa que no hay adaptador verificado; no devuelve promociones ficticias. `checkCompatibility` consulta ficha, pero una afirmación de compatibilidad sigue requiriendo revisión. Handoff solicita la decisión; el servicio valida y persiste el cambio de control. `getCatalog` prepara el catálogo existente. Adjuntos usan el mecanismo actual.

Los nombres reservados de pedidos, checkout y workflows siguen sin convertirse en permisos ejecutables. El carrito validado existente continúa limitado al simulador. Riesgos READ_ONLY/LOW_RISK permiten el conjunto actual; MEDIUM_RISK/HIGH_RISK quedan bloqueados. Timeout limita la espera, no cancela una consulta Prisma o PDF ya iniciada; no hay operaciones financieras en este registro.

## 12. Confianza

`evaluateConfidence` centraliza la heurística y devuelve señales: intención, entidades, coincidencia exacta, resultados de recuperación, herramientas, consulta dinámica, ambigüedad y contradicción. Fallos, ambigüedad y discrepancias reducen confianza. No se toma una probabilidad declarada por Qwen. Los valores son heurísticos, no probabilidades calibradas; score RRF se registra como relevancia, no como certeza estadística. Umbrales configurables en un único módulo.

## 13. Autonomía

Nivel 0: sugerencias; 1: consultas simples; 2: productos y datos actuales; 3: permite el ámbito comercial de bajo riesgo existente; 4: reservado, sin habilitar herramientas sensibles nuevas. El nivel no reemplaza MANUAL/COPILOT/AUTO, master switch, botEnabled, asignación humana ni política de contactos.

El servicio solo encola cuando todos los controles actuales y la nueva decisión lo permiten. UNKNOWN o confianza bajo umbral deriva; una referencia ambigua puede quedar como aclaración/sugerencia. El simulador sigue produciendo mensajes de prueba para evaluar decisiones sin habilitar envíos reales. No se agregó configuración por intención.

## 14. Feedback y dataset

POST autenticado `/api/admin/rocky`, action `feedback`, conserva runId/humanResponse/outcome y acepta `feedback`: THUMBS_UP, THUMBS_DOWN, EDITED, SENT_AS_IS, HUMAN_OVERRIDE. SENT_AS_IS rechaza texto diferente. Devuelve original/final/humanEdited con redacción básica. No afirma entrega real: el evento es una declaración del revisor.

Simulador: botones «Respuesta útil»/«Necesita mejorar» y corrección EDITED. La pantalla existente de aprendizaje incluye estos estados pendientes. Su aprobación para evaluación o planificación sigue separada del dataset.

Para seleccionar dataset: POST action `datasetReview`, runId, humanResponse, approved, verifiedKnowledge, successfulOutcome. Solo los tres booleanos verdaderos generan APPROVED_FOR_DATASET/VERIFIED_SUCCESS; una revisión negativa revoca la selección. GET autenticado `/api/admin/rocky?export=dataset` exporta hasta 500 runs candidatos recientes en JSONL y comprueba la evaluación más reciente. Excluye intenciones desconocidas, herramientas fallidas y contradicciones. Thumbs-up por sí solo no habilita exportación.

Se conserva la procedencia, respuesta original, corrección y referencias. Antes de SFT todavía se necesita revisión de privacidad, convertir cifras dinámicas a ejemplos de consulta de herramientas, separar conjuntos y deduplicar. La redacción automática de correos/números/credenciales no garantiza anonimización de nombres o direcciones.

## 15. Logging y métricas

RockyRun guarda interacción redactada, plan validado (no razonamiento ni propuesta descartada del modelo), clasificación, contexto recuperado, tools, duración, señales y acción final. Se conserva el contrato anterior de contadores de uso en result; no se imprimen en el evento nuevo ni se registran credenciales.

`rocky.completed`: IDs, intención, confianza, modelo, latencia, tools, IDs recuperados, handoff, decisión y encolado automático. `rocky.feedback`: IDs, estado, edición y fecha. No incluye texto de mensajes.

Analytics incorpora latencia media, hit rate RAG, éxito tools, handoff, UNKNOWN y respuesta automática. El endpoint expone conteos por estado de feedback y outcome para análisis de positivos/negativos/ediciones/resultados. Conversión real no se infiere del texto: requiere el resultado de negocio verificado. No hay dashboard nuevo.

## 16. Pruebas creadas

17 pruebas en `architecture.test.ts`: saludo sin tools, precio real HY300, stock con memoria, Bluetooth y filtro por producto, humano/aclaración, fallo stock y contradicción, contexto/inyección/redacción, compra/media, niveles de autonomía y thresholds, resumen comercial, registro/schema/timeout, aprobación/revocación dataset, eventos sin contenido sensible, fallback RAG, reutilización embeddings, contradicción de especificaciones y Origin.

Las 151 pruebas existentes de Roky se conservaron. Los tests usan dobles; no se enviaron mensajes WhatsApp ni se modificaron datos reales.

## 17. Validaciones y resultados

| Comando/ámbito | Resultado |
|---|---|
| `npx tsc --noEmit` | OK |
| `npx prisma validate` | OK; aviso existente de configuración package.json#prisma deprecada |
| Tests Roky | 168/168 OK |
| Tests asistente antiguo + automations | 46/50; 4 fallos del asistente antiguo |
| Tests selección BC/mensajería | 22/26; 4 fallos por mock incompleto de incoming media |
| Lint de Roky y rutas/UI tocadas | 0 errores, 1 warning previo de img en simulador |
| `npm run lint` | 358 errores, 3844 warnings globales; no es un proyecto globalmente limpio |
| `npm run build` | Código 0; TypeScript y 53 páginas generadas; advertencia Turbopack y error de lectura de categorías por PostgreSQL 127.0.0.1:5432 inaccesible |
| `git diff --check` | OK |
| Consulta local Ollama /api/tags | No disponible |

Fallos del asistente antiguo: seguimiento de precio, productos similares, cálculo mayorista con memoria y separación audífonos/teclados. Se verificaron sus 12 dependencias locales mediante resolución TypeScript: ninguna está modificada por este trabajo. Fallos incoming-media: mock sin `conversation.findUnique`, utilizado en la ruta preexistente en línea 28; ruta y test no tienen modificaciones. No se ocultaron ni se alteró backend ajeno para hacerlos pasar.

Evidencias completas: `validation-20260926/rocky-regression-output.txt`, `rocky-compatibility-output.txt`, `rocky-messages-output.txt`, `rocky-targeted-lint-output.txt`, `rocky-lint-output.txt`, `rocky-build-output.txt`.

## 18. Riesgos pendientes

- Falta smoke end-to-end con PostgreSQL/pgvector y Ollama reales; no se verificaron modelos instalados, rendimiento GPU ni calidad de inferencia real.
- La confianza necesita calibración con ejemplos revisados; el nuevo gate reduce envíos automáticos respecto al comportamiento previo cuando la evidencia es insuficiente.
- Contradicciones detectadas: hechos estructurados y especificaciones campo/valor. No se promete detección semántica completa de contradicciones en prosa.
- Redacción de PII es básica; exportaciones requieren revisión antes de entrenamiento. No se incorporó una política nueva de retención.
- Lint global y ocho fallos de pruebas de otros módulos permanecen pendientes.
- Timeouts no cancelan trabajo subyacente que carece de AbortSignal; la caché es local al proceso.
- Un nivel de autonomía no añade adaptadores inexistentes ni verifica pagos. El comportamiento existente del simulador puede representar propuestas aunque el envío real esté bloqueado.

## 19. Deliberadamente no implementado

Fine-tuning, LoRA, entrenamiento automático, nueva base vectorial, otro proveedor pagado, generación libre de precios, operaciones financieras, adaptadores ficticios de pedidos/promociones/delivery, cambios de workflows n8n, nuevas tablas, dashboard complejo, autonomía por intención, downloader de TikTok/Facebook, audio/video automático y despliegue.

## 20. Próximo paso recomendado

Levantar el entorno local existente de PostgreSQL y Ollama, verificar ambos modelos e índice 1024, ejecutar smoke del simulador con los diez escenarios solicitados y revisar decisiones de confianza. Después recolectar correcciones humanas, verificar fuentes/resultados y privacidad, exportar JSONL, separar evaluación de entrenamiento y calibrar thresholds. Diseñar SFT/LoRA solo tras medir que mejora sobre el sistema actual y evitar enseñar precios/stock históricos como hechos permanentes.
