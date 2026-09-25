# Comunicación con el cliente

Cambios derivados de la auditoría del 25/09/2026:

- El texto de cortesía se elimina antes de filtrar catálogos. Se conservan marcas y modelos explícitos, incluido M3 cuando identifica un producto.
- Consultas de cantidad o embalaje sin producto, como «precio de la caja de 100», piden nombre o código en lugar de buscar un producto de 100 W.
- «Y el precio» usa la selección actual. Una lista de opciones sin selección no basta para interpretar «ese». «Precio del segundo» selecciona la segunda opción; una posición inexistente requiere aclaración.
- Se conservan las restricciones de tipo incluso con varios códigos: teléfonos no devuelven soportes de laptop, cargadores portátiles no devuelven cargadores de pared y una consulta de cables no devuelve audífonos.
- Las preguntas combinadas sobre producto/precio, tienda, envío, pago y garantía se atienden por temas independientes. La información disponible se conserva aunque otra parte requiera un asesor. Esta separación es deliberadamente acotada; no representa comprensión general de cualquier mensaje compuesto.
- No se repite la presentación si hay un producto seleccionado. Se retira la insistencia de compra en respuestas de varios temas y se conserva como máximo una pregunta para retomar el carrito.
- Si el cliente no puede abrir el catálogo, recibe el enlace general y una pregunta para distinguir un error de acceso de una búsqueda sin resultado.
- No se afirma un precio por caja a partir del precio unitario: esa presentación requiere verificación y queda marcada para asesor.

Las pruebas de regresión usan expresiones anonimizadas y productos controlados. `scripts/rocky/verify-communication.mjs --execute` verifica la API real usando exclusivamente contactos de simulación nuevos; no envía mensajes a clientes ni crea pedidos reales. Los casos de prueba conocidos no son una medición independiente de precisión sobre el total de mensajes. El objetivo del 99,9 % sigue sin estar acreditado.

## Publicación verificada

El 25/09/2026 se publicó `rocky2-communication-20260925`, PM2 `importadora-rocky2-communication`, puerto 4017, en las cinco rutas de Rocky. Pasaron 134 pruebas locales, 128 disponibles en la versión del VPS, TypeScript, ESLint y la compilación de producción. Se verificaron tanto el puerto privado como el dominio público: 12 turnos de comunicación, 12 del flujo de venta simulado y seis consultas con revisión/activación/retirada de un ejemplo técnico. Se comprobaron 29 recursos JS/CSS. No hubo migraciones ni cambios de modo AUTO.
