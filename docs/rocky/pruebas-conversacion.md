# Conversaciones de venta — mejoras del 24/09/2026

Pruebas locales reproducibles: `node --import tsx --test src/lib/rocky/conversation-flow.test.ts`.

## Casos cubiertos

- «Dame dos del negro», cantidades en palabras y selección por posición entre las opciones mostradas.
- Color ambiguo: pedir selección sin asumir la referencia anterior y conservar la cantidad solicitada.
- «Ese no, el otro»: cambiar únicamente si existe una alternativa inequívoca, antes de confirmar el pedido.
- «Mejor tres»: recalcular stock y precio por cantidad; volver a revisar sin pedir otra vez nombre, documento y entrega válidos.
- Dudas de garantía y fotos durante checkout: conservar el carrito y retomar el siguiente dato pendiente.
- Conservar las alternativas mostradas después de consultar el detalle de una de ellas.
- No convertir dudas, negaciones, devoluciones, cantidades inválidas o pedidos compuestos en compras implícitas.
- Confirmación y comprobantes mantienen el comportamiento de simulación y revisión pendiente.
- Saludos, agradecimientos y «lo voy a pensar» conservan producto, presupuesto y cantidad.
- «Gracias», «un momento», «ya vuelvo» y confirmaciones genéricas no se guardan como nombre o dirección; se recuerda el dato pendiente.
- «Me llamo Ana Perez» guarda el nombre sin el prefijo conversacional.
- «Cancelar», «cancela la compra» y «ya no quiero comprar» cancelan antes de confirmar y limpian la cantidad pendiente. Después de confirmar, la cancelación requiere revisión del asesor.
- Cantidades en palabras hasta doce; cero, negativos y decimales se rechazan cuando se espera cantidad.
- Si hay dos resultados, la pregunta ofrece primero o segundo, sin mencionar un tercero inexistente.

## Alcance

Estos casos prueban la lógica de conversación con inventario controlado. No equivalen a una medición de calidad para todas las consultas ni de capacidad concurrente. Se conservan las validaciones de stock, precio y control humano existentes. No se habilita el envío autónomo, se modifica la pasarela de pago ni se configura concurrencia adicional.

## Despliegue verificado

Publicado en `/home/IMPORTADORA-releases/rocky2-conversations-20260924`, proceso PM2 `importadora-rocky2-conversations`, puerto localhost 4014. Se usó como base `rocky-20260924-sales` y se trasladaron únicamente los archivos de conversación, su parser de compras, pruebas y verificación. Las cuatro rutas del simulador y de Rocky apuntan a esta instancia. La tienda conserva su instancia actual.

Validación: 78 pruebas locales, TypeScript y ESLint; 72 pruebas de Rocky 2 en Linux y compilación Next.js. La base de Rocky 2 no incluye las seis pruebas del asistente de tienda. Flujo de 12 turnos aprobado por API privada y pública, incluyendo agradecimiento, pausa y confirmación prematura sin guardar esos mensajes como nombre. Tienda y simulador accesibles, 29 recursos JS/CSS verificados y API interna sin credenciales devuelve 401. Envío autónomo desactivado; no se crean pedidos reales ni se validan pagos.

Evidencias y respaldo: `/home/IMPORTADORA-backups/rocky2-conversations-20260924/` contiene hash del paquete, resultados de pruebas, compilación, verificaciones y `nginx.conf`. Para revertir estas rutas, cambiar únicamente sus upstreams 4014 a 4008, ejecutar `nginx -t` y recargar Nginx. El proceso anterior sigue disponible. No restaurar el archivo completo si después hubo cambios de otras tareas.
