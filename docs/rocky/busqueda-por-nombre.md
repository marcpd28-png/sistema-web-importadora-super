# Búsqueda por nombres del catálogo

Rocky consulta el catálogo actual cuando recibe un texto con un nombre que el planificador todavía clasifica como UNKNOWN. Ya no necesita una palabra fija como «cargador» o un verbo como «busco» para reconocer un producto existente.

Los candidatos se contrastan con el índice comercial existente, conservando restricciones de tipo, nombre, marca y modelo. Solo una coincidencia respaldada por catálogo cambia la intención a PRODUCT_SEARCH; los resultados ajenos no se muestran como coincidencias. La búsqueda inicial se reutiliza y queda registrada en la traza como searchProducts, con evidencia CATALOG_MATCHED_INTENT. No se consulta nuevamente el mismo texto si ya se obtuvo el resultado durante ese turno.

Las intenciones conocidas (saludos, reclamos, asesor, seguimiento, etc.) mantienen sus rutas. Las imágenes conservan su reconocimiento específico. Sin coincidencias, el clasificador y su respuesta de aclaración siguen disponibles; no se afirma que cualquier texto o error ortográfico tenga una coincidencia garantizada. Ante fallo del catálogo, no se inventan productos.

Pruebas: 148 regresiones de Rocky y 32 regresiones del índice comercial aprobadas, TypeScript y ESLint. El script `scripts/rocky/verify-catalog-name-search.mjs --execute` comprueba nombres sin verbos ni códigos contra productos visibles y sesiones de simulación nuevas. No envía mensajes a clientes ni crea pedidos.


Los calificadores de catálogo sin un nuevo tipo de producto (por ejemplo, Samsung o espía), colores y medidas se agregan a la búsqueda anterior cuando hay productos mostrados y no existe un carrito activo. «cargador» → «Samsung» → «25 W» conserva las tres restricciones. Nombrar un nuevo tipo, como «tetera eléctrica», inicia otra búsqueda. Un refinamiento sin resultados no se amplía mediante RAG a productos ajenos.

Se conserva la tolerancia a errores del índice comercial, con normalización adicional para bluetoth, bluethoot y blutooth. Los resultados amplios de búsqueda interna se validan antes de decidir si hace falta buscar en el catálogo completo. No se modifican códigos ni modelos numéricos por similitud.

Límite: se validan turnos sucesivos dentro de la misma sesión. Este cambio no incorpora una espera para agrupar ráfagas simultáneas del proveedor ni garantiza reconocer todos los errores o fragmentos ambiguos.

Despliegue: `/home/IMPORTADORA-releases/rocky-catalog-20260926`, PM2 `importadora-rocky-catalog`, puerto 4026. Copia de reversión de Nginx en `/home/IMPORTADORA-backups/rocky-catalog-20260926`. La versión 4025 se conserva. Las verificaciones de simulación usan la base real, sin enviar mensajes a clientes.
