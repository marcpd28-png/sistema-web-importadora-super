# Catálogos con varios tipos de producto

Corrección del 17 de septiembre de 2026 para la consulta: «pero tambien busco el catalogo mayorista de sus productos como cargadores y fuentes de poder».

El buscador conservaba «pero», «también» y «como» como filtros y exigía que cada producto coincidiera con ambos tipos a la vez. Además, los prefijos ERP `SQ` y `COMBO` impedían reconocer algunos cargadores Super.

La selección ahora reconoce listas de tipos/categorías separadas por conjunciones, comas o saltos de línea. Resuelve cada parte y une los resultados sin duplicar productos. Mantiene las categorías compuestas, los filtros de modelo y las marcas; una marca compartida restringe la lista y las marcas explícitas de cada parte conservan su alcance.

Si una parte no coincide, el bot envía el PDF con los productos encontrados y pide modelo o foto para la parte restante. El título del PDF menciona solamente los grupos encontrados. No presenta un resultado parcial como ausencia de todos los productos.

«Super Importaciones» e «Importaciones Super» reconocen la marca `SUPER` del registro. Una descripción como «SUPER CARGA» de un cargador Honor no lo convierte en marca Super. Los cargadores bajo prefijos de importación o presentación se incluyen; un cable para cargador o una gata hidráulica con cargador no se consideran cargadores independientes.

El filtro de publicación (`isVisible`) sigue aplicado antes de crear el índice. Se conserva el saludo horario y la espera de 12 segundos del simulador BC. No se activan canales de WhatsApp real ni se cambian precios o inventario.

Validación: pruebas de selección y regresión del catálogo, mensajes agrupados, saludo, salida del simulador y aislamiento de flujos. El PDF conserva su diseño vigente; este cambio corrige los productos seleccionados y la explicación de coincidencias parciales.
