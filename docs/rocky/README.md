# ROCKY — implementación y operación

ROCKY se incorpora como una capa de planificación y consulta. BC conserva contactos, conversación, agenda comercial, carrito/pedidos, recepción y entrega. El LLM no recibe shell, SQL ni credenciales y no redacta libremente afirmaciones comerciales: selecciona una intención/búsqueda estructurada y las respuestas se construyen con evidencia actual.

## Arquitectura encontrada

Next.js 16.2.4, Prisma 6, PostgreSQL 16. El Centro de Mensajes usa `ChatContact`, `Conversation`, `ChatMessage`, `ConversationSalesState`, `ConversationRequestAgenda` y `CustomerConversationMemory`. `botEnabled`, `assignedUserId` y `status` son la autoridad sobre el control humano. El motor comercial, precios por cantidad, búsqueda y memoria ya tenían pruebas.

El simulador administrativo llamaba al webhook `bc-simulator` de n8n; entrada, motor y catálogo persistían sus respuestas mediante las API de BC. Existe además un worker de atención real, con alcance/configuración explícitos y una cola durable `bc_queued`. No debe confundirse la auditoría de flujos del 17/09 con el estado del piloto real observado el 21/09.

Ollama 0.24.0 ya estaba instalado con Qwen 2.5 7B. Se reutilizó ese servicio. La auditoría confirmó su escucha en localhost y encontró swap casi lleno; se conservaron todos los modelos y workflows existentes.

## Arquitectura de esta entrega

```mermaid
flowchart TD
  UI[Centro de Mensajes / Simulador] --> SELECT{Motor elegido}
  SELECT -->|BC| N8N[n8n: simulador existente]
  N8N --> BC[Backend conversacional actual :4000 / router :4001]
  SELECT -->|ROCKY| API[Instancia ROCKY :4005 localhost]
  API --> ORCH[RockyAIOrchestrator]
  ORCH --> PLAN[LLMProvider / Ollama localhost:11434]
  ORCH --> SK[19 Skills versionadas]
  ORCH --> TOOLS[ToolExecutor: allowlist + Zod]
  TOOLS --> CATALOG[Búsqueda y catálogo existentes / ERP vía PostgreSQL]
  TOOLS --> RAG[PostgreSQL FTS + pgvector / embeddings 0.6B]
  ORCH --> MEMORY[Memoria selectiva / preferencias explícitas / memoria BC]
  ORCH --> TRACE[RockyRun / AI_FEEDBACK / analytics / sinónimos revisados]
  ORCH --> GUARD[Validación de inventario, turno y control humano]
  GUARD --> SIM[Respuesta guardada solamente en simulador]
  GUARD -. AUTO opt-in, desactivado en VPS .-> OUTBOX[Cola BC existente]
  OUTBOX --> BC
  BC --> OUT[n8n / ManyChat / WhatsApp]
```

Release activo: `/home/IMPORTADORA-releases/rocky-20260921-image-names`, proceso PM2 `importadora-rocky-image-names`, puerto localhost 4005. Las rutas HTTP ROCKY usan esta versión, incluido el simulador asíncrono y la API de auditoría. La página `/admin/atencion` usa el release `rocky-20260921-hidden-audit`, proceso `importadora-rocky-hidden-audit`, puerto 4006, que separa los incongruentes ocultos. El fallback estático sirve la unión de recursos desde `rocky-20260921-r2/.next/static`. Los releases anteriores se conservan para reversión. Detalles: [reconocimiento por nombre](image-name-deployment.md) y [respuesta asíncrona del simulador](simulator-background-fix.md).

Lectura ampliada de códigos en fotos: [comportamiento, pruebas y límites](lectura-codigos-fotos.md).

La instancia separada sirve las rutas nuevas, el simulador y `/api/internal/chat/requests` de BC con el detector de horarios corregido. La tienda permanece en su proceso original para conservar las actualizaciones de otras tareas. No se activa otro scheduler ERP ni otro worker de mensajería.

## Uso del simulador

Abrir `/admin/mensajes/simulador`, elegir **ROCKY · pruebas IA** y escribir. Cambiar de motor crea otra sesión: el flujo n8n de BC no compite por la misma conversación. Se muestran intención, skill, modelo utilizado, confianza, productos, herramientas y fuentes. «Corregir sugerencia» guarda la corrección vinculada a la respuesta original; no envía un mensaje a clientes.

Una derivación humana apaga `botEnabled`. El simulador ROCKY no lo reactiva automáticamente en el siguiente mensaje; iniciar una sesión nueva para repetir una prueba. Si se utiliza el modo manual, la sugerencia permanece disponible en el panel de diagnóstico y no se publica como respuesta del bot.

## Modelo y recursos

Tags oficiales comprobados: [Qwen 3.5 9B](https://ollama.com/library/qwen3.5:9b), [Qwen 3.5 4B](https://ollama.com/library/qwen3.5:4b), [Qwen3 Embedding 0.6B](https://ollama.com/library/qwen3-embedding:0.6b). La familia anuncia visión, tools y thinking; [la ficha de Qwen](https://huggingface.co/Qwen/Qwen3.5-9B) describe soporte multilingüe. El español se verificó además mediante inferencia real con la variante desplegada; no se afirma haber ejecutado 9B.

Se descargaron 9B, 4B, 2B y embeddings. **El modelo operativo temporal es `qwen3.5:2b`**. 9B queda descargado, sin cargar: sus pesos de 6,6 GB más runtime/contexto y reserva de producción exceden el presupuesto seguro. 4B superó 100 s con contexto 8K y llegó a unos 5,9 GB. 2B completó el benchmark breve en 6,42 s; embeddings en 1,84 s. Estos tiempos no son una evaluación de calidad completa ni el tiempo de una conversación larga.

Configuración aplicada: localhost, paralelismo 1, máximo 1 modelo cargado, cola 4, contexto 8192, CPU máximo 200%, `MemoryHigh=5G`, `MemoryMax=6G`, `MemorySwapMax=0`, prioridad reducida. El chat descarga el modelo tras responder; embeddings conservan como máximo 10 s para permitir lotes. No se abrió 11434. Los límites evitan que el servicio consuma sin control; una petición puede fallar dentro del límite, por eso existe fallback y derivación.

Evidencia: `vps-baseline.txt`, `vps-benchmark.json`, `vps-benchmark-2b.json`. La memoria pico registrada para el servicio durante la prueba 2B/embeddings fue 4.767.555.584 bytes (~4,44 GiB). La cuota de CPU es un techo, no una medición de consumo constante. No se utilizó swap adicional como presupuesto de inferencia.

## Persistencia y APIs

Migración aditiva `20260921100000_rocky_layer`: `RockySession`, `RockyCustomerPreferences`, `RockyRun`, `RockyFeedback`, `RockySynonym`, `knowledge_documents`, `knowledge_chunks`. `knowledge_embeddings` se aprovisiona separadamente mediante `scripts/rocky/enable-pgvector.sql`; requiere la extensión instalada. Se añaden relaciones a Conversation/ChatContact, sin quitar campos. La migración es transaccional, con espera máxima de bloqueo de 3 s.

Se hizo backup PostgreSQL antes de aplicar la migración al VPS. No se ejecutó reset ni db push en producción. La prueba aislada local sí utiliza un contenedor nuevo y una base `rocky_test` en localhost:5437.

| API | Función |
|---|---|
| POST `/api/internal/rocky/chat` | Analiza un mensaje entrante existente; identidad se resuelve desde la conversación, no desde teléfono enviado por el llamador |
| GET `/api/internal/rocky/health` | Modelo, flags, pgvector y corpus |
| POST `/api/internal/rocky/embed` | Embeddings dedicados, entrada acotada |
| POST `/api/internal/rocky/rag/search` | Exact, lexical, vector, hybrid y filtros |
| POST/DELETE `/api/internal/rocky/rag/index` | Ingesta incremental o eliminación de una fuente |
| GET/POST `/api/admin/rocky` | Trazas, analytics, modos, preferencias, feedback y revisión de sinónimos |

Las API internas reutilizan `x-internal-api-key` / `N8N_INTERNAL_API_KEY`, con comparación de tiempo constante, rate limit por proceso/ruta, límites reales del body y errores sin secretos. Las administrativas reutilizan `requireAdmin`. El acceso a conversaciones reales y documentos internos requiere la confianza de esa clave de backend; no debe distribuirse a clientes.

## Tools y Skills

Implementadas con datos reales: `searchProducts`, `getProduct`/`getProductByCode`, `getStock`, `getPrice`, `compareProducts`, `searchKnowledge` y la decisión `handoffToHuman` aplicada por el servicio. Se reutilizan `searchInternalProducts` y el catálogo comercial existente. Los resultados de RAG solo identifican candidatos: precio y stock se vuelven a leer del backend.

`getPromotions` responde explícitamente que no hay un adaptador de promociones verificado; no inventa ofertas. `checkCompatibility` recupera datos pero requiere revisión humana antes de afirmar compatibilidad. Las interfaces de pedidos, carrito, checkout, categorías, cliente, envío de producto/imagen/catálogo están enumeradas y permanecen cerradas cuando no hay un adaptador autorizado. La compra real sigue en BC; ROCKY no crea pedidos por inferencia.

Las 19 Skills están en `src/lib/rocky/skills/catalog.json`. Cada una declara descripción, triggers, objetivo, información requerida, tools, reglas, restricciones y finalización. Se modifican mediante código versionado/despliegue, sin entrenamiento ni autoedición. Cross-selling, upselling y closing están preparados como políticas; no se habilitan recomendaciones de compatibilidad sin evidencia ni creación autónoma de checkout.

`WorkflowRegistry` valida acciones registradas y payloads. `createN8nWorkflowRegistry` admite únicamente un webhook de consulta dedicado `rocky-*` configurado por el operador. La allowlist no habilita por defecto ningún workflow existente ni acceso a la API de administración de n8n. No se modificó ningún workflow.

## RAG y memoria

Limpieza, chunking con solape, hash incremental, versión, aprobación, dimensiones verificadas, filtros por producto/marca/categoría/tipo y eliminación en cascada. FTS español con índice GIN y combinación por reciprocal rank fusion. Códigos exactos reciben prioridad. La fase inicial usa búsqueda vectorial exacta, sin construir un índice ANN intensivo en RAM en el VPS compartido.

El inventario visible al auditar fue de **1.679 productos**, no 6.000 visibles. La ingesta excluye columnas de precio/stock. Las políticas, garantías, manuales y FAQ necesitan contenido autorizado: no se rellenaron con políticas inventadas. Documentos `INTERNAL` no aparecen en respuestas de clientes. Productos ocultos se filtran también durante recuperación. Cambiar el modelo o dimensiones de embeddings exige reindexación.

`RockySession.memory` conserva intención, referencias, resultados mostrados, presupuesto, cantidad, necesidad, preguntas y etapa. Solo se envían cuatro mensajes recientes truncados, con eliminación de patrones comunes de credenciales. Se recupera memoria comercial BC y hay preferencias explícitas revisadas por un administrador. Se comprueban revisión, último mensaje, inventario y control humano antes de persistir; los reintentos del mismo mensaje usan una clave única.

MANUAL no publica; COPILOT sugiere; AUTO necesita flag global, modo por conversación, alcance BC y conversación automática sin asesor asignado. La cola AUTO reutiliza el worker BC. **AUTO está desactivado en esta instalación**; la nueva instancia no sustituye al worker original.

## Aprendizaje controlado y observabilidad

Cada ejecución guarda intención, skill, evidencia de confianza, herramientas y resultados normalizados, fuentes, modelo, tokens si disponibles, latencia, motivo de handoff y acción final. El log operativo contiene IDs y métricas, no conversaciones completas ni secretos.

`RockyFeedback` vincula respuesta humana/outcome/revisor con el `RockyRun` que contiene la respuesta original y contexto. Cola `AI_FEEDBACK`. Analytics agregan últimas 1.000 ejecuciones: intenciones, productos, comparaciones, búsquedas sin resultado, vocabulario, frases, objeciones, recomendaciones y derivaciones. Los outcomes son feedback explícito; no se afirma atribución causal de conversiones.

Los sinónimos aprendidos requieren frecuencia de al menos 3 y aprobación humana; solo los `APPROVED` expanden búsquedas. Separadamente, `vocabulary.ts` contiene el pequeño diccionario inicial suministrado en los requisitos del usuario («booster», «arranca carro», «aparato para prender el carro» → arrancador); es configuración revisada, no aprendizaje automático ni frecuencias inventadas. No hay fine-tuning online, edición de Skills por el modelo ni aprendizaje global automático de una ocurrencia.

## Pruebas y mantenimiento

```powershell
node --import tsx --test src/lib/rocky/rocky.test.ts
$env:DATABASE_URL='postgresql://postgres:rocky-local-test@127.0.0.1:5437/rocky_test?schema=public'
node --import tsx scripts/rocky/integration.ts
```

La integración verifica exact/lexical/vector/hybrid, filtros, indexado incremental, ocultos, persistencia del simulador, idempotencia, modo manual y feedback. Usa vectores controlados para comprobar SQL/ranking: se distingue de las verificaciones reales de Ollama en el VPS. `scripts/rocky/smoke.mjs --execute` prueba la API real del simulador con un contacto `SIMULATOR:` nuevo y una sesión administrativa efímera; nunca imprime cookies.

Para actualizar el catálogo, ejecutar `node --env-file=.env --import tsx scripts/rocky/index-products.ts --limit=10000`; añadir `--vectors` para embeddings. También admite `--query=ARRANCADOR`. No se programa una tarea recurrente sin decidir primero el intervalo y la ventana operativa. La ingesta es incremental, pero los cambios ERP posteriores necesitan una nueva ejecución.

## Límites que siguen requiriendo trabajo

- 9B no se ejecutó por presupuesto de RAM; la variante 2B requiere evaluación comercial con vendedores antes de AUTO.
- Falta cargar y aprobar el corpus real de garantías, pagos, delivery y devoluciones.
- Pedido/identidad, promoción, compatibilidad y acciones de compra requieren adaptadores específicos y aprobación comercial; se derivan al asesor.
- Voz usa una interfaz futura STT. Imágenes se reducen antes de enviarse al modelo; URLs externas, TikTok, Facebook, PDF y video no se descargan ni interpretan automáticamente.
- La allowlist de n8n está preparada, sin nuevos workflows publicados. BC sigue ejecutando los existentes.
- Validación visual y mediciones de calidad de toda la conversación no se sustituyen por tests unitarios. Los scores de confianza son heurísticos basados en evidencia, no probabilidades calibradas.
- El rate limit en memoria es por proceso. Un despliegue con varias máquinas necesitará un limitador compartido; Ollama ya limita su cola a nivel de servicio.

## Reversión

Apagar ROCKY mediante `ROCKY_SIMULATOR_ENABLED=false` y reiniciar solo `importadora-rocky-web`, o retirar las rutas Nginx de ROCKY y recargar Nginx tras `nginx -t`. La tienda/BC originales permanecen en :4000/:4001. No revertir borrando tablas: conservar trazas y feedback. Restaurar la configuración previa de Ollama únicamente si se desea retirar sus límites, evaluando antes el riesgo de memoria.

Actualización de espera y búsqueda directa: [correccion-espera.md](correccion-espera.md).

Catálogos PDF, enlaces filtrados y reconocimiento de códigos en fotos: [catalogos-fotos-tono.md](catalogos-fotos-tono.md).

Barrido completo de fotografías, revisión de códigos y reconocimiento por nombre: [auditoria-imagenes.md](auditoria-imagenes.md).

## Actualización del 24/09/2026

El simulador, `/api/admin/conversations/simulate`, `/api/admin/rocky` y `/api/internal/rocky/` usan ahora `rocky-20260924-sales`, PM2 `importadora-rocky-sales`, puerto 4008. Consultar [flujo breve y validación de despliegue](flujo-ventas-breve.md). Las demás rutas conservan los procesos descritos arriba.

Actualización posterior: esas cuatro rutas usan `rocky2-conversations-20260924`, PM2 `importadora-rocky2-conversations`, puerto 4014. Incluye las mejoras de conversación y validación pública de 12 turnos; consultar [pruebas y despliegue de conversaciones](pruebas-conversacion.md). La versión 4008 se conserva para reversión.

Actualización del 25/09: las rutas de Rocky y `/admin/rocky/aprendizaje` usan `rocky2-learning-20260925`, PM2 `importadora-rocky2-learning`, puerto 4015. Incluye correcciones derivadas de la auditoría y revisión de ejemplos por un administrador. Ver [aprendizaje revisado y despliegue](aprendizaje-revisado.md). La versión 4014 sigue disponible; el proceso 4008 fue detenido por no recibir tráfico.

Actualización posterior del 25/09: las cinco rutas usan `rocky2-precision-20260925`, PM2 `importadora-rocky2-precision`, puerto 4016. Incorpora instrucciones reforzadas, validación del plan y ejemplos de intención activados expresamente por administrador. Ver [precisión y evaluación](precision-respuestas.md). Se conserva 4015 para reversión.

Nueva actualización del 25/09: las cinco rutas de Rocky usan `rocky2-communication-20260925`, PM2 `importadora-rocky2-communication`, puerto 4017. Incluye las correcciones de referencias ambiguas, filtros de cortesía, tipos de producto y preguntas múltiples descritas en [comunicación con el cliente](comunicacion-cliente.md). La versión 4016 permanece disponible para reversión.
