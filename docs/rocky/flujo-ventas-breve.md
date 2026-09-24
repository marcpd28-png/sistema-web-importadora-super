# Flujo breve de Rocky — 24 de septiembre de 2026

Implementación local para el simulador. No activa ROCKY_AUTO_ENABLED, no envía mensajes a clientes, no crea pedidos reales ni valida pagos.

## Atención

- Saludo con una sola pregunta; hasta tres opciones por respuesta, con fotos disponibles del catálogo.
- Selección por código completo (incluido color) o posición: «el primero».
- Compra por «lo quiero», «quiero comprar», «sí» tras una selección única o «quiero 2».
- Una pregunta por paso. Admite «boleta 12345678» y «factura 12345678901» para evitar un turno.
- Reutiliza precios unitarios, mayoristas y por caja del carrito BC. Stock insuficiente bloquea la compra; un cambio de precio exige revisar otra vez.
- Las consultas de garantía, horario, entrega o pago conservan el carrito. La información debe estar configurada/aprobada; en caso contrario se deriva.
- Datos del carrito e historial de checkout se excluyen del contexto del modelo. El motor BC procesa los datos de cliente.

## Prueba sugerida

Buscar un producto → «el primero» → «sí» → «2» → nombre → «boleta 12345678» → modalidad de entrega → dirección si corresponde → «confirmar pedido» → medio de pago → imagen de comprobante de prueba.

La confirmación produce una referencia SIM-CART. El comprobante queda **pendiente de revisión**, nunca pagado automáticamente. También se pueden agregar, cambiar o quitar líneas mediante los comandos del carrito BC y cancelar antes de confirmar.

Los medios del simulador usan ROUTER_V2_DELIVERY_METHODS y ROUTER_V2_PAYMENT_METHODS, igual que BC. Sus valores por defecto no constituyen validación comercial para un lanzamiento real.

## Pendiente de integración real

Validar con la base de datos y el simulador desplegado: persistencia entre turnos, adjuntos, duplicados y toma de control por un asesor. La base local no estaba disponible durante esta implementación.

Conectar y verificar la creación de pedidos y la entrega multimedia en la cola real antes de habilitar atención autónoma. No se genera un enlace de pago ni se comprueba el abono en esta versión. El modelo conserva sus límites de concurrencia actuales; no se ha acreditado capacidad para miles de consultas simultáneas.
