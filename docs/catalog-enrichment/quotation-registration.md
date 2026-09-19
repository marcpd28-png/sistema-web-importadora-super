# Cotizaciones de tienda a ERP

La tienda espera ahora la confirmación del ERP antes de mostrar éxito. Una
respuesta vacía, HTML o `success: false` no registra la cotización como enviada.
Se exigen tanto número como identificador externo. El PDF se descarga después
de persistir esa confirmación, sin convertir un fallo del PDF en fallo de envío.

El carrito envía la dirección dentro de `customer.address`; el servidor acepta
también `address` para compatibilidad con pestañas de la versión anterior.
Los productos vinculados se consultan por su identificador ERP. La búsqueda
por código exige coincidencia exacta y no usa el primer resultado aproximado.
No se registran pagos por generar una cotización.

Cada solicitud del carrito conserva un UUID mientras sus datos no cambien.
La clave primaria de la cotización local impide repetir el envío si se pierde
la respuesta y se vuelve a pulsar el botón. Un registro previo sin confirmación
devuelve conflicto para revisión, sin volver a enviar. El POST al ERP no tiene
reintentos automáticos. Este mecanismo no reconcilia solicitudes históricas ni
evita solicitudes nuevas creadas después de recargar la página.

Validación: `node --import tsx --test src/lib/facturador/quotation-confirmation.test.ts src/lib/quote-pricing.test.ts`.
