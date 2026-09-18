# Corrección de imágenes desde la bandeja — 2026-09-18

- Causa verificada en código: `/api/admin/uploads` devolvía rutas relativas y MessageInput las enviaba sin convertir; el esquema de envío exige una URL absoluta. Además, el cargador compartido generaba variantes WebP de catálogo para los adjuntos de mensajería.
- Versión activa: `988c0cc`. La bandeja indica purpose=message; las fotos se preparan como JPEG manteniendo el encuadre completo, orientación y proporciones, hasta 1920 px y 5 MB de salida. Se devuelve URL pública absoluta. El cliente también resuelve rutas relativas para compatibilidad. El flujo de imágenes de catálogo conserva sus variantes actuales.
- Pasaron 107 pruebas, TypeScript, ESLint y compilación aislada. Despliegue con respaldo y HTTP 200.
- Verificación en VPS: subida autenticada de PNG generada para la prueba devolvió HTTP 200; descarga por URL pública devolvió HTTP 200, Content-Type image/jpeg y dimensiones 320×180. El payload IMAGE superó la validación de URL del endpoint de mensajes y devolvió Conversation not found (404) para un identificador deliberadamente inexistente, en vez de rechazar el payload (400).
- No se invocó entrega a clientes. El transporte n8n se cubrió con pruebas de contrato y respuestas simuladas; no se afirma una entrega real por ManyChat/WhatsApp. La única foto temporal creada fue eliminada al terminar.
