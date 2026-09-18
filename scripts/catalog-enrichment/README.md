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

## Alcance

Este es un lote inicial investigado, no una ficha completa para cada uno de los 1688 productos de la instantánea. Los demás productos requieren investigación posterior. Los 15 registros con texto técnico previo y la ficha publicada existente se conservaron.

Las pruebas de conversación confirman que el BC recupera las fichas nuevas, pero también reproducen un defecto previo de contexto en preguntas posteriores sin código. Consultar el informe del lote; no interpretar respuesta HTTP exitosa como conversación aprobada.
