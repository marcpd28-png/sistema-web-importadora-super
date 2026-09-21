# Catálogos, fotos y tono — 21/09/2026

- Catálogo completo: enlace oficial `https://tiendavirtualsuper.com/?view=all`, sin listar códigos ni generar un PDF de toda la tienda.
- Catálogo específico: herramienta getCatalog reutiliza la selección comercial y el generador PDF de BC. Guarda un mensaje DOCUMENT en la conversación simulada, además del texto y del enlace con filtros de categoría/marca. Si falla el PDF, conserva el enlace y no afirma haberlo adjuntado.
- Parlantes JBL: selección de 40 productos con stock y foto, PDF de 20 páginas revisado visualmente. Enlace `/?view=all&category=parlantes&brand=JBL`. Las variantes del ERP pueden compartir imagen comercial.
- Fotos: primero hash exacto de imagen única, después OCR local y SKU visible. Se mejora lectura vertical y recorte ampliado de códigos candidatos. Dos lecturas del recorte deben coincidir con el candidato original, superar 70 de confianza OCR y corresponder a un único SKU visible. No se reparan letras ni dígitos. Las lecturas de confianza moderada requieren confirmación del cliente; 70 no es una probabilidad calibrada.
- La captura real del usuario permitió recuperar BT284. No se guarda esa foto en Git. Precio y stock se leen del ERP, no de los números impresos en la imagen.
- Sin identificación verificable, la visión ofrece candidatos o pide una etiqueta más clara. No se promete identificar exactamente cualquier foto.
- Respuestas más cálidas, con emojis moderados y enlaces pulsables; las afirmaciones comerciales siguen basadas en herramientas.

35 pruebas funcionales/seguridad aprobadas, TypeScript validado, PDF inspeccionado. La prueba HTTP cubre catálogo completo, catálogo JBL con documento accesible y filtros correctos, y fotografía BT284 en un contacto SIMULATOR nuevo.

La instancia utiliza un enlace de public/uploads a /home/IMPORTADORA/public/uploads para reutilizar imágenes y publicar PDFs en el almacenamiento existente. Antes de compilar con Turbopack se retira únicamente ese enlace (verificando su destino); se restaura al terminar. No borrar el directorio de destino.
