# Carrusel visual del simulador

El simulador agrupa tarjetas de producto consecutivas en un carrusel horizontal: imagen, selección accesible por imagen y una pregunta breve fuera del carrusel. No muestra captions de nombre, código, precio ni características debajo de cada imagen.

El lote inicial conserva un máximo de cinco tarjetas. Esto deja margen dentro del límite habitual de diez elementos del Generic Template de Messenger. Los metadatos internos mantienen `productCard`, `productCode` y la imagen para que un adaptador futuro pueda traducir cada tarjeta a un elemento con imagen y postback, sin depender de texto visible.

El carrusel y los lotes posteriores pertenecen exclusivamente al simulador local. No conectan, activan ni envían tráfico a Messenger, Meta, Telegram u otro canal. El adaptador futuro deberá aplicar por su cuenta los límites y requisitos vigentes de la plataforma antes de publicar.

## Invariantes del motor conversacional

- El contexto no es una sola consulta mutable: se reconstruyen líneas de compra independientes desde los turnos del cliente. Cada línea conserva su filtro, selección verificable, cantidad y estado (`searching`, `catalog-delivered` o `selected`).
- Una frase que introduce una línea adicional, como “también” o “además”, abre una búsqueda nueva sobre todo el inventario elegible. No arrastra restricciones de la línea anterior; las líneas anteriores siguen disponibles para referencias posteriores.
- Una confirmación pendiente de **catálogo completo** tiene prioridad estricta sobre selección, pago y paginación. Su única salida automática es el PDF filtrado y una frase breve; si falla, se informa el fallo sin mostrar otro lote.
- La paginación solo responde a la invitación explícita de “siguiente lote”. Nunca responde a una confirmación de catálogo completo.
- La recuperación usa únicamente datos verificables del catálogo: nombre, código, marca, categoría, descripción y especificaciones. La normalización morfológica y los grupos de equivalencia son diccionarios deliberados y extensibles; las coincidencias siguen requiriendo respaldo en esos campos y elegibilidad comercial.
- Los conteos, marcas, categorías y textos de descubrimiento se calculan desde el resultado actual; no dependen de una categoría, marca o número fijado en código.
