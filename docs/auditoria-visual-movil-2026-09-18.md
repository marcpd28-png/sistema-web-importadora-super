# Auditoría visual móvil — Importaciones Super

Fecha: 18 de septiembre de 2026. Sitio observado: https://tiendavirtualsuper.com.

La tienda se adapta a pantallas estrechas, pero varios elementos se reducen demasiado y otros conservan dimensiones que dificultan la compra. Las primeras correcciones deben centrarse en tarjetas de destacados, botones, búsqueda y accesos flotantes. La identidad azul de la marca puede conservarse.

## Alcance y límites

Se inspeccionó el sitio público en el navegador de escritorio integrado, con tamaños de viewport representativos. Se revisaron portada, desplazamiento por colecciones, categorías, búsqueda con sugerencias, una ficha de producto, carrito con un artículo, formulario inicial de pedido, asistente, acceso, registro y pie de página. Se contrastaron los hallazgos con el código local.

Esto es una revisión responsive, no una certificación en todos los modelos físicos ni una ejecución de Safari iOS o Chrome Android reales. No se emularon sus motores, densidad, notch, barras del navegador, teclado ni escalado de texto del sistema. Las barras de desplazamiento de escritorio consumen aproximadamente 15 px en varias capturas; por eso se registraron tanto el viewport como el ancho útil. No se atribuyen pequeños desplazamientos laterales de la emulación al hardware de un teléfono.

Se agregó temporalmente un artículo al carrito para inspeccionar los paneles y después se retiró. No se registraron pedidos, cuentas, pagos ni mensajes. No se modificó código de la tienda.

### Matriz de tamaños

| Familia de pantalla | Viewports probados (px CSS) |
|---|---|
| Compacta y equipos antiguos | 320 × 568, 360 × 800, 375 × 667 |
| Tamaño habitual de iPhone y Android | 390 × 844, 393 × 852, 412 × 915, 414 × 896 |
| Pantallas grandes | 430 × 932, 440 × 956, 480 × 960 |
| Intermedia, útil para plegables abiertos y tabletas pequeñas | 768 × 1024 |
| Horizontal | 844 × 390 |
| Límites del CSS, con 900 px de alto | 640, 641, 760, 761, 920 y 921 px de ancho |

La matriz completa se aplicó a la portada. Los recorridos principales se inspeccionaron a 390 × 844; el formulario de pedido también a 320 × 568, 430 × 932 y 844 × 390; el asistente a 320 × 568 y 844 × 390. No se afirma haber probado cada recorrido en cada tamaño.

## Correcciones prioritarias

### 1. Alta — Corregir el salto a seis tarjetas de destacados

**Comprobado:** a 640 px, una tarjeta mide aproximadamente 284 px; a 641 px pasa a 85 px. A 768 px se muestran seis tarjetas de unos 106 px: los precios quedan recortados y «Añadir» y «Consultar» se enciman. El contenido de una tarjeta mide 119 px, aunque su ancho interior es de 104 px.

**Corrección:** establecer un ancho mínimo útil de tarjeta, inicialmente 160–180 px, y hacer que el número de columnas dependa del espacio disponible. En destacados puede mantenerse un carrusel con tarjetas de ancho estable o una cuadrícula de dos/tres columnas. El cambio de orientación no debe activar seis columnas estrechas.

**Código:** `src/app/globals.css:15076` calcula seis columnas del carrusel hasta 1500 px; la alternativa compacta comienza en `:15137`, dentro del corte de 640 px.

**Aceptar cuando:** a 640/641, 760/761 y 844 px se lean precios completos y no se superpongan acciones.

### 2. Alta — Dar tamaño cómodo a los controles de compra

**Comprobado:** en destacados, «Añadir» tiene 27 px de alto y letra de 9,28 px. Los controles +/− del carrito miden 28 × 28 px. «Completar pedido» mide aproximadamente 33,6 px de alto y usa letra de 10,72 px. El botón principal de la ficha mide 36 px de alto.

**Corrección:** usar objetivos táctiles de 44–48 px como meta de comodidad; mantener texto de acciones de 14–16 px y separación entre controles. Priorizar añadir, incrementar cantidad, continuar y cerrar. Los 44 px corresponden al criterio reforzado de W3C, no al mínimo universal de conformidad AA. [Referencia W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).

**Código:** `src/app/globals.css:15234`, `:7507`; `src/components/catalog/cart-drawer.tsx` y `product-detail-view.tsx`.

### 3. Alta — Evitar que carrito, asistente y WhatsApp tapen productos

**Comprobado:** los tres accesos flotantes forman una columna de unos 131 px de alto. Al desplazarse, cubren imágenes, títulos, precios o botones de la tarjeta derecha. También permanecen encima del menú de categorías.

**Corrección:** reservar un área propia para las acciones principales, por ejemplo una barra inferior compacta con espacio equivalente al final de la página. Otra opción es agrupar ayuda y WhatsApp en un único acceso desplegable. Ocultar los accesos secundarios cuando otro panel está abierto. Evitar apilar además un botón fijo de compra en la ficha: debe existir una sola zona de acciones persistentes.

**Código:** `src/components/catalog/store-side-actions.tsx`; `src/app/globals.css:13321` y `:16822`.

### 4. Alta — Ampliar buscador y sugerencias

**Comprobado:** a 390 px el campo dispone de unos 190 px; a 320 px, unos 122 px. El placeholder se corta. Las sugerencias aparecen como una columna estrecha y un solo nombre consume varias líneas. El texto del campo está a 12,48 px.

**Corrección:** una segunda fila de búsqueda de ancho completo o un buscador expandible al tocarlo. Las sugerencias deben ocupar casi todo el ancho del teléfono, con margen lateral de 12–16 px, nombres legibles, código secundario y altura que se ajuste al espacio visible. Acortar el placeholder a «Buscar producto o código». Llevar el campo a 16 px y comprobar el enfoque con teclado real en Safari.

**Código:** `src/components/catalog/header-search.tsx:265`; `src/app/globals.css:15363` y `:16621`.

### 5. Alta — Mostrar el beneficio mayorista de forma consistente

**Comprobado:** la sección destacada oculta el precio mayorista, el mínimo de unidades y la cantidad en móvil. Otras colecciones sí muestran esos datos. Los nombres destacados usan 10,88 px y una sola línea; algunos quedan reducidos a «HONOR CHOICE…». En las tarjetas regulares también se corta la etiqueta de la condición mayorista.

**Corrección:** unificar la información comercial: nombre en dos líneas de aproximadamente 14 px, precio unitario, «Desde 3 unidades» y precio mayorista. Si falta espacio, reducir adornos o acciones secundarias antes que ocultar esta condición.

**Código:** `src/app/globals.css:15190`, `:15206` y `:15216`.

### 6. Media — Reducir el espacio anterior a los productos

**Comprobado:** el encabezado ocupa unos 117 px. En 320–390 px de ancho, el banner ocupa alrededor de 293 px. La primera tarjeta comienza cerca de y=593; en 320 × 568 ningún producto entra en la primera vista. El banner utiliza una imagen horizontal de 1920 × 731 dentro de un contenedor móvil mucho más alto, con zonas amplias de fondo y textos pequeños.

**Corrección:** preparar una creatividad móvil con un mensaje, pocos productos y una acción visible; como punto de partida, una altura de 160–200 px. El componente ya admite `mobileImageUrl`. Reducir el espacio entre el título de destacados, «Ver más» y las tarjetas. Mantener el encabezado compacto al desplazarse.

**Código:** `src/components/catalog/hero-banner-visual.tsx:104`; `src/app/globals.css:15106`.

### 7. Media — Acercar el precio y la compra en la ficha

**Comprobado:** en la ficha del parlante TF-Y06, a 390 × 844, el título aparece cerca de y=639 y «Añadir al carrito» cerca de y=1114. Antes del precio hay imagen, nombre repetido y especificaciones.

**Corrección:** ordenar nombre, imagen, precio y compra antes de las especificaciones extensas. Colocar especificaciones en un bloque desplegable. Evaluar una zona inferior persistente con precio y añadir, coordinada con la propuesta de acciones del punto 3.

**Código:** `src/components/catalog/product-detail-view.tsx:215`; reglas de imagen en `src/app/globals.css:16153`.

### 8. Media — Hacer que categorías se cierre al elegir destino

**Comprobado:** el menú primero abre un panel casi vacío con tres opciones. Al entrar en categorías aparecen dos columnas con nombres que ocupan hasta cuatro líneas. Al seleccionar «Parlantes», cambió la URL y cargaron los productos, pero el menú permaneció abierto sobre ellos.

**Corrección:** abrir directamente una lista de categorías, cerrar al navegar, incorporar un cierre visible y fondo de separación. En teléfonos estrechos, una columna con nombres cortos. Unificar categorías parecidas y corregir nombres como «Utencillos» y «Parlante Inteligentes».

**Código:** `src/components/catalog/public-store-category-menu.tsx:122` y `:174`; no hay cierre asociado al enlace elegido.

### 9. Media — Corregir encabezado del formulario de pedido

**Comprobado:** el título queda apretado a la izquierda y el botón rojo de cierre se sitúa en el centro, dejando vacío a la derecha. El CSS define tres columnas (`1fr auto 1fr`), mientras el encabezado tiene dos hijos.

**Corrección:** dos columnas, `minmax(0, 1fr) auto`, título alineado a la izquierda y cierre en la esquina superior derecha. Conservar los campos de 16 px ya presentes. Mantener el pie de acciones accesible durante el desplazamiento interno.

**Código:** `src/app/globals.css:7038`; `src/components/catalog/cart-drawer.tsx:449`.

### 10. Media — Ajustar el asistente a poca altura

**Comprobado:** a 844 × 390 el panel tiene 370 px de alto y empieza en y=−15: su borde superior queda fuera de pantalla. A 320 × 568, encabezado, sugerencias y formulario dejan una zona muy pequeña para la conversación.

**Corrección:** limitar el panel por los márgenes superior e inferior disponibles, usar unidades de viewport dinámico donde corresponda y permitir que la conversación ocupe el espacio restante. Reducir/plegar sugerencias después del primer mensaje. Comprobar el teclado real: las unidades `dvh` por sí solas no garantizan todos los comportamientos del teclado.

**Código:** `src/app/globals.css:13262` y `:13710`; `src/components/catalog/store-assistant.tsx:831`.

### 11. Media — Limpiar imágenes y nombres de catálogo

**Comprobado:** varias imágenes son afiches con múltiples artículos, letras y precios impresos, ilegibles en miniatura. En otras tarjetas se ve una foto limpia. Los nombres contienen mayúsculas, códigos y restos como «cod.»; el formateador elimina todo lo que está entre paréntesis, incluyendo modelos útiles. En la ficha TF-Y06 el modelo desaparece del título comercial.

**Corrección:** foto principal de un solo producto sobre fondo uniforme; afiches como imágenes secundarias ampliables. Definir un nombre comercial corto que conserve marca/modelo y dejar el código como dato secundario. Revisar también productos cuyo nombre incluye secuencias como `_x000D_`.

**Código:** `src/lib/product-name.ts:1`; `src/components/catalog/product-media-frame.tsx`; datos del catálogo.

### 12. Media — Reducir longitud de inicio y movimiento continuo

**Comprobado:** en 390 × 844, la portada medida tiene unos 29.524 px de alto, aproximadamente 35 alturas de viewport. Las tarjetas de destacados miden unos 173 px de alto; las primeras tarjetas de la siguiente colección, unos 518 px. Los atajos superiores se desplazan automáticamente mientras se intenta leerlos.

**Corrección:** mostrar menos productos por colección, jerarquizar las categorías principales y mantener «Ver más». Unificar proporciones de tarjetas. Hacer los atajos desplazables con el dedo; si se conserva el movimiento automático, incorporar pausa y respetar la preferencia de movimiento reducido en la lógica JavaScript.

**Código:** `src/components/catalog/scrolling-shortcuts-marquee.tsx:79`; `src/app/page.tsx`; `src/app/globals.css:15054`.

### 13. Baja — Simplificar identidad y acceso de clientes

**Comprobado:** la cabecera no muestra el logotipo; el acceso usa «Login» y «Cuenta usershop». La pantalla del comprador destaca texto y acceso a la administración. El logo sí aparece en el pie de página.

**Corrección:** mostrar una marca compacta en la cabecera; usar «Mi cuenta», «Ingresar» y «Crear cuenta». Mantener la pantalla de clientes centrada en sus pedidos y datos. Aprovechar el botón de inicio para la marca sin estrechar más el buscador.

## Qué conservar

- Identidad azul y contraste del botón principal.
- Dos columnas en el catálogo estrecho como base, ajustando legibilidad y controles.
- Imágenes que preservan el producto completo y opción de ampliación en la ficha.
- Formulario de pedido con campos de 16 px, modalidades de entrega identificables y desplazamiento interno.
- Carrito a pantalla completa en móvil y total situado cerca de la acción para continuar.
- Ausencia de desbordamiento horizontal global en la portada de los tamaños medidos. Esto no elimina los recortes internos detectados en tarjetas.

## Validación específica pendiente en equipos reales

En iPhone/Safari: enfoque y zoom de campos, teclado abierto, barras del navegador al desplazarse, orientación horizontal, áreas seguras de notch/indicador inferior y aumento de texto. En Android/Chrome: teclado Gboard u otro instalado, navegación por gestos y tres botones, tamaño de fuente del sistema y orientación. Añadir Samsung Internet y un plegable si son relevantes para los clientes.

El CSS ya emplea `safe-area-inset-bottom` en algunas acciones; no conviene afirmar que falta toda protección. El viewport observado es `width=device-width, initial-scale=1`. Si se decide extender el sitio hasta los bordes con `viewport-fit=cover`, hay que aplicar los insets a todos los bordes afectados y verificarlo en Safari. [Explicación de WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).

## Orden propuesto de trabajo

1. Resolver seis columnas estrechas, controles táctiles y superposición de accesos.
2. Ampliar búsqueda y unificar tarjetas con precio mayorista visible.
3. Optimizar banner, ficha, menú de categorías y encabezado del pedido.
4. Ajustar asistente y comprobar teclado/orientación en dispositivos reales.
5. Normalizar fotos, nombres, acceso y longitud de la portada.

No hace falta crear un diseño distinto para cada modelo: conviene cubrir rangos de ancho, altura, tamaño de texto y comportamientos de navegador, y comprobar los límites de cada cambio de diseño.

## Evidencias

Capturas y medidas: [carpeta de auditoría](../exports/auditoria-movil-2026-09-18/).

Galería: [informe visual](../exports/auditoria-movil-2026-09-18/informe.html).

Datos de portada: [mediciones de 12 tamaños](../exports/auditoria-movil-2026-09-18/mediciones-inicio.json) y [mediciones de límites CSS](../exports/auditoria-movil-2026-09-18/mediciones-cortes.json).
