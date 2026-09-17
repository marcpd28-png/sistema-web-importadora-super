# Bienvenida comercial del simulador BC

Actualizado: 17 de septiembre de 2026.

La primera respuesta general, cuando el cliente saluda sin consultar un producto concreto, presenta la tienda en bloques con iconos:

- Nombre y dirección obtenidos de `StoreSettings`.
- Enlace al catálogo completo de `ROUTER_V2_RETAIL_STORE_URL` (por defecto `https://tiendavirtualsuper.com`).
- Catálogos por categoría o marca en PDF.
- Envíos a todo Lima con motorizado propio, previo pago por adelantado.
- Envíos a provincias por Shalom y recojo presencial.
- Yape, Plin y transferencia bancaria.
- Una pregunta final para conocer el producto que necesita el cliente.

Las modalidades de entrega y pago fueron confirmadas por el negocio. Son los valores predeterminados si `ROUTER_V2_DELIVERY_METHODS` o `ROUTER_V2_PAYMENT_METHODS` no existen. Las variables explícitas prevalecen; una variable vacía deshabilita la lista correspondiente. La bienvenida utiliza las mismas listas que las respuestas y selecciones de pago y entrega.

La dirección se consulta en cada petición, sin copiarla al código. Si falta, el bot indica que se confirmará al coordinar el recojo. No publica números de cuenta ni inventa tarifas o plazos.

Una respuesta anterior del bot o de un asesor evita repetir la bienvenida extensa. Los mensajes pendientes o fallidos no cuentan como una respuesta entregada. Las consultas concretas conservan su respuesta de producto o catálogo. El saludo horario se añade en la salida común del simulador: 05:00–11:59 buenos días, 12:00–18:59 buenas tardes y 19:00–04:59 buenas noches (America/Lima).

El cambio está en el motor de la rama `codex/bc-router-simulador`; el ingreso y la salida del simulador siguen en `codex/desarrollo-actualizado`. Se conserva la espera de 12 segundos desde el último mensaje. Este cambio no activa canales reales de WhatsApp.

Validación local: 38 pruebas de respuesta, redacción, flujos, búsqueda de productos y formato de salida; ESLint de los archivos modificados.

## Despliegue verificado

Motor publicado en Git y desplegado al VPS: `42e92314085a7583deb2d30678c353f8c377c09a`.

La compilación completa de Next.js y las 38 pruebas finalizaron correctamente. Se verificaron cuatro respuestas pasando por el simulador público, n8n y la persistencia de mensajes:

- `hola`: bienvenida completa, un solo mensaje, dirección configurada y modalidades oficiales.
- Segundo `hola` en la misma conversación: respuesta breve sin repetir la bienvenida.
- `hola busco catalogo de proyectores`: PDF accesible con 25 productos.
- `hola precio del O912 por favor`: imagen y precio actual del inventario, sin anteponer la bienvenida extensa.

Las respuestas llegaron entre 12,688 y 13,117 segundos después del último mensaje. Los contactos temporales de prueba fueron eliminados. Ambos procesos PM2 quedaron online. Evidencia y copia anterior en `/home/IMPORTADORA-backups/bc-welcome-42e9231/`.
