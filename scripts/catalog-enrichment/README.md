# Especificaciones investigadas desde Codex

El lote `research-2026-09-18.json` contiene 44 modelos y 84 SKU: 75 SKU con fuentes de fabricante y 9 SUPER con las imágenes **ya existentes** en la tienda. La investigación se hizo en la conversación de Codex; el importador no llama a proveedores de IA ni necesita `OPENAI_API_KEY`.

Solo se actualiza `Product.technicalSpecs`, se crean los atributos `ProductSpecification` y se publica un `DigitalProductProfile` sin modificar las descripciones comerciales existentes. Esto permite que la ficha pública y el BC consulten los atributos. Se registra cada investigación y su procedencia en `ProductResearchRun` / `ProductResearchSource`.

No hay descarga, generación, subida ni modificación de imágenes. El importador compara las referencias y todas las relaciones de medios, variantes, documentos y videos, y comprueba que los precios, el stock, el nombre, las descripciones y los demás campos del producto no cambien durante su transacción.

## Criterios editoriales

- Usar el modelo exacto; compartir datos entre colores del mismo modelo, nunca entre generaciones parecidas.
- Separar potencia RMS con alimentación externa y con batería; autonomía con y sin ANC; autonomía de audífonos y estuche; resolución nativa y señal admitida.
- Los datos de las imágenes comerciales se presentan como **anunciados**, sin certificarlos como mediciones independientes.
- No convertir símbolos o ilustraciones en certificaciones, garantías vigentes, licencias de aplicaciones o compatibilidad universal.
- Los conflictos permanecen explícitos. HY400 Pro muestra Android 11 y 14 en la misma imagen. HY700/HY800 muestran un distintivo 8K, pero su lista indica Full HD nativo y compatibilidad 4K.
- No convertir automáticamente «amperios» a mAh: en CP42 se leyó 50000 mAh en la imagen de ese SKU.
- No sobrescribir fichas ni especificaciones anteriores: el lote inicial solo admite productos sin contenido técnico previo.

## Verificación y aplicación

```sh
node --test scripts/catalog-enrichment/apply.test.cjs
```

Ejecutar desde la raíz de la aplicación para cargar su entorno. La instantánea debe proceder de una exportación privada con `Product`, `digitalProfile`, `specifications`, `media`, `variants`, `documents` y `videos`, revisada antes de preparar el lote. No incluir credenciales ni exportaciones completas del inventario en Git.

Por defecto se ejecuta únicamente una comprobación de lectura:

```sh
node scripts/catalog-enrichment/apply.cjs --snapshot=/RUTA_PRIVADA/before.json
```

Aplicación explícita, con un respaldo nuevo fuera del repositorio:

```sh
node scripts/catalog-enrichment/apply.cjs --apply --snapshot=/RUTA_PRIVADA/before.json --backup=/RUTA_PRIVADA/applied-backup.json
```

La aplicación es una transacción atómica con bloqueo de los productos. Antes de escribir comprueba identidad, contenido técnico, disponibilidad y fotos contra la instantánea. Si alguien editó esos datos, aborta. Una segunda ejecución verifica los hashes y no duplica atributos ni investigaciones.

Restauración del lote, únicamente si no hubo ediciones técnicas posteriores:

```sh
node scripts/catalog-enrichment/apply.cjs --rollback --backup=/RUTA_PRIVADA/applied-backup.json
```

La restauración conserva los datos comerciales y medios actuales. Rechaza la operación si los atributos o el perfil han cambiado desde la importación.

## Alcance del lote inicial

`apply.cjs` es el importador del lote inicial investigado, no una ficha completa para cada producto. En ese lote se conservaron los 15 registros con texto técnico previo y la ficha publicada existente. La ampliación posterior se describe a continuación.

Las pruebas de conversación confirman que el BC recupera las fichas nuevas, pero también reproducen un defecto previo de contexto en preguntas posteriores sin código. Consultar el informe del lote; no interpretar respuesta HTTP exitosa como conversación aprobada.

## Ampliación a todo el catálogo visible con stock

El lote de `apply-all.cjs` procesa la instantánea de 1688 SKU: conserva 85 perfiles previos y crea 1603 perfiles con 4910 atributos. De los nuevos, 1321 se publican y 282 quedan en borrador. El resultado es **1406 fichas publicadas, muchas parciales**, y **282 borradores**; no equivale a 1688 investigaciones completas.

La procedencia de los nuevos atributos queda registrada por SKU:

- `research-all-2026-09-18.json`: 73 SKU / 56 modelos con fuentes oficiales.
- `images-all-2026-09-18.json`: 186 SKU con texto revisado de sus imágenes existentes. Se revisaron transcripciones OCR; no se afirma una inspección visual exhaustiva de todas las imágenes.
- `catalog-facts.cjs`: datos explícitos del nombre; 1062 fichas parciales publicadas y 282 borradores. No investiga en Internet ni completa características por semejanza.
- `catalog-image-candidates.cjs`: propone texto OCR para revisión; nunca publica automáticamente.

Cada ficha parcial identifica la procedencia de sus datos. Las unidades ambiguas, características ausentes y contradicciones se conservan como pendientes. El texto técnico antiguo solo se sustituye si existe evidencia de fabricante o una transcripción revisada de la imagen del SKU; las descripciones comerciales no cambian.

Preparar un plan privado a partir de una instantánea revisada:

```sh
node scripts/catalog-enrichment/prepare-all.cjs /RUTA_PRIVADA/before.json scripts/catalog-enrichment/research-all-2026-09-18.json scripts/catalog-enrichment/images-all-2026-09-18.json /RUTA_PRIVADA/plan.json
node --test scripts/catalog-enrichment/apply.test.cjs scripts/catalog-enrichment/catalog-all.test.cjs
node scripts/catalog-enrichment/apply-all.cjs --plan=/RUTA_PRIVADA/plan.json
```

Aplicar y volver a comprobar idempotencia:

```sh
node scripts/catalog-enrichment/apply-all.cjs --apply --plan=/RUTA_PRIVADA/plan.json --backup=/RUTA_PRIVADA/applied-backup.json
node scripts/catalog-enrichment/apply-all.cjs --plan=/RUTA_PRIVADA/plan.json
```

El respaldo se crea antes de escribir y no puede sobrescribirse. La aplicación utiliza **transacciones de 40 productos** con bloqueos; el lote completo no es una única transacción. Ante un fallo, los grupos anteriores quedan aplicados y puede reanudarse con el mismo plan y un archivo de respaldo nuevo para los pendientes. Se necesitan todos esos respaldos si después se restaura un lote reanudado.

Cada producto se comprueba antes y dentro de su transacción: código, nombre, imágenes y contenido técnico deben coincidir con la revisión. Los movimientos legítimos de precio y stock entre la instantánea y la ejecución no bloquean la actualización; el importador conserva todos los campos comerciales y medios durante cada transacción. El hash del plan incluye los atributos, su evidencia y el texto técnico que se escribirá.

Restaurar exclusivamente el contenido creado por el lote, siempre que no haya ediciones técnicas posteriores:

```sh
node scripts/catalog-enrichment/apply-all.cjs --rollback --backup=/RUTA_PRIVADA/applied-backup.json
```

Informe de ejecución: [actualización del catálogo](../../docs/catalog-enrichment/2026-09-18-full-catalog.md). Cola de 282 borradores: [investigaciones pendientes](../../docs/catalog-enrichment/2026-09-18-pending-research.json). Las fichas parciales publicadas también pueden necesitar ampliar o confirmar datos; no figuran en esa cola de borradores.
