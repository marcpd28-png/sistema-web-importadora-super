# Messenger y TikTok en el Centro de Mensajes

Las rutas `/admin/mensajes/messenger` y `/admin/mensajes/tiktok` consumen la API privada del ChatbotX instalado. El administrador vincula cada cuenta en la configuración de canales del chatbot; los asesores utilizan la sesión de la tienda para consultar y responder. La autorización de cada proveedor sigue siendo necesaria y puede caducar.

## Configuración

- `SOCIAL_INBOX_API_URL`: base terminada en `/api`.
- `SOCIAL_INBOX_API_TOKEN`: token de workspace privado con permisos de escritura y ámbitos `inbox` e `integrations`. Nunca se entrega al navegador.
- `SOCIAL_INBOX_WORKSPACE_ID`: workspace que contiene las cuentas autorizadas.

Contrato utilizado: `https://chatbot.tiendavirtualsuper.com/api/public-spec.json`. Consultas paginadas a conversaciones, mensajes e integraciones. Las respuestas de conversación individual están dentro de `data`. El envío usa el `inboxId` exacto del canal y una `Idempotency-Key`; el bot se pausa antes de enviar. Se rechazan conversaciones ambiguas o de otro canal.

La interfaz admite respuestas de texto de hasta 1000 caracteres y enlaces HTTPS a adjuntos recibidos. No incluye carga de adjuntos ni respuestas a comentarios. Los mensajes permanecen en el chatbot; estas bandejas no se mezclan con la bandeja local de WhatsApp/Telegram. Las conversaciones se actualizan cada 15 segundos y los mensajes cada 10 segundos mientras la pestaña esté visible.

El conteo de cuentas vinculadas indica registros de integración, no garantiza que un permiso siga vigente. Los errores de permisos y entrega se muestran sin revelar respuestas internas del proveedor. No se reintentan envíos automáticamente ante fallos ambiguos; se pide revisar la conversación.

Messenger exige responder dentro de las 24 horas del último mensaje entrante (documentación oficial de Meta: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api). TikTok aplica sus permisos y límites en el conector instalado (https://business-api.tiktok.com/portal/bm-api/education-hub).

## Validación

`node --import tsx --test src/lib/social-inbox.test.ts src/lib/telegram-bridge.test.ts`

Las pruebas usan respuestas simuladas, no envían mensajes a clientes. Para verificar entrega real hay que autorizar la cuenta y usar una conversación de prueba consentida. La creación del token de servicio no autoriza automáticamente ninguna cuenta de Facebook/TikTok.
