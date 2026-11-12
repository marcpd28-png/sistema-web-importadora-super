# Inventario de calidad del catálogo local

Fecha de lectura: 2026-11-06. Fuente: base local restaurada. Esta auditoría fue solo de lectura.

## Criterios

- **Elegible**: producto visible, con stock mayor a cero y precio mayor a cero.
- **Con imagen**: tiene al menos una URL no vacía en imagen principal, imagen fuente, imagen local o media asociada.
- **Sin descripción útil**: `description` nula, vacía o compuesta solo por espacios. No evalúa calidad semántica del texto.
- Las marcas se normalizaron para el reporte con `trim`, colapso de espacios y mayúsculas. La marca ausente se muestra como **(SIN MARCA)**.

## Resumen

| Métrica | Productos | % del total |
| --- | ---: | ---: |
| Total | 7,464 | 100.00% |
| Visibles | 2,032 | 27.22% |
| Con stock | 2,073 | 27.77% |
| Elegibles | 2,032 | 27.22% |
| Con imagen | 7,464 | 100.00% |
| Sin marca | 7,052 | 94.48% |
| Sin descripción útil | 0 | 0.00% |
| Sin imagen | 0 | 0.00% |
| Sin categoría | 1 | 0.01% |
| Sin precio (> 0) | 0 | 0.00% |
| Sin stock | 5,391 | 72.23% |

La visibilidad coincide con elegibilidad en esta copia: no hay productos visibles que fallen stock o precio. El CSV de incompletos no se adjunta: 7,059 filas tendrían al menos una condición de incompletitud, casi todas únicamente por marca ausente; un archivo de ese volumen no aporta más que esta medición agregada hasta definir una política de enriquecimiento de marca.

## Categorías

| Categoría | Total | Elegibles |
| --- | ---: | ---: |
| ACCESORIOS DE CUIDADO PERSONAL | 167 | 32 |
| ACCESORIOS PARA AUTO | 301 | 93 |
| ACCESORIOS PARA CELULARES | 784 | 240 |
| ARTICULOS ESCOLARES | 27 | 6 |
| ARTICULOS PARA EL HOGAR | 437 | 78 |
| ARTICULOS PARA EL HOGAR E ILUMINACION | 150 | 62 |
| AUDIO Y SONIDO | 7 | 3 |
| AURICULARES | 937 | 316 |
| BATERIAS | 121 | 55 |
| Billetera | 7 | 1 |
| CAMARA DE SEGURIDAD | 194 | 59 |
| CELULARES | 2 | 1 |
| CUIDADO PERSONAL | 15 | 6 |
| Descartables | 0 | 0 |
| DISPOSITIVOS DE ALMACENAMIENTO | 82 | 19 |
| DISPOSITIVOS PORTATILES | 314 | 56 |
| DRONES | 2 | 2 |
| ENTRETENIMIENTO Y MULTIMEDIA | 344 | 92 |
| EQUIPAJE/BOLSOS | 23 | 5 |
| Ferretería ligera | 0 | 0 |
| Hogar y Cocina | 0 | 0 |
| ILUMINACION | 41 | 14 |
| Iluminación LED | 0 | 0 |
| Juguetería | 0 | 0 |
| JUGUETES SEXUALES | 37 | 10 |
| JUGUETES/NIÑOS | 94 | 9 |
| JUGUETES/UTILES ESCOLARES | 348 | 3 |
| LAPTOP | 2 | 2 |
| MAQUINA DE CUIDADO PERSONAL | 24 | 5 |
| NOVEDADES | 450 | 185 |
| PARLANTE INTELIGENTES | 2 | 1 |
| PARLANTES | 1,441 | 352 |
| PERIFERICOS | 324 | 102 |
| PROYECTORES | 6 | 6 |
| SMART WATCH Y SUS ACCESORIOS | 77 | 34 |
| SMART WATCH Y SUS COMPLEMENTOS | 137 | 40 |
| Tecnología | 0 | 0 |
| TV BOX | 1 | 1 |
| UTENCILLOS DE COCINA Y ACCESORIOS DE USO DOMESTICO | 565 | 141 |
| (sin categoría) | 1 | 1 |

## Marcas normalizadas

| Marca | Total | Elegibles |
| --- | ---: | ---: |
| (SIN MARCA) | 7,052 | 1,627 |
| JBL | 64 | 63 |
| XIAOMI | 26 | 26 |
| SONY | 24 | 24 |
| QCY | 19 | 18 |
| KAPERH | 16 | 16 |
| ZEALOT | 16 | 16 |
| AIWA | 13 | 13 |
| REDMI | 13 | 13 |
| LIDIMI | 12 | 12 |
| UGREEN | 12 | 12 |
| EZVIZ | 10 | 10 |
| BOSSNEY | 9 | 9 |
| SOUNDPEATS | 9 | 9 |
| BLACKVIEW | 8 | 8 |
| SAMSUNG | 8 | 8 |
| SOUNDCORE | 8 | 8 |
| HONOR | 7 | 7 |
| DJI | 6 | 6 |
| APPLE | 5 | 5 |
| BASEUS | 5 | 5 |
| DAHUA | 5 | 5 |
| ECOFLOW | 5 | 5 |
| ROMAX | 5 | 5 |
| SUDIO | 5 | 5 |
| BARETONE | 4 | 4 |
| HAVIT | 4 | 4 |
| SONIVOX | 4 | 4 |
| STEREN | 4 | 4 |
| TRIBIT | 4 | 4 |
| 1HORA | 3 | 3 |
| BLESS | 3 | 2 |
| BOMA | 3 | 3 |
| CUDY | 3 | 3 |
| DCOLOR | 3 | 3 |
| HALION | 3 | 3 |
| HIFUTURE | 3 | 3 |
| LENOVO | 3 | 3 |
| LOGITECH | 3 | 3 |
| PHILIPS | 3 | 3 |
| RAF | 3 | 3 |
| TOMATE | 3 | 3 |
| TRONSMART | 3 | 3 |
| ENKORE | 2 | 2 |
| HARMAN KARDON | 2 | 2 |
| HAYLOU | 2 | 2 |
| HOPESTAR | 2 | 2 |
| KZ | 2 | 2 |
| LELONG | 2 | 2 |
| LINKMAX | 2 | 2 |
| MAONO | 2 | 2 |
| OKAI | 2 | 2 |
| REALME | 2 | 2 |
| REDD | 2 | 2 |
| ROZIA | 2 | 2 |
| SKULLCANDY | 2 | 2 |
| STARLUX | 2 | 2 |
| SUPER | 2 | 0 |
| BRODU | 1 | 0 |
| FIFINE | 1 | 1 |
| GENÉRICO | 1 | 0 |
| HIKSEMI | 1 | 1 |
| HOCHI | 1 | 1 |
| IMILAB | 1 | 1 |
| KEMEI | 1 | 1 |
| KINGSTON | 1 | 1 |
| LANTUN | 1 | 1 |
| MICRONICS | 1 | 1 |
| NAVEE | 1 | 1 |
| REDRAGON | 1 | 1 |
| S/M | 1 | 1 |

## Inconsistencias y acciones sugeridas

- Solo se detectó una variante de marca tras normalizar: `SUPER` / `Super` (2 productos, ninguno elegible). No se detectaron variantes de categoría que difieran solo en espacios o mayúsculas.
- La brecha prioritaria es la marca: falta en 7,052 productos, incluidos 1,627 elegibles. Conviene establecer una cola de enriquecimiento, empezando por los productos visibles de mayor tráfico/stock.
- Hay 39 categorías registradas sin productos. Revisar si son categorías vacías intencionales antes de exponerlas como filtros.
- No se observan faltantes de imagen ni de descripción según los criterios mecánicos; la siguiente auditoría debería medir descripciones duplicadas o demasiado cortas, no solo presencia.
