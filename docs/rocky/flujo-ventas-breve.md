# Flujo breve de Rocky — 24 de septiembre de 2026

Publicado en el VPS para el simulador. No activa ROCKY_AUTO_ENABLED, no envía mensajes a clientes, no crea pedidos reales ni valida pagos.

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

Se verificó en la base del VPS, por API privada y pública, el flujo de nueve turnos con foto, compra, consulta lateral, datos, confirmación y comprobante. La referencia no crea un pedido real. Queda pendiente ampliar pruebas de concurrencia y toma de control durante checkout.

Conectar y verificar la creación de pedidos y la entrega multimedia en la cola real antes de habilitar atención autónoma. No se genera un enlace de pago ni se comprueba el abono en esta versión. El modelo conserva sus límites de concurrencia actuales; no se ha acreditado capacidad para miles de consultas simultáneas.

## Despliegue verificado

Release `/home/IMPORTADORA-releases/rocky-20260924-sales`, PM2 `importadora-rocky-sales`, puerto 4008. Base del release: `rocky-20260921-image-names`; cambios de aplicación del commit `63db43c`. Sin migraciones. Las cuatro rutas del simulador y de Rocky apuntan a 4008; auditoría, BC y tienda conservan sus upstreams.

55 pruebas en Linux, build Next.js y pruebas integradas privadas/públicas aprobadas. Tienda y simulador HTTP 200; 19 recursos estáticos accesibles; API interna sin credencial HTTP 401. Ollama y pgvector disponibles; envío real apagado. Script reproducible: `scripts/rocky/verify-sales-flow.mjs --execute` con `ROCKY_TEST_BASE`.

Respaldo de Nginx: `/home/IMPORTADORA-backups/rocky-sales-20260924/nginx.conf`. Para revertir las cuatro rutas, restaurar ese archivo en `/etc/nginx/sites-enabled/tiendavirtualsuper.com.conf`, comprobar con `nginx -t` y recargar Nginx. El proceso anterior permanece disponible en 4005. Logs: `/var/log/rocky/sales-*.log`.
