# Disponibilidad y fotos en BC

Regla general del 18 de septiembre de 2026:

- Catálogos, listas de opciones y recomendaciones usan productos visibles, con stock positivo y una foto de producto. Las imágenes genéricas y los videos no cuentan como fotos.
- Al generar PDF se verifica que al menos una fuente de imagen pueda abrirse. Los productos cuyas fotos fallan se omiten; también se omiten de códigos mostrados, conteos y manifiestos. La caché anterior no permite eludir esta verificación.
- Una consulta puntual a un producto publicado agotado responde «Este producto actualmente se encuentra sin stock». No expone su precio ni ficha ni inicia su compra.
- Si la consulta puntual corresponde a un producto sin foto, se informa que no tiene una foto disponible. Si tampoco tiene stock, se indican ambas condiciones.
- Los productos ocultos no aportan nombres internos, códigos, precios, enlaces o características a las respuestas. La identificación de un artículo oculto en el motor secundario produce solamente un aviso de no disponibilidad.
- Los casos sin disponibilidad son respuestas deterministas. No pasan a la redacción con IA. Se descarta la selección comercial obsoleta antes de seguir comprando.
- La agenda vuelve a validar visibilidad, stock, precio y fecha de actualización antes de publicar la respuesta. La regla se aplica también al motor secundario por texto, identificación visual y consultas de una selección anterior.

No modifica productos, existencias, precios ni la conexión de WhatsApp real. Las comprobaciones de stock cero utilizan fixtures; las pruebas HTTP solo crean conversaciones `SIMULATOR:` temporales.

Pruebas principales: `bot-product-availability.test.ts`, `catalog-pdf.test.ts`, `bc-request-agenda.test.ts`, `simulator-batch/agenda.test.ts` y, en la rama del motor, `router-v2-product-search.test.ts`.
