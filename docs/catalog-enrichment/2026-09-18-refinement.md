# Revisión de especificaciones del catálogo

Actualización de datos aplicada el 18 de septiembre de 2026 UTC (17 de septiembre en Lima), por solicitud del propietario. Se revisaron los 1688 productos visibles, todos con stock en la comprobación final. No se agregaron ni reemplazaron imágenes.

## Resultado

| Indicador | Resultado |
| --- | ---: |
| Productos procesados y verificados | 1688 |
| Atributos estructurados | 8119 |
| Perfiles publicados | 1380 |
| Perfiles sin evidencia técnica suficiente para publicar | 308 |
| SKU con fuente de fabricante, incluyendo investigación anterior | 204 |
| SKU con características de imágenes existentes, incluyendo revisión anterior | 692 |
| SKU ampliados con nueva investigación oficial | 56 |
| SKU ampliados con transcripción revisada de su imagen | 643 |
| Textos públicos de relleno detectados tras aplicar | 0 |
| Cambios de imágenes, medios o descripciones comerciales | 0 |

Publicada no significa exhaustiva: también hay fichas básicas procedentes del nombre. Se omiten las características no respaldadas. Los 308 borradores mantienen únicamente la información básica disponible, sin publicar promesas de completar datos en las especificaciones.

## Criterios y correcciones

Se consultaron fuentes oficiales para modelos identificables y se revisaron transcripciones de las imágenes existentes para completar información. Las transcripciones OCR fueron revisadas editorialmente; no se afirma una inspección visual individual de las 1688 imágenes. Las imágenes ambiguas y cambios detectados se contrastaron visualmente. El plan vincula las transcripciones utilizadas con la imagen exacta de cada producto.

- Blackview MEGA 2 WiFi, Tab 20 Kids y LINK 8: corrección de procesador, pantalla, batería o sistema operativo siguiendo sus fichas oficiales; las imágenes de tienda contienen datos distintos.
- EcoFlow: distinción entre potencia continua, pico y X-Boost; corrección del conector XT60i del panel de 110 W y de las salidas USB-C de TRAIL 300 DC.
- QCY, JBL y otros auriculares: autonomía con y sin ANC, autonomía de audífonos frente al conjunto con estuche, y reducción de ruido de llamadas separada de ANC.
- Dahua H3A y H5A: corrección de resolución respecto de las imágenes.
- KZ Libra: impedancia de 25 Ω y sensibilidad de 108 dB según fabricante; se omite la configuración híbrida que la imagen no permite respaldar.
- Cooler PC403: dos ventiladores de 125 mm, 1000–1200 RPM, dos puertos USB y altura ajustable, transcritos de CARACTERÍSTICAS.
- Potencias PMPO conservan esa unidad; no se presentan como RMS. Los modelos o cifras contradictorios se omiten y se registran internamente.

Se limpiaron las especificaciones de toda la instantánea, el texto técnico de producto y los campos de descripción del perfil digital. La descripción comercial, nombre, precios, stock, categorías y medios se conservaron. La fuente y las notas editoriales quedan en ProductResearchRun/ProductResearchSource, separadas de la ficha pública.

Las referencias verificadas están en [el manifiesto de fabricantes](../../scripts/catalog-enrichment/research-refine-2026-09-18.json); las transcripciones, en [el manifiesto de imágenes](../../scripts/catalog-enrichment/image-manual-refine-2026-09-18.json).

## Verificación de aplicación

- 42 pruebas automatizadas aprobadas, incluyendo limpieza, unidades, RAM física/virtual, datos con ANC, identidad de imagen, hashes, límites de escritura, idempotencia y restauración de IDs/fechas. ESLint de los scripts nuevos aprobado.
- Comprobación inicial bloqueada antes de escribir por cambio externo de imagen en O1068. Se revisó su imagen actual y se regeneró el plan desde una nueva instantánea. La imagen no aportaba características adicionales legibles; se conservó la información básica.
- Piloto de tres productos: O846, PC403 y la ficha manual O702-NEGRO. Aplicación, segunda ejecución sin duplicados y restauración exacta aprobadas.
- Aplicación completa de 1688 productos. Segunda ejecución: 0 pendientes, 1688 ya aplicados.
- Verificación de atributos, perfiles, hashes de auditoría y medios de los 1688 productos.
- Siete páginas públicas comprobadas con características concretas; revisión en navegador de PC403.
- Tienda, motor BC y n8n responden HTTP 200.
- Diez consultas en el simulador administrativo: las diez recuperaron los atributos nuevos esperados, sin texto técnico de relleno ni respuestas tardías adicionales. Se eliminaron los diez contactos de prueba; cero pendientes. No se enviaron mensajes a clientes.

La prueba del BC valida la recuperación de las fichas por código, no la resolución de preguntas repartidas entre varios mensajes. El encabezado del BC sigue usando el nombre comercial del ERP: puede contener números de serie o una cifra comercial omitida de las especificaciones, como en CA605. Esa presentación y el defecto previo de contexto conversacional no se modifican con esta migración de datos.

Respaldo privado y plan: `/home/IMPORTADORA-backups/catalog-refine-20260918/`. `applied-backup.json` conserva el estado técnico anterior completo. `fresh.json` es la instantánea posterior al cambio externo de imagen. No se requiere compilación ni reinicio para esta actualización de datos y herramientas de importación.
