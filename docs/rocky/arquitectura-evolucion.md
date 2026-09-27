# Evolución conservadora de ROKY

## Auditoría previa y diseño mínimo

| Módulo | Estado original | Decisión |
|---|---|---|
| Proveedor | EXISTE: LLMProvider plan/embed/health, Ollama local, exclusión mutua | Reutilizar; centralizar configuración de ambos modelos |
| Prompt e intenciones | EXISTE PARCIALMENTE: prompt único en planning, reglas tipadas y skills JSON | Extraer prompt, conservar nombres de API y añadir clasificación comercial |
| RAG | EXISTE: PostgreSQL, pgvector 1024, español léxico + coseno + RRF | Conservar; fallback léxico ante fallo vectorial y filtro por producto |
| Indexación | EXISTE: aprobación, hash, fragmentos 1400/solapamiento160, metadatos | Conservar; parametrizar modelo sin mezclar espacios vectoriales |
| Memoria | EXISTE PARCIALMENTE: RockySession JSON, CustomerConversationMemory, preferencias y salesState | Resumen acotado y estado comercial validados dentro del JSON actual |
| Context builder | NO EXISTE como módulo: construcción inline del mensaje | Centralizar presupuesto y separación datos/instrucciones |
| Tools | EXISTE PARCIALMENTE: schemas, allowlists y ejecutor; nombres reservados sin adaptadores | Registro descriptivo con riesgo, ejecución validada y timeout |
| Confianza/autonomía | EXISTE PARCIALMENTE: puntuación fija, MANUAL/COPILOT/AUTO, switches | Señales y umbrales centrales; gate adicional antes del outbox |
| Feedback | EXISTE PARCIALMENTE: RockyFeedback y ejemplos aprobados para intención | Eventos tipados y aprobación explícita de dataset sin promover respuestas a RAG |
| Observabilidad | EXISTE PARCIALMENTE: RockyRun JSON y analytics | Enriquecer datos estructurados y métricas sin mensajes/credenciales en consola |
| Media | EXISTE: OCR local, hash de imágenes, URLs propias, aclaración audio/video | Mantener; metadata acotada en contexto, sin nuevos descargadores |
| n8n/canales | EXISTE: API interna autenticada y registro explícito workflows | Conservar interfaces, no editar workflows ni enviar mensajes reales |

No se requiere modificar Prisma. Se reutilizan las entidades existentes. No se ejecutarán migraciones, indexaciones contra datos reales, despliegues, push ni merge. OLLAMA_MODEL sigue consumida por src/lib/ollama.ts; no debe eliminarse. Los nombres históricos PRICE_QUERY/STOCK_QUERY/etc. se conservan como contrato de integración.

RAG original: documentos aprobados, filtros por producto/marca/categoría/tipo, topK por defecto 5 (máximo 8), coseno mínimo 0.55, RRF k=60. Los hechos comerciales se renderizan desde tools; el LLM produce planes JSON, no texto libre de ventas. Los ejemplos revisados solo aportan intención. Esta separación se conserva.
