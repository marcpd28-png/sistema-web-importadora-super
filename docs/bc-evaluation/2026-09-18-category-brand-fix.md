# Corrección de búsquedas por categoría y marca — 18 de septiembre de 2026

Las frases «Estoy buscando productos de ACCESORIOS DE CUIDADO PERSONAL. ¿Qué tienen disponibles?» y «Busco AURICULARES de la marca KZ. ¿Qué modelos tienen disponibles?» llegaban al simulador, pero no recuperaban productos existentes.

## Cambio

- La agenda conserva las palabras de categorías completas durante las consultas de exploración. Ya no elimina «accesorios» antes de consultar el índice.
- El índice ignora expresiones de consulta como «qué», «cuáles» y «tienes», manteniendo modelo, color, presupuesto y términos desconocidos como restricciones.
- La marca explícita del producto tiene prioridad; si falta, se usa el atributo `Marca` de sus especificaciones antes de inferirla del nombre.
- `SUPER`, `Importaciones Super` y `SUPER / Importaciones Super` representan la misma marca propia. La palabra SUPER dentro de un modelo de otra marca no la convierte en marca propia.
- Una marca compuesta declarada, como `Xiaomi / Redmi`, se puede consultar por cualquiera de sus nombres.
- Un punto de cierre de frase no impide encontrar `N2221`. Cuando existe un SKU terminado en punto, como `BT454.`, se mantiene su identidad independiente de `BT454`.
- «Baterías» excluye cargadores de baterías; «cargadores de batería» conserva el cargador como tipo principal. Las listas explícitas de varios tipos siguen resolviéndose por separado.
- «Proyectores» excluye pantallas y ecranes para proyección; estos accesorios conservan su búsqueda propia.

No se modifican datos de inventario, precios, stock ni fotografías. La búsqueda conserva la regla de disponibilidad incorporada en `5e5b9b7`: las listas y catálogos requieren producto visible, stock y foto; una consulta puntual puede informar falta de stock o de foto.

## Validación reproducible

- `55` pruebas automatizadas de agenda, catálogo, restricciones, disponibilidad, PDF y persistencia del simulador aprobadas.
- ESLint en los archivos modificados y TypeScript sin errores.
- Compilaciones de producción aprobadas en versiones separadas del VPS.
- Recorrido de solo lectura de los `1,687` códigos visibles con stock en la instantánea de validación: todos recuperan su identidad exacta.
- Las `315` consultas guardadas recuperan productos esperados en la prueba del índice con la agenda: `10` códigos, `32` categorías, `76` marcas y `197` combinaciones categoría–marca. Esto mide recuperación del índice, antes de aplicar la disponibilidad de fotografías y el límite de opciones mostradas en la respuesta.

`scripts/bc-evaluation/catalog-coverage.ts` reproduce esa comprobación. `replay.cjs --corpus=... --execute-simulator` recorre el flujo administrativo completo. `catalog-score.cjs` exige evidencia persistida del producto y códigos mostrados en la agenda; repetir el código del cliente en un mensaje de rechazo no cuenta como resultado.

La medición anterior de diez códigos se corrigió al aplicar ese criterio: eran `9/10` resultados evidenciados, porque un rechazo repetía el código consultado. El cero inicial de categorías, marcas y combinaciones se conserva.

## Alcance

El barrido de flujo completo se ejecutó con `683eae2`: 315 respuestas, cero errores de transporte, cero respuestas tardías o duplicadas y 315 contactos temporales eliminados (cero restantes).

| Grupo | Consultas | Coincidencia con la instantánea | Falta de foto | Diferencia de clasificación |
| --- | ---: | ---: | ---: | ---: |
| Código | 10 | 9 | 1 | 0 |
| Categoría | 32 | 31 | 0 | 1 |
| Marca | 76 | 76 | 0 | 0 |
| Categoría y marca | 197 | 196 | 1 | 0 |

Los avisos por falta de foto correspondieron a L350 y accesorios para auto EZVIZ. La consulta de proyectores mostró modelos almacenados en «ENTRETENIMIENTO Y MULTIMEDIA», fuera de la lista esperada del evaluador. La revisión de los productos adicionales también encontró dos inclusiones incorrectas: N2320 (cargador de baterías) al buscar baterías y O881 (ecran) al buscar proyectores. Ambas se corrigieron y se agregaron pruebas de regresión; no se presentan los 315 casos como una tasa de precisión universal.

La versión final `6ce69c2` quedó activa en el VPS y se verificó con ocho consultas posteriores al despliegue. Pasaron las comprobaciones de baterías, cargadores de batería, proyectores, auriculares KZ, Redmi y tres PDF. El evaluador de la instantánea mantiene dos diferencias (proyectores y Redmi); se contrastaron sus códigos con el nombre, categoría, visibilidad y stock de los productos reales, sin modificar la referencia inicial para forzar un resultado favorable. O881 ya no aparece entre los proyectores y N2320 aparece al pedir cargadores de batería, no al pedir baterías.

Los PDF de KZ (3 productos), BARETONE (4) y BOMA (1) respondieron HTTP 200 con cabecera PDF válida. Los ocho contactos de la verificación final se eliminaron, sin restos. La web y n8n respondieron HTTP 200, y el endpoint interno mantuvo HTTP 401 sin credenciales. [Evidencia de la verificación final](2026-09-18-category-brand-final.json).

El corpus usa frases generadas sobre el inventario real. No representa todas las formas de escribir de los clientes ni demuestra precisión universal. La etiqueta administrativa de una categoría tampoco agota todos sus tipos: hay proyectores y drones guardados en «ENTRETENIMIENTO Y MULTIMEDIA» que son respuestas válidas a sus respectivos tipos de producto. Las diferencias con la instantánea deben revisarse antes de contarlas como errores.

Al ampliar la ejecución a `shop-assistant.test.ts` aparecieron cuatro fallos del asistente de la tienda. Se reprodujeron sin esta corrección en el commit anterior `5e5b9b7`; pertenecen al seguimiento de contexto, productos similares y una búsqueda por Bluetooth. No se incluyen en las 55 pruebas aprobadas de BC.
