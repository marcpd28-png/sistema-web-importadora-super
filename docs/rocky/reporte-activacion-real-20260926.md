# Activación real de Roky — 26/09/2026 (America/Lima)

**ROKY REAL VALIDADO**, en el entorno local aislado descrito aquí. PostgreSQL, pgvector y ambos modelos reales participaron. No es una validación de producción ni de entrega de mensajes a clientes.

Evidencia reproducible: [runtime-evidence.json](activation-real-20260926/runtime-evidence.json), [primera ejecución real](activation-real-20260926/first-real-run.json), [script E2E](../../scripts/rocky/validate-real.ts), [script HTTP](../../scripts/rocky/validate-real-http.mjs).

## 1. Estado inicial

Se leyó `reporte-validacion-e2e-20260926.md`. Se conservaban 175 pruebas aprobadas y cinco correcciones anteriores. Windows, PowerShell, Docker Desktop/WSL, 16 GB RAM y NVIDIA RTX 4060 Laptop de 8 GB. No había Ollama instalado en Windows ni en Ubuntu/WSL. Los contenedores PostgreSQL relevantes estaban detenidos. Causas: `OLLAMA_NO_INSTALADO`, `POSTGRES_CONTAINER_STOPPED` y flags locales ausentes.

## 2. Estado de Ollama

Instalado y ejecutándose, versión **0.34.4**. API y consultas reales exitosas. El host no tenía comando `ollama`; la CLI se ejecuta mediante `docker exec rocky-local-ollama ollama …`.

## 3. Ubicación e instalación

Contenedor `rocky-local-ollama`, imagen oficial `ollama/ollama`, digest `sha256:8262851b2846b87c649eddf3e76beb270c52f4d1bc94559f47efde16b0841551`. Volumen persistente `rocky_local_ollama:/root/.ollama`. GPU habilitada, CPU limitada a 4, memoria solicitada 8 GB; Docker/WSL dispone de aproximadamente 7,6 GiB compartidos. `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`. No se alteraron los contenedores de otros proyectos.

Método basado en la [imagen Docker oficial de Ollama](https://ollama.com/blog/ollama-is-now-available-as-an-official-docker-image) y la [guía de Docker para Ollama](https://docs.docker.com/guides/rag-ollama/).

## 4. Host utilizado

`http://127.0.0.1:11434`, publicado solo en loopback. Coincide con `OLLAMA_HOST` preexistente; Roky usa `ROCKY_OLLAMA_URL`. No se usó servidor remoto.

## 5. Modelos encontrados

Se descargaron exactamente los modelos solicitados: `qwen3.5:9b` (ID `6488c96fa5fa`, 6,6 GB) y `qwen3-embedding:0.6b` (ID `ac6da0dfba84`, 639 MB). Sin sustituciones. La configuración antigua `OLLAMA_MODEL` de otro módulo permanece intacta y no selecciona el modelo de Roky.

## 6. Resultado qwen3.5:9b

Petición real: «Responde únicamente: ROKY_OK». Respuesta **ROKY_OK**, 20 tokens de entrada, 4 de salida. Primera ejecución: 49.271 ms, incluida carga inicial de 31.167 ms. Repetición: 20.206 ms, carga de 19.755 ms.

El servicio `runRocky` invocó además el proveedor normal mediante «Me orientas por favor»: modelo `qwen3.5:9b`, 841 tokens de entrada y 30 de salida; plan válido, persistido como `interaction.modelResponse`. Proveedor: 10.179 ms en la ejecución final (8.760 ms en la primera). No se usaron mocks ni respuestas de LLM fabricadas.

## 7. Resultado qwen3-embedding:0.6b

Texto real: «Proyector HY300 con Bluetooth y WiFi». HTTP exitoso, vector de **1024 dimensiones**, 12 tokens. Primera petición: 16.143 ms, repetición: 2.145 ms. El proveedor de Roky validó dimensión, números finitos y vector no nulo al indexar los productos. Se guardaron embeddings reales en PostgreSQL. No se publicó el vector completo.

## 8. Estado PostgreSQL

Se iniciaron los contenedores existentes `importadora-db` y `rocky-test-db`, conservando volúmenes. Ambos respondieron a consultas. La base habitual contiene 26 productos y no tiene las tablas de Roky ni conocimiento. La base aislada ya tenía el esquema de Roky y la extensión `vector`; inicialmente no tenía productos.

No se ejecutaron migraciones, `db push`, reset, DROP, TRUNCATE ni borrado de registros. No se modificó `schema.prisma`.

## 9. Método de conexión

Fuente: PostgreSQL Docker `127.0.0.1:5432/importadora`, solo lectura durante las pruebas. Destino de escrituras: `127.0.0.1:5437/rocky_test`, contenedor existente `pgvector/pgvector:pg16`.

Se copiaron filas reales seleccionadas, preservando código, nombre, descripción, precio y stock. No representan sincronización continua con ERP. La prueba preliminar dejó otros productos de muestra copiados; se conservaron todos, igual que conversaciones y feedback. Los documentos tienen identificadores únicos por ejecución y no reemplazan conocimiento previo.

Las credenciales existentes se leen en memoria desde la configuración del contenedor; no se imprimen ni se modifican. `DATABASE_URL` de los archivos originales permanece intacta. El lanzador establece la conexión aislada solo para su proceso.

## 10. Flag LLM

`rockyProvider()` en `service.ts`: habilitado únicamente cuando `ROCKY_LLM_ENABLED === "true"`. **undefined = false**. El modelo por defecto en `config.ts` es `qwen3.5:9b`.

## 11. Flag RAG

`rockyKnowledge()` añade proveedor vectorial únicamente cuando `ROCKY_RAG_VECTOR_ENABLED === "true"`. **undefined = false** para vectores; las consultas léxicas pueden funcionar sin ese proveedor. Modelo por defecto: `qwen3-embedding:0.6b`.

## 12. Valores utilizados en desarrollo

Archivo ignorado por Git `.env.development.local`, cargado solo en desarrollo:

```dotenv
ROCKY_LLM_ENABLED=true
ROCKY_RAG_VECTOR_ENABLED=true
ROCKY_MODEL=qwen3.5:9b
ROCKY_EMBEDDING_MODEL=qwen3-embedding:0.6b
ROCKY_OLLAMA_URL=http://127.0.0.1:11434
ROCKY_AUTO_ENABLED=false
```

El lanzador `scripts/rocky/start-local-validation.ps1` usa la base aislada, deshabilita Pusher en su proceso mediante el valor dummy ya reconocido y establece `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3101`. No escribe secretos. Servidor local escuchando en **http://127.0.0.1:3101**. Ejecutar ese lanzador para reproducir el entorno; `npm run dev` por sí solo conserva la base habitual incompleta.

## 13. Conversación E2E completa

Producto real: **ACE-001, Audífonos Bluetooth TWS Importados**, precio **S/ 29,90**, stock **480**. Alternativa explícita real: ARZ-050, Power Bank 10000 mAh Tipo C, S/ 42,90 y stock 210. Ambos son tecnología, pero no se afirma que sean modelos equivalentes. La comparación reconoce que faltan atributos técnicos. No se inventó un HY300 ni una ficha inexistente.

| Mensaje | Intent | Producto activo después | Tiempo total ms | Resultado |
|---|---|---|---:|---|
| hola | GREETING | ninguno | 43,52 | Saludo |
| estoy buscando el ACE-001 | PRODUCT_DETAILS | ACE-001 | 77,79 | Datos actuales; reconoce falta de ficha técnica ampliada |
| cuánto cuesta? | PRICE_QUERY | ACE-001 | 38,04 | S/ 29,90 desde BD |
| tiene bluetooth? | PRODUCT_DETAILS | ACE-001 | 60,22 | Recupera conocimiento del producto correcto |
| hay stock? | STOCK_QUERY | ACE-001 | 28,35 | 480 desde BD |
| cuál es la diferencia con ARZ-050? | PRODUCT_COMPARISON | ACE-001, ARZ-050 | 31,09 | Dos productos; no inventa ventajas técnicas |
| quiero comprarlo | FOLLOW_UP | ACE-001, ARZ-050 | 39,28 | Pide elegir cuál de los dos |

Todos estos turnos se ejecutaron con `simulate:true`, que identifica contactos internos y persiste mensajes reales en PostgreSQL, sin envío externo. No es un backend simulado. Confianza 0,95 en los seis primeros y 1 en la pregunta de selección; decisión de autonomía AUTO, acción efectiva SIMULATE, no entrega automática.

El JSON conserva por turno: texto, memoria anterior/posterior, intent, entidades y referencias cuando el módulo las expone, herramientas, éxito y latencia, documentos/chunks, scores, modelo, tokens, confianza, autonomía y respuesta completa. El checkout no expone clasificación estructurada igual al orquestador: no se inventó una para completar campos.

El flujo es condicional: precio/stock y saludos usan reglas; conocimiento usa embeddings/RAG; el LLM participa cuando la intención lo requiere. El modelo de esos siete turnos es `rules-and-tools`, salvo la ruta de checkout identificada en el JSON. La intervención real del LLM está comprobada en `modelTurn`; no se atribuyen al modelo las respuestas deterministas.

## 14. Memoria real

Conversación independiente: «precio ACE-001» → desconexión de Prisma → «cuánto cuesta?». `runRocky` reconstruyó contexto desde `RockySession`; mantuvo ACE-001 y devolvió su precio real. `memory.persistedAndReconnected=true`. No se suministró memoria manual al segundo turno.

## 15. RAG real

Se indexaron textos del catálogo local de ACE-001, ARZ-050 y ATU-110, sin campos de precio/stock. Los documentos aprobados de prueba conservan la procedencia del catálogo y producto; esto no añade información técnica que el catálogo no tenga.

Consulta: «Audífonos Bluetooth TWS Importados bluetooth». Metadata: `productId=cmuj4yexl00007op8h9k9n0y6`, aprobados, `PRODUCT`, producto visible; topK=5, modelo `qwen3-embedding:0.6b`. Búsqueda híbrida: 43,62 ms, scores RRF 0,032786885 y 0,032258065. También se ejecutó **modo exclusivamente vectorial**, con dos resultados del mismo producto, scores RRF 0,016393443 y 0,016129032. Son scores de fusión/ranking, no probabilidades ni cosenos crudos.

La repetición conservó dos documentos con contenido equivalente, porque no se borró evidencia de la primera prueba. Los IDs/chunks y textos están en `rag`, `vectorOnly` y cada turno. La consulta técnica recuperó esos chunks; ningún resultado pertenece a otro producto.

## 16. Herramientas

Éxito en todas las llamadas registradas: `getProductByCode`, `getPrice`, `getStock`, `searchKnowledge`, `compareProducts`, `searchProducts`, `handoffToHuman`. Sin adaptadores falsos. Precio y stock salen de consultas vivas a las copias fieles en la BD aislada, no del LLM ni de documentos.

Consulta adicional con código inexistente `ZZ99999999`: cero productos y respuesta que reconoce falta de información; no inventó precio o stock.

## 17. Feedback real

Se guardaron y releyeron `RockyRun` y `RockyFeedback`. `modelFeedback` conserva plan del modelo (`modelResponse`), respuesta final (`finalResponse`), respuesta editada y `humanEdited=true`. `humanEdited` es calculado con `responseDifference`, no una columna nueva.

Además, con una sesión local temporal firmada usando el secreto existente y un administrador local existente: POST `/api/admin/rocky` **200**, GET por conversación **200**, ID de feedback encontrado en la relectura. Duración conjunta: 1.692 ms. No se imprimieron token, contraseña ni datos del administrador. No se aprobó información para entrenamiento ni se ejecutó fine-tuning.

## 18. Handoff real

«quiero hablar con una persona» ejecutó HUMAN_REQUEST y la herramienta de handoff; la conversación persistida terminó con `status=ATENDIENDO`, `botEnabled=false`. Contacto exclusivo `SIMULATOR:`. Sin n8n, WhatsApp ni mensajes externos.

## 19. Concurrencia

Tres conversaciones independientes, cada una con un producto real distinto; primera ronda simultánea de selección y segunda ronda simultánea «cuánto cuesta?». Las tres recuperaron exclusivamente su propio producto persistido. `isolated=true`; segunda ronda completa: **53,05 ms**. Esto valida aislamiento de conversación y herramientas, no tres inferencias simultáneas: la política existente serializa/rechaza inferencia concurrente.

## 20. Latencias

Mediciones reales de la ejecución final:

| Fase | Tiempo |
|---|---:|
| Lectura y parseo de memoria persistida, sonda separada | 1,577 ms |
| Intent, sonda separada | 0,080 ms |
| Confianza, sonda separada | 0,017 ms |
| Embeddings vía proveedor, indexación inicial de la corrida | 2.850 ms |
| Embeddings posteriores sin caché | 21–34 ms |
| Embedding repetido desde caché | 0,218 ms |
| RAG híbrido | 43,617 ms |
| Herramientas en conversación principal | 3–43 ms por llamada |
| LLM vía proveedor normal | 10.179 ms |
| Orquestación del turno con LLM | 10.204 ms |
| Conversación principal, por turno completo persistido | 28–78 ms |

Las sondas de intent/memoria/confianza son ejecuciones separadas de funciones reales; no son spans instrumentados dentro de cada turno y no deben sumarse a sus totales. No se reestructuró el código para añadir trazas por fase. El tiempo de herramientas RAG incluye embeddings y consulta, por lo que tampoco se suma dos veces.

## 21. Bugs y problemas encontrados

1. Seguimiento «tiene bluetooth?» tratado como nueva búsqueda, sin recuperación técnica adecuada.
2. «diferencia con…» no reconocido como comparación y pérdida del producto anterior.
3. Turbopack en el servidor de desarrollo devolvió 404 HTML para una ruta API existente y compilada. El build sí incluye esa ruta; la causa interna de Turbopack no se determinó.
4. Origen local del POST no aceptado con la configuración original del sitio; se reprodujo 403 y se configuró la URL del sitio local en el proceso de prueba.

Las cargas iniciales elevadas son un riesgo de rendimiento observado, no un motivo para cambiar de modelo.

## 22. Correcciones realizadas

Cambios mínimos en `planning.ts`: reconocer seguimiento técnico breve Bluetooth/WiFi conservando el producto; reconocer «diferencia con» y combinar el código explícito con el único producto previamente seleccionado. Dos regresiones nuevas verifican los casos reproducidos.

Mitigación operativa del servidor local: `next dev --webpack`, opción documentada en los archivos instalados de Next.js; URL local configurada solo en el lanzador. No se cambió Next.js, configuración de build ni estructura de módulos.

## 23. Archivos de esta activación

- `src/lib/rocky/planning.ts`: dos correcciones puntuales.
- `src/lib/rocky/real-activation-regressions.test.ts`: dos pruebas.
- `scripts/rocky/validate-real.ts`: E2E con PostgreSQL/Ollama reales, persistencia y evidencia.
- `scripts/rocky/validate-real-http.mjs`: feedback HTTP autenticado y relectura.
- `scripts/rocky/start-local-validation.ps1`: arranque local aislado, sin migraciones.
- `.env.development.local`: flags no secretos, ignorado por Git.
- Este informe y `docs/rocky/activation-real-20260926/`: resultados y logs.

El árbol ya contenía cambios de las tareas anteriores; no se atribuyen a esta activación. Los modelos/volumen/contenedor se almacenan en Docker, fuera del repositorio.

## 24. Tests

`node --import tsx --test src/lib/rocky/*.test.ts`: **177/177**, cero fallos, cero omitidos. Las 175 anteriores siguen pasando. [Log](activation-real-20260926/tests.log).

Se verificó además la evidencia real con aserciones: nombres de modelos, respuesta mínima, dimensión, tokens del planificador, hits vectoriales del producto correcto, memoria reconstruida, aislamiento, handoff persistido, feedback HTTP, código inexistente y éxito de herramientas.

## 25. TypeScript

`npx tsc --noEmit`: correcto, sin diagnósticos. [Log](activation-real-20260926/typescript.log).

## 26. Prisma

`npx prisma validate`: correcto. [Log](activation-real-20260926/prisma.log). Conectividad y operaciones reales comprobadas por separado; validate por sí solo no demuestra conectividad.

## 27. Lint

Ámbito de Roky, rutas/páginas/componentes modificados previamente y scripts de validación: cero errores. Una advertencia preexistente por `<img>` en `MessageSimulator.tsx:380`. Scripts nuevos y cambios puntuales: sin advertencias. [Log](activation-real-20260926/lint.log), [nuevos](activation-real-20260926/new-lint.log), [HTTP](activation-real-20260926/http-lint.log).

## 28. Build

`npm run build`: completado, salida 0, rutas de Roky incluidas. [Log](activation-real-20260926/build.log). Advertencias: configuración Prisma en package.json obsoleta y tracing amplio de Turbopack desde `next.config.ts`. No impidieron el build. Este build usa `.env`, no el archivo exclusivo de desarrollo.

## 29. Riesgos y límites pendientes

- La base habitual sigue sin esquema de Roky: usar el lanzador aislado. No se hicieron migraciones sobre datos del proyecto.
- Primera carga del LLM superó el timeout normal de 30 s; primera carga de embeddings superó 10 s. Las llamadas posteriores del proveedor sí respetaron ambos límites. Tras reinicio/caché fría pueden activarse fallbacks; no se promete latencia constante.
- PostgreSQL de prueba contiene copias puntuales, no sincronización continua; conocimiento técnico disponible es limitado. No hay evidencia de equivalencia entre los productos comparados.
- Turbopack dev presenta el 404 observado; Webpack sirve correctamente la ruta. No se investigó/refactorizó el framework.
- Evidencia y conversaciones de prueba se conservaron. Repetir el script añade registros y documentos; no debe ejecutarse como stress test.
- No se validaron producción, canales externos, pagos, creación de pedidos reales, rendimiento con 2–5 LLM simultáneos ni despliegue.
- No se modificaron secretos, n8n, schema.prisma ni producción. Sin deploy, push o merge.

## 30. Estado final

**ROKY REAL VALIDADO** en el entorno local controlado: ambos modelos reales, PostgreSQL/pgvector, conversación persistente, memoria reconstruida, RAG vectorial, herramientas, feedback con relectura HTTP, handoff e aislamiento de tres conversaciones. Servidor de revisión: http://127.0.0.1:3101. Las limitaciones operativas anteriores siguen explícitas.
