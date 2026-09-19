# Carrito conjunto del simulador — 19 de septiembre de 2026

## Alcance

Carrito persistido en la agenda de la conversación, exclusivamente para contactos SIMULATOR y con `BC_MULTI_CART_ENABLED=true`. Los flujos de atención real no se conectan ni se habilitan con esta función. El precio y stock se leen del catálogo vigente.

- Se prepara cuando hay dos consultas de compra con productos identificados y cantidades explícitas, ambas cotizadas sin ambigüedad.
- Permite `agregar CODIGO 2`, `cambiar CODIGO a 3`, `quitar CODIGO`, `ver carrito`, `continuar compra` y `cancelar pedido` antes de confirmar.
- Recoge nombre, boleta/factura, DNI/RUC y modalidad/datos de entrega. El flete no cotizado se declara pendiente y no se inventa.
- Vuelve a consultar disponibilidad y precios al confirmar. Un cambio obliga a revisar de nuevo la cotización; un cambio durante la persistencia se rechaza atómicamente.
- La referencia SIM-CART se conserva en la agenda: no crea Order, no reserva ni descuenta stock, no registra pagos reales. El comprobante adjunto queda recibido pero NO verificado.
- Las repeticiones del mismo mensaje no duplican respuestas ni referencias. Se conserva el aislamiento del asesor y el interruptor general del bot.
- Corrección adicional: `1 unidad` después de un código ahora se reconoce como cantidad en la agenda.

## Validación

Pruebas unitarias y de regresión, TypeScript, ESLint y build. Integración por el endpoint requests en una base PostgreSQL nueva y desechable: dos productos, cambio de cantidad, quitar/agregar, consulta lateral, checkout, modificación de tarifa antes de confirmar, nueva revisión, confirmación y comprobante. Cero pedidos reales y stock de pruebas sin cambios. Se verifica idempotencia del trigger en cada paso.

No acredita comprensión universal, reconocimiento visual por apariencia ni una venta real completa. Los comandos de edición son explícitos por código; quedan pendientes mayor cobertura de formulaciones abiertas, correcciones de datos durante checkout y el paso de simulación a pedidos reales bajo sus reglas comerciales.
