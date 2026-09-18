# Publicación de productos y pendientes de fotografía

Implementado el 18 de septiembre de 2026.

## Comportamiento

- Un producto necesita una foto en `localImageUrl`, `imageUrl` o un medio de tipo `IMAGE` para aparecer en las consultas públicas. El indicador `isVisible` también debe estar activado.
- Los campos nulos, vacíos, con espacios, videos y enlaces con `imagen-no-disponible`, `no-image`, `placeholder` o `sin-foto` no habilitan la publicación. Las coincidencias no distinguen mayúsculas.
- La protección se calcula al consultar el catálogo. Una sincronización que active `isVisible` o reponga stock no puede publicar un producto sin foto.
- La sección **Catálogo e Inventario → Requiere atención** (`/admin/atencion`) lista todos los productos con `stockUnits > 0` sin foto, incluidos los ocultos manualmente. Incluye contador, suma de unidades, búsqueda, paginación y acceso al editor. Prioriza mayor stock.
- Guardar una foto elimina el producto de los pendientes. Si su publicación estaba desactivada, debe activarse «Visible» para publicarlo.
- Al guardar una portada desde el editor, también se conserva en la galería. Las sincronizaciones ERP actuales no reemplazan esa galería.
- Los enlaces directos, fichas digitales públicas, sugerencias, sitemap, cotización web y actualización del carrito respetan la misma condición de foto. Los administradores mantienen acceso a la vista previa de las fichas digitales.
- Se corrigieron los filtros y conteos administrativos de fotos para que una portada válida sin copia local no se clasifique como faltante y los videos no cuenten como fotografías.

No requiere migración ni cambios masivos de datos. La detección usa los enlaces guardados y el tipo de medio; no comprueba continuamente si una URL externa responde ni si la fotografía corresponde al producto. Detectar enlaces rotos y revisar la calidad de las fotografías son mejoras futuras.

## Validación

- Compilación de producción de Next.js y TypeScript: correctas.
- 30 pruebas dirigidas: correctas, incluida integración real con PostgreSQL 16 en una base temporal aislada.
- La integración verifica que los filtros Prisma, SQL, la selección de foto y la lista de pendientes coincidan; que una actualización de stock/visibilidad no publique productos sin foto; y que agregar, retirar y conservar la foto después de sincronizar produzca el resultado esperado.
- Revisión en navegador en escritorio y a 390 px: búsqueda, diseño, enlace al editor y guardado correctos. Al guardar la foto de un producto de prueba, el contador de pendientes pasó de 28 a 27.
- Comprobación HTTP: rutas `/producto/…` y `/p/…` de un producto sin foto devuelven 404; no aparece en sitemap ni en respuestas del carrito o búsqueda exacta.
- ESLint de los módulos nuevos y demás archivos revisados: correcto. El análisis de archivos completos también encontró cinco usos previos de `any` en `admin/actions.ts` y tres avisos previos en `store-admin.ts`.
- La suite adicional `shop-assistant.test.ts` tiene cuatro fallos anteriores al cambio; se reprodujeron usando las versiones originales de los módulos compartidos. No se modificó esa funcionalidad.

Pruebas dirigidas:

```powershell
node --import tsx --test src/lib/product-photo-policy.test.ts src/lib/product-photo-policy.integration.test.ts src/lib/store-shared.test.ts src/components/catalog/cart-store.test.ts src/lib/product-image-storage.test.ts
```

La prueba de integración requiere `TEST_DATABASE_URL` apuntando a una base de prueba con el esquema Prisma. Si no se define, esa prueba se omite. Los registros de prueba se crean y eliminan dentro de una transacción; ante fallos se revierte.
