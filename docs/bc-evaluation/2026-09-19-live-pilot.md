# BC: piloto de WhatsApp, pedidos pendientes y búsqueda visual

## Alcance

Piloto autorizado para un solo teléfono (terminación 7196). El resto de contactos conserva su comportamiento. La API entrante identifica el contacto de la lista permitida y evita respuestas paralelas del flujo anterior; el trabajador persistente procesa sus mensajes tras 12 segundos de silencio. Se respetan el interruptor maestro y la asignación a un asesor. `asesor` o una solicitud de no recibir mensajes detienen el piloto.

El carrito ahora acepta nombres únicos, posiciones (`cambia el primero a 3`), y correcciones de nombre, DNI/RUC y dirección antes de confirmar. Una referencia ambigua no cambia ninguna línea. La corrección vuelve a revisión y conserva los demás datos. Los cambios de precio requieren nueva confirmación.

## Pedidos e inventario

La confirmación real crea un `Order` PENDING con todas sus líneas, datos y precios calculados desde el catálogo. La creación y la agenda/respuestas se confirman en una transacción con bloqueo por conversación; los reintentos no duplican el pedido. Los productos se bloquean para lectura durante la comprobación final y creación.

El inventario sigue siendo propiedad del ERP. Estos pedidos NO reservan ni descuentan stock; no constituyen una promesa de despacho. Un asesor debe revalidar disponibilidad y cotizar el flete antes de cobrar. La preferencia de pago y el ID del voucher quedan registrados sin aprobar el pago. El piloto usa `BC_LIVE_PILOT_TEST_MODE=true`: todos sus pedidos llevan la nota **PRUEBA BC AUTORIZADA - NO COBRAR NI DESPACHAR**.

## Fotos

Primero se intenta identificar foto/código de catálogo mediante hash u OCR. Si no se puede, Gemini describe el objeto y esa descripción se busca en el catálogo publicado. Las propuestas son candidatos, no un modelo confirmado; se pide al cliente elegir el código antes de cotizar/agregar. El proveedor no determina stock, precios ni pedidos.

Solo se procesan imágenes acotadas o adjuntos de proveedores permitidos. No se descargan URLs arbitrarias del cliente. Un fallo de descarga, cuota o proveedor produce una respuesta de aclaración. El análisis inicial se limita a fotos individuales; grupos mixtos conservan el tratamiento anterior de agenda/OCR.

Se verificó la API según la [documentación de imágenes de Gemini](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding?hl=en) y [salidas estructuradas](https://ai.google.dev/gemini-api/docs/structured-output). La clave existente funciona. `gemini-2.5-flash` rechazó generación por retirada para usuarios nuevos; `gemini-3.6-flash` y `gemini-3.8-flash` devolvieron alta demanda. `gemini-3.1-flash-lite` analizó correctamente una foto del catálogo como router Wi-Fi, sin inventar un SKU. Este último es el modelo configurado en el VPS.

## Evidencia

- Pruebas unitarias: carrito, lenguaje, agenda, validación visual, aislamiento, estados y envíos. TypeScript y compilación de producción correctos.
- Base PostgreSQL nueva y desechable: simulador conserva cero pedidos reales; piloto crea un único pedido de dos líneas, impide confirmar stock/precios cambiados, registra voucher sin validar pago y conserva el stock ERP.
- Transporte simulado: envíos únicos, resultado incierto pausa la conversación y no se reintenta a ciegas; contacto fuera de la lista recibe 403.
- WhatsApp real: mensaje inicial aceptado y respuesta entrante `prueba bc` recibida; guía posterior emitida por el BOT con estado `sent` (aceptación del proveedor).
- Web HTTP 200 y trabajador activo tras despliegue.

La compra completa y una foto enviada desde el teléfono real todavía requieren la participación del usuario. La foto del catálogo probada con Gemini no sustituye esa validación. Tampoco están cerradas la comprensión de cualquier frase/variante, reservas de inventario en ERP ni la validación automática de pagos.

## Operación y reversión

Flags: `BC_LIVE_PILOT_ENABLED`, lista exacta `BC_LIVE_PILOT_PHONES`, `BC_LIVE_PILOT_STARTED_AT`, `BC_LIVE_PILOT_TEST_MODE`, `BC_VISUAL_SEARCH_ENABLED`, `BC_VISUAL_SEARCH_MODEL`.

Copias privadas de fuente/build, configuración anterior y estado anterior de la conversación: `/home/IMPORTADORA-backups/bc-live-pilot-20260919`. Desactivar el piloto tanto en `.env` como en PM2 y reiniciar detiene nuevos procesamientos. Los mensajes con estado incierto requieren revisión; no cambiar su estado a en cola sin comprobar el proveedor. Los pedidos de prueba deben permanecer sin cobro ni despacho y cancelarse al cerrar la prueba.
