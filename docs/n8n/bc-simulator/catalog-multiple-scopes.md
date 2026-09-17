# Catálogos con varios tipos de producto

Corrección del 17 de septiembre de 2026 para la consulta: «pero tambien busco el catalogo mayorista de sus productos como cargadores y fuentes de poder».

El buscador conservaba «pero», «también» y «como» como filtros y exigía que cada producto coincidiera con ambos tipos a la vez. Además, los prefijos ERP `SQ` y `COMBO` impedían reconocer algunos cargadores Super.

La selección ahora reconoce listas de tipos/categorías separadas por conjunciones, comas o saltos de línea. Resuelve cada parte y une los resultados sin duplicar productos. Mantiene las categorías compuestas, los filtros de modelo y las marcas; una marca compartida restringe la lista y las marcas explícitas de cada parte conservan su alcance.

Si una parte no coincide, el bot envía el PDF con los productos encontrados y pide modelo o foto para la parte restante. El título del PDF menciona solamente los grupos encontrados. No presenta un resultado parcial como ausencia de todos los productos.

«Super Importaciones» e «Importaciones Super» reconocen la marca `SUPER` del registro. Una descripción como «SUPER CARGA» de un cargador Honor no lo convierte en marca Super. Los cargadores bajo prefijos de importación o presentación se incluyen; un cable para cargador o una gata hidráulica con cargador no se consideran cargadores independientes.

El filtro de publicación (`isVisible`) sigue aplicado antes de crear el índice. Se conserva el saludo horario y la espera de 12 segundos del simulador BC. No se activan canales de WhatsApp real ni se cambian precios o inventario.

Validación: pruebas de selección y regresión del catálogo, mensajes agrupados, saludo, salida del simulador y aislamiento de flujos. El PDF conserva su diseño vigente; este cambio corrige los productos seleccionados y la explicación de coincidencias parciales.

## Verificación en el VPS

Código desplegado: `504fbc44ac59aced9b14cefeeae82351d6df608c`. Compilación completa aprobada, TypeScript y ESLint sin errores, 39 pruebas relacionadas aprobadas durante la corrección.

- La frase exacta del cliente, después de una bienvenida, devuelve un PDF con 87 cargadores y pide modelo/foto únicamente para «fuentes de poder».
- La misma consulta dividida en tres mensajes devuelve el mismo catálogo e identifica los tres mensajes de origen.
- «Catálogo de cargadores de marca Super Importaciones» devuelve 28 productos. Se excluyen Honor Super Carga y Baseus Super SI del filtro de marca propia.
- Los 1.666 productos publicados son localizables por su SKU. Se incluyen los cargadores con prefijo SQ y aquellos con el nombre inglés Charger; se excluye la gata hidráulica con cargador.
- Ambos PDF se descargaron por HTTPS y se validaron como archivos PDF; ambos procesos PM2 quedaron online. Los contactos temporales del simulador fueron eliminados.

Evidencia, auditoría de selección y copia anterior: `/home/IMPORTADORA-backups/catalog-lists-00e8a0e/`.
