# Correcciones visuales de la tienda — 18 de septiembre de 2026

## Alcance aprobado

Se conservan los accesos de carrito, asistente y WhatsApp en el lateral derecho. Se corrige su formato y se ocultan mientras un panel abierto necesita el espacio. El buscador conserva sus medidas y el tamaño de la lupa: solo cambia su texto interior a «Buscar…».

## Cambios

- WhatsApp circular, verde, con icono blanco completo, centrado y sin recortar su contorno.
- Tarjetas con títulos legibles, precio mayorista visible, cantidad y acciones de 44 px. El carrusel deja de encajar seis columnas demasiado estrechas entre móvil y tablet.
- Portada móvil con cuatro productos por colección, acceso «Ver más» y banner sin espacio vacío inferior.
- Ficha con precios y compra antes de la descripción y las especificaciones, que quedan en una sección desplegable. Galería compacta que conserva la imagen completa y su ampliación.
- Categorías en una columna en móvil, botón de cierre, cierre al navegar, al tocar fuera y con Escape.
- Encabezado del formulario de envío con título y cierre en dos columnas.
- Asistente ajustado al alto disponible, también en horizontal. Las sugerencias dejan espacio al empezar a escribir.
- Atajos sin desplazamiento automático en móvil y con movimiento reducido.
- Textos de cuenta dirigidos al comprador y nombres de productos que conservan sus modelos y eliminan restos de saltos de línea del catálogo.

## Validación

Vista previa privada del VPS con componentes y catálogo reales, sin crear pedidos ni enviar mensajes. Comprobación en Chromium mediante tamaños de viewport; no equivale a una prueba física de cada modelo ni de Safari.

| Ancho (px) | Tarjeta destacada (px) | Desbordamiento horizontal | Recortes de precios/cantidad |
|---:|---:|---|---|
| 320 | 127 | No | No |
| 360 | 147 | No | No |
| 375 | 155 | No | No |
| 390 | 162 | No | No |
| 412 | 173 | No | No |
| 430 | 182 | No | No |
| 640 | 284 | No | No |
| 641 | 176 | No | No |
| 768 | 176 | No | No |
| 1024 | 225 | No | No |
| 1440 | 240 | No | No |

A 390 px, el buscador mantiene unos 190 px de ancho; a 320 px, unos 122 px, iguales a la auditoría inicial. El asistente a 844 × 390 queda entre y=8 e y=382. Se verificó el cierre de categorías al seleccionar una opción, la ficha, la adición y retirada de un producto del carrito y la apertura/cierre del formulario de envío. La portada medida a 390 px pasa de aproximadamente 29.524 a 15.744 px de altura; la cifra puede variar con el catálogo.

TypeScript y ESLint de los componentes modificados: sin errores. Cuatro pruebas de formato de nombres y reconciliación de carrito: aprobadas.

Evidencias en `exports/correcciones-movil-2026-09-18/`: portada a 390 y 641 px, ficha, formulario de envío y mediciones JSON.

## Pendientes de contenido y dispositivos reales

Las fotografías y afiches originales del catálogo necesitan revisión editorial: algunos contienen texto pequeño o muestran un producto distinto del nombre. No se sustituyen por imágenes inventadas. Quedan por comprobar en iPhone/Safari y Android físicos el teclado, las barras del navegador, las áreas seguras y el tamaño de texto del sistema.
