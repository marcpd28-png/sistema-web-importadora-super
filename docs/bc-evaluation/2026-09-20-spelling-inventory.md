# Prueba de ortografía y nombres incompletos — 20/09/2026

Se leyó el inventario publicado del VPS a las 21:37:21 UTC y se ejecutó localmente el selector modificado contra esa copia. No se modificaron productos, pedidos, configuración o workflows, ni se enviaron mensajes. No se desplegó la mejora.

## Resultados

- Inventario: 1.682 productos publicados, todos con stock en la captura; 133 marcas y 273 tipos detectados por el selector.
- Variantes generadas: 2.048. En 1.657 se conserva exactamente la selección de la consulta completa (80,9%). La versión anterior conserva 293 (14,3%) sobre los mismos casos e inventario.
- Las variantes cubren 174 tipos y 100 marcas del inventario; no todos los 273 tipos y 133 nombres de marca participan en esta generación.
- Cero regresiones entre las variantes que antes conservaban la selección.
- 332 variantes no encuentran resultados; 51 incluyen productos adicionales respecto de la consulta completa; otras ocho devuelven solo parte del conjunto esperado.
- Códigos exactos: 1.682 de 1.682 encuentran exclusivamente el producto esperado.
- Mensajes separados: 156 de 156 casos elegibles conservan familia, marca, cantidad y los cuatro mensajes de origen. Se eligen prefijos de cuatro letras que previamente encontraron correctamente el conjunto; no es una medición independiente de toda conversación posible.
- Regresión local: 71 pruebas aprobadas. ESLint del auditor correcto.

## Casos observados

Los prefijos de parlantes funcionan con marcas distintas de JBL: ZEALOT, KAPERH, LIDIMI, AIWA, TRONSMART, SONY y otras.

Los fragmentos que también son palabras completas tienen otros significados: `micro` encuentra referencias microSD, `carga` no conserva los resultados de cargador, `blue` se interpreta como azul y `esta` se trata como palabra de la conversación, por lo que puede dejar la consulta sin filtro. Estos casos necesitan desambiguación, no una sustitución automática universal. Los resultados adicionales son discrepancias frente a la consulta completa; no todos constituyen productos incorrectos para el texto ambiguo recibido.

También hay errores claros que requieren corrección: `lamapra` y `lamara`, generadas desde lámpara, incluyen 63 códigos adicionales por la aproximación a otra familia; `carera`, desde cartera, presenta el mismo problema. Debe corregirse la elección de familia por similitud antes de presentar la tolerancia ortográfica como resuelta. La ausencia de regresiones en los casos que antes pasaban no elimina estos fallos.

## Alcance y reproducción

Las variantes eliminan letras, intercambian dos letras contiguas o conservan prefijos de cuatro/cinco letras, sobre tipos alfabéticos de al menos seis letras y sus marcas. Los códigos se comprueban para todos los productos. La selección esperada de las variantes proviene de la búsqueda con el nombre completo del mismo selector: mide estabilidad y recuperación, no relevancia comercial etiquetada de manera independiente ni precisión del 80,9% en conversaciones reales.

No se prueba el transporte de WhatsApp, generación de PDF ni latencia del servidor. La captura permanece privada fuera de Git en `.cache/bc-inventory-current.json`, y los detalles en `.cache/bc-spelling-report.json`. Auditor reproducible: `scripts/bc-evaluation/spelling-audit.cjs`; instrucciones en el README de evaluación.

SHA-256 de la captura: `578ba8e60d1f89281b55762f88586e3890e5826540b810c37a013cefe21ba0f4`.

SHA-256 del selector auditado: `07a198fe43da767c045c9c6ce648f1174d567acb9403900a4bb779a39358bbe9`.
