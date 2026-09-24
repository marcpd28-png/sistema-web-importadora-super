# ROCKY en el Asistente de la tienda — 24/09/2026

`POST /api/shop-assistant` utiliza `RockyAIOrchestrator` con el backend comercial
de ROCKY. El widget existente conserva su interfaz, tarjetas, cantidades y botones
de carrito. Las respuestas incluyen `meta.engine = ROCKY`. No se ejecuta la antigua
reescritura de respuestas con Ollama.

El contexto se guarda durante una hora en una cookie HttpOnly firmada, restringida
a la API, con audiencia `rocky-store` y ligada al `sessionId` del widget. Limpiar el
chat cambia la sesión y descarta el contexto anterior. La búsqueda vuelve a leer
productos visibles; el navegador no proporciona precios ni autorizaciones.

El catálogo ofrece un enlace filtrado a la tienda sin generar PDFs. Comprar guía
al botón Agregar de la tarjeta y conserva la cantidad. Solicitar un asesor ofrece
WhatsApp sin afirmar que se envió una derivación. No se crean pedidos ni se envían
mensajes a clientes desde este adaptador. RAG recupera conocimiento aprobado y
público con búsqueda léxica; el clasificador Ollama usa la configuración de ROCKY.

## Despliegue

- Release: `/home/IMPORTADORA-releases/rocky-20260924-store-assistant`.
- Proceso PM2 guardado: `importadora-rocky-store`, localhost 4009.
- Nginx dirige únicamente `/api/shop-assistant` a 4009. La página y los archivos
  del widget siguen servidos por la tienda actual, sin cambio de assets.
- Backup previo: `/tmp/nginx-before-rocky-store-20260924072253.conf`.
- Para revertir, eliminar solo el bloque `location = /api/shop-assistant` añadido,
  comprobar con `nginx -t` y recargar Nginx; vuelve al backend general anterior.

## Comprobación

- TypeScript, ESLint de los archivos nuevos/modificados del adaptador y build de
  producción completados sin errores.
- 34 pruebas de ROCKY y del adaptador pasaron.
- La suite del motor anterior tiene cuatro fallos preexistentes; se reprodujeron
  también contra su archivo original de HEAD, antes de las exportaciones añadidas.
  Ese motor ya no responde en esta API.
- `node --env-file=.env scripts/rocky/verify-store-assistant.mjs --execute` pasó en
  localhost y en la dirección pública (`ROCKY_TEST_BASE=https://tiendavirtualsuper.com`).
  Verifica saludo, código, contexto firmado, 12 unidades, compra, catálogo, asesor,
  datos inválidos y límite de cuerpo. No crea pedidos ni envía WhatsApp.
- Prueba pública: saludo 130 ms, producto 47 ms, mayorista 39 ms, compra 34 ms,
  catálogo 497 ms y asesor 31 ms. Son mediciones de esta prueba, no una garantía.
- Verificación en navegador: abrir Asistente y escribir hola mostró
  «¡Hola! Soy Rocky, de Importadora Super 😊 ¿Qué producto buscas?».

## Interfaz simplificada, 24/09/2026

Se reemplazó el panel por un chat con CSS Modules: sin tarjetas de productos,
ofertas de bienvenida ni preguntas sugeridas. Los resultados conservan únicamente
texto y enlaces discretos para ver el producto, agregar la cantidad consultada al
carrito, abrir el catálogo o contactar a un asesor.

Incluye textarea adaptable, Enter para enviar y Shift+Enter para salto de línea,
estado de consulta, detener petición, reintentar sin duplicar el mensaje del usuario,
Escape para cerrar y foco contenido en el diálogo. Nueva conversación cancela la
petición activa y cambia el identificador para reiniciar también la memoria de Rocky.
El historial nuevo se conserva por pestaña en sessionStorage.

Despliegue de interfaz: `/home/IMPORTADORA-releases/store-assistant-ui-20260924`,
proceso `importadora-store-assistant-ui`, puerto 4010. Se construyó desde el código
limpio del servidor principal (commit `03382d0`), modificando únicamente el componente
del Asistente y su CSS. Nginx `@reverse_proxy` apunta ahora a 4010; las rutas con
upstream explícito conservan sus destinos, incluido ROCKY API en 4009. Los procesos
ERP y mensajería originales siguen activos; el nuevo proceso solo sirve la web.
Los nuevos assets inmutables se añadieron al directorio usado por `@rocky_static`.

Backup Nginx: `/tmp/nginx-before-assistant-ui-20260924073135.conf`.
Reversión de interfaz: cambiar solo el upstream de `@reverse_proxy` de 4010 a 4000,
comprobar con `nginx -t` y recargar. Conservar los endpoints especializados.

Verificado: TypeScript, ESLint, build de producción, portada 200 y sus 17 assets;
ROCKY sigue como motor. En navegador se comprobó vista inicial vacía, respuesta a
«precio N12» con enlaces sin tarjetas y reinicio de conversación. A 390×844 el panel
ocupa el alto disponible, el input permanece visible y no hay overflow horizontal.

## Cantidades y adiciones repetidas — 24/09/2026

Código publicado: `3668168`, rama `codex/desarrollo-actualizado`.
La tarjeta incluye controles de cantidad y permite agregar nuevamente. El límite
descuenta las unidades ya presentes en el carrito. Las solicitudes «quiero comprar
3 unidades», «quiero 2» y «dame dos» conservan el producto seleccionado y usan la
cantidad indicada en el último mensaje.

Release: `/home/IMPORTADORA-releases/rocky1-quantity-3668168`, construido con el árbol
completo del commit publicado y dependencias independientes. Proceso PM2 guardado:
`importadora-rocky1-quantity`, localhost 4012. Nginx dirige `@reverse_proxy` y
`/api/shop-assistant` a este proceso; las otras rutas especializadas conservan sus
destinos. Los recursos inmutables se agregaron al directorio de `@rocky_static`.
No se aplicaron migraciones ni se crearon pedidos.

Verificación: 10 pruebas automatizadas aprobadas, compilación de producción exitosa,
prueba de API privada y pública con cantidades 12, 3 y 2, portada HTTP 200 y 15
recursos disponibles. En navegador se agregó PC28 dos veces con 2 unidades: el
carrito mostró 4 unidades y precio mayorista. Se retiró ese producto al terminar.

Respaldo y registros: `/home/IMPORTADORA-backups/rocky1-quantity-3668168/`.
Para revertir, restaurar únicamente los upstreams de `@reverse_proxy` a 4011 y
`/api/shop-assistant` a 4009, ejecutar `nginx -t` y recargar Nginx. Los procesos
anteriores siguen disponibles. El archivo `nginx.conf` del respaldo conserva la
configuración anterior completa; evitar sobrescribir cambios posteriores de otras
publicaciones al revertir.
