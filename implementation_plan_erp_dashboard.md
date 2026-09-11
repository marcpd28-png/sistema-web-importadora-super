# Plan de Implementación: Mejoras en ERP, Eliminación de Registros y Configuración de Dashboard

## 1. Depuración y Mejora de Errores ERP (Cotizaciones)
**Objetivo:** Limpiar la base de datos de cotizaciones fallidas y mejorar el reporte de errores futuros.

### Cambios Propuestos:
- **[MODIFICAR] `src/app/api/erp-quote/route.ts`** (o equivalente): Cuando la API del ERP responda con un error, se capturará el mensaje de error específico del ERP (o la causa exacta del fallo) y se guardará en el campo `errorMessage` del modelo `Quote`.
- **[MODIFICAR] `src/app/admin/quotes/page.tsx`**: Si una cotización tiene estado `ERROR`, se mostrará de forma visible el motivo específico del fallo (`errorMessage`) en la interfaz, posiblemente usando un banner o alerta roja dentro del detalle.
- **Limpieza Inmediata:** Ejecutaré un script seguro en Prisma para eliminar permanentemente de la base de datos todas las cotizaciones cuyo estado actual sea `ERROR`.

## 2. Funcionalidad de Eliminación (Cotizaciones y Órdenes)
**Objetivo:** Permitir a los administradores borrar cotizaciones y órdenes generadas, respetando el diseño del sistema.

### Cambios Propuestos:
- **[NUEVO] Acciones de Servidor (Server Actions):** Crear funciones `deleteQuoteAction` y `deleteOrderAction` que eliminen el registro y sus items relacionados (usando `onDelete: Cascade` si aplica, o borrándolos manualmente en una transacción).
- **[MODIFICAR] `src/app/admin/quotes/[id]/page.tsx` y `src/app/admin/orders/[id]/page.tsx`**: Agregar un botón de "Eliminar" (probablemente con icono de papelera y diseño de peligro `variant="danger"` o similar).
- **[MODIFICAR] Componente de Confirmación:** Al hacer clic en el botón, no se borrará inmediatamente. Se lanzará un modal o ventana de diálogo nativa/customizada (respetando los estilos de tus modales actuales) que requerirá que el administrador confirme: *"¿Estás seguro de eliminar esta cotización/orden? Esta acción no se puede deshacer."*.

## 3. Reestructuración de Configuración del Dashboard (Rueda)
**Objetivo:** Trasladar la configuración del dashboard/menú de un simple modal a una página dedicada con mayores opciones.

### Análisis y Cambios Propuestos:
Actualmente, el botón de la tuerca (`Settings`) en `customizable-dashboard.tsx` abre una ventana sobrepuesta (modal).
- **[MODIFICAR] `src/components/admin/customizable-dashboard.tsx`**: Cambiar el comportamiento del botón de la tuerca. En lugar de abrir un modal mediante `handleOpenConfig`, actuará como un enlace (`<Link target="_blank">` si deseas literalmente una pestaña nueva, o simplemente una redirección a una nueva ruta de administración).
- **[NUEVO] `src/app/admin/dashboard-settings/page.tsx`**: Crear una nueva pantalla exclusiva para la configuración.
- **Opciones a considerar:** En esta nueva pantalla no solo pondremos la selección de métricas visibles, sino que dejaremos la estructura lista (el *layout*) para incluir:
  - Orden de las tarjetas.
  - Personalización del menú lateral izquierdo (ocultar/mostrar módulos si lo deseas en el futuro).
  - Preferencias visuales del administrador.

## User Review Required
> [!IMPORTANT]
> **Eliminación de Órdenes:** ¿Deseas que cualquier administrador pueda eliminar órdenes y cotizaciones, o solo el rol principal?
> **Apertura de pestaña:** ¿Quieres que al hacer clic en la tuerca se abra literalmente una "Nueva Pestaña" en el navegador (`target="_blank"`), o te refieres a que te lleve a una nueva "Página" completa dentro de la misma pestaña?

Por favor revisa este plan. Si estás de acuerdo con el enfoque, dame tu confirmación y empezaré inmediatamente a aplicar los cambios en el código.
