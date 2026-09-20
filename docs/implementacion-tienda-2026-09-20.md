# Organización de la tienda y campañas

Cambios implementados a partir de la auditoría del 19 de septiembre y publicados en Git y VPS el 20 de septiembre por solicitud del usuario. La clasificación comercial no modifica el inventario del ERP.

## Navegación y productos

- Clasificación comercial con familias y subcategorías. Se calcula sobre los productos públicos con fotografía; no sobrescribe las categorías del ERP. Las familias y subcategorías vacías no aparecen.
- Menú compartido entre inicio, resultados y fichas. Los enlaces antiguos de categorías redirigen al mismo catálogo con filtros.
- Proyectores usa el mismo conjunto desde ambos accesos. Pantallas y accesorios de proyección tiene su propia subcategoría.
- Drones reconoce DJI Neo 2 y DJI Avata 360; baterías y repuestos se clasifican aparte.
- Amazon Echo y Alexa identifica dispositivos Echo; el enchufe N2028 pertenece a Hogar inteligente. No se afirma compatibilidad adicional sin verificar.
- Consolas de videojuegos separa mandos sueltos. Los códigos N755 y N755-SQ no se fusionan: su semejanza no demuestra que sean el mismo inventario.
- Se aplican las reubicaciones conocidas por código y reglas por tipo de producto. Los casos sin clasificación reconocida permanecen en Más productos para revisión editorial.
- Categorías visuales antes de las filas; accesos sin desplazamiento automático; filtros de categoría, marca, precio y stock; paginación que conserva los filtros.
- Colores agrupados únicamente cuando coinciden código base, marca y nombre del modelo. Cada variante conserva su código, imagen, precio, stock y carrito. No se agrupan modelos diferentes solo por similitud del título.
- Los productos relacionados utilizan la misma clasificación comercial.
- En móvil, si el banner no tiene una imagen específica para móvil, se muestra un mensaje breve y legible. Los banners con recurso móvil propio lo conservan.

## Administración de Ofertas y Preventa

Ruta: `/admin/collections`, menú **Ventas y Marketing → Ofertas y preventa**.

1. Pegar códigos exactos del catálogo, uno por línea (también admite comas o punto y coma).
2. Escribir las condiciones de la oferta o de reserva y entrega.
3. Marcar **Mostrar colección en la tienda** y guardar.
4. Desmarcar y guardar para ocultarla conservando los productos configurados.

Ambas campañas empiezan desactivadas. Una colección desactivada o sin productos publicables no aparece en los accesos y tampoco entrega productos mediante su enlace directo. Se eliminan códigos repetidos conservando el orden. Se rechazan códigos inexistentes y se preserva el borrador para corregirlos. La página y la acción de guardado requieren administrador. Hay control de cambios simultáneos por versión de la colección.

Agregar un código no crea un descuento: se usa el precio vigente del catálogo. Preventa permite consultar la reserva; no habilita comprar productos sin stock.

## Más vendidos y ERP

El ranking utiliza unidades vendidas. Primero intenta el reporte configurado con `FACTURADOR_PRODUCT_SALES_REPORT_PATH` y después `/reports/general-sale`, solicitando 15 días. Si solo existe un contador acumulado explícito de ventas por producto, se identifica como **Acumulado ERP**.

No se usa stock, precio ni orden de respuesta como sustituto de ventas. Se suman líneas por código, se excluyen anulaciones reconocidas y se respetan las fechas del reporte. Sin datos válidos, el ranking muestra su indisponibilidad; el inicio puede mostrar productos destacados identificados como tales.

**Verificación real en el VPS:** las credenciales funcionan, pero `/reports/general-sale` devuelve totales y gráficos generales, sin líneas de productos. `/items/records-sale` devuelve productos con stock y cantidad de formulario, sin contadores explícitos de unidades vendidas. Por eso Más vendidos informa que el ranking no está disponible. Hace falta configurar un reporte que entregue unidades vendidas por código; no se interpreta stock como ventas.

## Validación local

- 35 pruebas de clasificación, variantes y procesamiento de ventas, incluidos cuatro casos adicionales detectados con el catálogo real (N33, O07, P1073 y P920).
- 3 pruebas existentes de reconciliación del carrito: precio, stock, fotografías y retirada de productos no disponibles.
- ESLint de todos los archivos TypeScript modificados y nuevos.
- `npm run build` completado: compilación, TypeScript y generación de páginas. Persiste una advertencia previa de trazado de archivos en `catalog-pdf.ts` / `next.config.ts`.
- Base de pruebas aislada con productos de ejemplo: migración nueva aplicada sobre el esquema previo; activación y ocultación de ambas campañas desde el navegador; rechazo de código inexistente; deduplicación y orden de códigos; condiciones públicas; bloqueo de compra sin stock.
- Recorridos verificados: proyectores, DJI, Echo sin enchufe, categoría antigua, filtros y paginación, cambio de color y código del carrito, menú en ficha y productos relacionados.
- Revisión visual móvil a 390 × 844. Las imágenes de prueba son marcadores locales; no sustituyen fotografías del catálogo real.

## Publicación

La versión inicial `5b3e2e2` se compiló en una carpeta separada del VPS y se activó después de pasar las 34 pruebas y la verificación HTTP de inicio, colecciones, categorías antiguas y protección administrativa. Migración aplicada; ambas campañas desactivadas. Respaldo de base, entorno y compilación anterior en `/home/IMPORTADORA-backups/storefront-5b3e2e2`. La revisión del navegador público detectó cuatro casos adicionales, corregidos por código y cubiertos con pruebas en la siguiente revisión.

Aplicar `prisma/migrations/20260920000000_storefront_campaigns/migration.sql` mediante el flujo habitual `prisma migrate deploy` sobre la base existente, generar Prisma y compilar con el entorno de producción. El comando `npm start` del proyecto ya ejecuta las migraciones pendientes. La nueva tabla debe existir antes de servir las páginas que consultan campañas.

La cadena histórica de migraciones del proyecto no inicializa una base completamente vacía (falta la creación inicial de Product); este problema preexistente no se corrigió en este cambio. Para verificar la migración nueva se preparó primero el esquema previo en una base descartable.

La compilación y el navegador de pruebas usan datos aislados. Generar una nueva compilación con el entorno correcto al publicar; no reutilizar la base ni las credenciales de prueba. No se cambió `.env`.

Incidencias del entorno de pruebas: se utilizó un servidor PostgreSQL compatible local por falta de base accesible; en Windows fue necesario precargar `sharp` para evitar un fallo de carga de la biblioteca nativa durante acciones administrativas. No se cambió la configuración del proyecto por estas incidencias locales.
