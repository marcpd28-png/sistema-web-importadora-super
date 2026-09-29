# Catálogo automático de proyectores

El flujo `Catálogo automático de proyectores` recibe el mensaje ya persistido por
el workflow de entrada de WhatsApp. Cuando el texto contiene las
palabras `catálogo` y `proyector`:

1. Solicita a la aplicación el PDF mediante
   `POST /api/internal/catalogs/projectors`.
2. La aplicación verifica que la conversación continúe en modo automático, que
   no esté asignada a un agente y que el contacto sea real.
3. La aplicación genera o reutiliza un PDF inmutable con una imagen grande por
   página, el nombre y el código de cada proyector visible. Recorta márgenes
   blancos o transparentes y conserva las proporciones sin añadir cuadrados.
4. n8n entrega al contacto un documento PDF nativo de WhatsApp mediante YCloud
   y el mismo número de WhatsApp de la tienda.
5. Solo después de una respuesta exitosa del workflow outbound, n8n registra el
   mensaje como enviado en el Centro de Mensajes.

La URL pública se utiliza solo como origen del archivo para YCloud. El cliente
recibe una tarjeta de documento descargable llamada `Catalogo-de-proyectores.pdf`,
no un enlace de texto.

Se conserva el control de idempotencia del outbound y solo se registra `sent`
si YCloud devuelve un identificador de mensaje. Un error o respuesta sin ID sigue
la salida de fallo; nunca se sustituye el documento por un enlace silenciosamente.
El proveedor del registro es `ycloud` y el tipo es `DOCUMENT`.

Si el proveedor rechaza el archivo, se registra `failed` con una razón segura y
el mismo `requestId`, visible en el Centro de Mensajes. La prueba del 16/09/2026
detectó un rechazo de permisos de envío. La entrega nativa requiere corregir la
configuración de YCloud antes de considerarse operativa.

Los contactos del simulador se omiten de la entrega real y nunca se utilizan
para probar envíos reales.
