# BC en el simulador

El panel `/admin/mensajes/simulador` publica exclusivamente a `/webhook/bc-simulator`.
Se requiere `N8N_SIMULATOR_URL`, `N8N_BASE_URL` o `N8N_URL` en el servidor web.
Los errores del webhook se muestran en el panel; no se usa el webhook real de WhatsApp.

## Flujo desplegado

1. **BC - Simulador - Entrada** valida `dryRun`, origen y contacto `SIMULATOR:`; persiste el mensaje y confirma la recepción.
2. Una solicitud explícita de catálogo de proyectores genera el PDF mediante **BC - Simulador - Catálogo PDF**.
3. Las demás solicitudes pasan por **BC - Simulador - Motor conversacional**: agrupación de mensajes, estado comercial, productos/precios/envíos/checkout y redacción opcional con IA.
4. Las respuestas se registran en la conversación simulada. Estos flujos no contienen nodos para enviar mensajes a Meta ni ManyChat.

Los identificadores instalados están en `deployment.json`. Los archivos JSON usan referencias a las credenciales existentes en n8n; no incluyen claves.
La entrada de WhatsApp y ManyChat conserva el registro de mensajes reales, pero sus conexiones hacia BC y el catálogo automático quedan desconectadas durante las pruebas. El envío manual se mantiene.

## Componentes del VPS

- Web: `/home/IMPORTADORA`, PM2 `importadora`, puerto 4000; rama `codex/desarrollo-actualizado`.
- Motor existente: `/home/IMPORTADORA-router-v2-staging`, PM2 `importadora-router-v2-staging`, puerto 4001; rama `codex/bc-router-simulador`.
- Nginx envía `/api/internal/chat/router-v2*` y `/api/internal/chat/sales-state` al motor.
- El motor identifica simulaciones desde el contacto almacenado. Guarda referencias `SIM-*` en el estado comercial y evita crear pedidos reales, cambiar sus pagos o consultar pedidos reales durante una simulación.

## Publicación y pruebas

Ejecutar `node --test scripts/test-bc-simulator.mjs` y, en la rama del motor, `node --import tsx --test src/lib/router-v2-order-service.test.ts`.
`node scripts/deploy-bc-simulator.mjs` requiere `N8N_BASE_URL` y `N8N_WRITE_API_KEY` y guarda una copia previa en el directorio privado de Git.
Si la clave no tiene permiso de activación, definir `N8N_ACTIVATE_VIA_CLI=1`: el script guarda los cambios y deja pendiente publicar cada ID con `docker exec n8n n8n publish:workflow --id=ID` en el VPS y reiniciar n8n según indique su CLI.
También deben publicarse las entradas existentes `EZaAQCCbY3qWIWY1` y `386c7deddf33dbb8` para aplicar el aislamiento.

En el panel, iniciar una sesión nueva y probar saludo, catálogo, producto/código, stock, envíos a Lima/provincia y datos de compra. El simulador actual admite texto. Audio e imagen requieren ampliar su interfaz antes de probarlos desde el panel.
Un comprobante o una solicitud de asesor puede derivar la conversación a atención humana; iniciar una sesión nueva reinicia la prueba.
