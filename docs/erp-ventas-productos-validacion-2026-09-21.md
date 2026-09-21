# Validación de ventas por producto en ERP — 21/09/2026

Inspección de solo lectura de la sesión del usuario mediante AnyDesk y el panel Network de Chrome. No se modificaron comprobantes, productos ni configuración de la integración. No se copiaron credenciales ni cookies.

## Fuente confirmada

- Pantalla: Reportes → Productos y servicios vendidos.
- URL: `https://original.negocioserp.com/reports/general-items`.
- Consulta observada: `GET https://original.negocioserp.com/reports/general-items/records`.
- Respuesta observada: HTTP 200, JSON con `data` y `meta`.
- Consulta de septiembre de 2026: `meta.current_page=1`, `per_page=20`, `total=38736`, `last_page=1937`, `from=1`, `to=20`.
- Ese total cuenta registros del reporte con los filtros utilizados; no equivale a unidades netas vendidas ni a productos distintos.
- Se verificaron líneas con `date_of_issue`, `document_type_description`, `series`, `internal_id`, `description`, `unit_type_id`, `quantity` y `total`. Ejemplo observado: código N2115, cantidad 1. Es una línea de venta, no un ranking.

## Parámetros observados

| Parámetro | Valor en la consulta validada |
| --- | --- |
| `period` | `month` |
| `month_start`, `month_end` | `2026-09` |
| `date_start`, `date_end` | `2026-09-21` (coexisten con el periodo mensual; las filas incluyen 01/09) |
| `type` | `sale` |
| `type_person` | `customers` |
| `page`, `per_page` | `1`, `20` |
| `refresh` | `0` |
| `apply_conversion_to_pen`, `min_stock_lower_zero` | `false` |
| `document_type_id`, `state_type_id`, `state_payment_id` | Vacíos |
| `brand_id`, `category_id`, `establishment_id`, `person_id`, `user_id`, `line_id`, `zone_id` | `[]` |

El parámetro `columns` incluía `date_of_issue`, `document_type_description`, `series`, `alone_number`, `internal_id`, `description`, `unit_type_id`, `quantity` y otras columnas comerciales. La pantalla permite seleccionar columnas. No se ha probado aún una selección mínima por API.

El selector de periodo ofrece Por mes, Entre meses, Por fecha y Entre fechas. Los valores internos correspondientes a las alternativas al mes no se verificaron. La pantalla permite Excel, Excel simplificado, Excel agrupado, PDF y CSV en segundo plano; no se descargaron archivos.

## Otra ruta localizada

Reportes → Consolidado de ítems vendidos:

- Pantalla `/reports/sales-consolidated`.
- Consulta `/reports/sales-consolidated/records` y consulta adicional `get-totals`.
- Parámetros observados: `date_range_type_id=date_of_issue`, `date_start=2026-09-01`, `date_end=2026-09-30`, `order_state_type_id=all_states`, `page=1`, `per_page=20`.
- Columnas solicitadas: `document_number,item_internal_id,item_unit_type_id,category_name,item_description,item_quantity,total_sale`.
- La pantalla terminó sin filas. No se confirmó una respuesta JSON exitosa, por lo que no se adopta esta ruta como fuente validada ni se interpreta el resultado como ausencia real de ventas.

## Consecuencias para la integración

La información necesaria existe en el ERP. La limitación anterior era la fuente consultada, no la inexistencia de datos por producto.

La ruta confirmada pertenece a la aplicación web y usa GET con query string. El cliente actual de la tienda añade `/api/`, y `erp-sales.ts` solicita reportes con POST. Por ello no basta con asignar esta ruta a `FACTURADOR_PRODUCT_SALES_REPORT_PATH`: falta verificar si hay un equivalente API autorizado con el token del servidor. El éxito de una sesión de navegador no prueba compatibilidad con Bearer. No se probó autenticación desde el VPS en esta validación.

Para un ranking correcto se necesita:

1. Verificar acceso de servidor y contrato de fechas, columnas y paginación.
2. Filtrar documentos de venta efectivos; comprobar el tratamiento de cotizaciones, notas de venta convertidas a comprobantes, anulaciones y notas de crédito/devoluciones. Los filtros de tipo y estado estaban vacíos y el selector de documentos también mostraba cotizaciones: no se presume que todas las filas sean ventas netas.
3. Leer todas las páginas del periodo o validar una exportación agrupada completa. No clasificar solo la primera página.
4. Agrupar por `internal_id`, considerar unidad de medida y sumar unidades netas; cruzar con el código del catálogo.
5. Actualizar el ranking fuera de la carga de la tienda, con caché persistente. Con el tamaño de página observado, septiembre supone 1937 páginas; no lanzar esa descarga por cada visita.

No se calculó ni publicó un top de productos y no se cambió código de producción.
