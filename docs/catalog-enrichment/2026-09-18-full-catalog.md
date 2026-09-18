# Actualización del catálogo visible con stock

Aplicada el 17 de septiembre de 2026 por la noche, hora de Perú; verificación del 18 de septiembre a las 03:11 UTC. Alcance: **1688 productos/SKU visibles con stock**, no unidades físicas de inventario. La consulta final también devolvió 1688, sin SKU nuevos fuera de la instantánea.

Se procesaron los 1688 productos: **85 fichas anteriores conservadas**, **1321 nuevas publicadas** y **282 borradores**. Se añadieron **4910 atributos estructurados**, contando los de los borradores. No se afirma que todos sean datos de fabricante ni que todas las fichas estén completas.

| Estado del lote nuevo | SKU | Procedencia y alcance |
| --- | ---: | --- |
| Publicado | 73 | Documentación oficial de 56 modelos exactos |
| Publicado | 186 | Transcripciones revisadas de las imágenes ya asociadas al producto; valores anunciados |
| Publicado, parcial | 1062 | Características explícitas del nombre del catálogo; puede haber solo conexión, referencia o color |
| Borrador | 282 | Identificación o información técnica insuficiente para publicar |
| Total nuevo | 1603 | Los otros 85 perfiles permanecen intactos |

El total final es **1406 fichas publicadas y 282 borradores**. Entre las publicadas, sumando el lote anterior, hay 148 SKU con documentación de fabricante, 195 con datos anunciados en imágenes, 1062 parciales basadas en nombres y una ficha preexistente conservada.

## Fuentes y límites

Los datos y enlaces por modelo están en [research-all-2026-09-18.json](../../scripts/catalog-enrichment/research-all-2026-09-18.json). Las fuentes incluyen [Sony WF-C710N](https://www.sony.com/electronics/support/wireless-headphones-bluetooth-headphones/wf-c710n/specifications), [DJI Flip](https://www.dji.com/flip/specs), [DJI Mic 2](https://www.dji.com/mic-2/specs), [JBL Endurance Zone](https://www.jbl.com/ENDURANCEZONE.html) y [Xiaomi TV A Pro 55 2026](https://www.mi.com/ph/product/xiaomi-tv-a-pro-55-2026/specs/).

Las transcripciones están en [images-all-2026-09-18.json](../../scripts/catalog-enrichment/images-all-2026-09-18.json). Se ejecutó OCR sobre las imágenes existentes de 1603 SKU; 49 tuvieron error o archivo no disponible. El extractor propuso 249 candidatos, de los cuales se seleccionaron 186 para publicación después de revisar el texto. **No se realizó inspección visual exhaustiva de todas las imágenes ni se publicaron automáticamente todos los resultados OCR.**

Las fichas que solo usan nombres o imágenes indican su procedencia. No se convierten amperios a mAh, potencia comercial a RMS, señal admitida a resolución nativa ni una etiqueta «universal» a compatibilidad garantizada. El importador tampoco convierte el parecido de un nombre genérico en una marca original. La única marca propia reconocida es SUPER / Importaciones Super.

Casos destacados:

- `O846`: distingue 4 GB de RAM física y 8 GB virtuales dentro de los 12 GB anunciados.
- `CA605`: conserva la contradicción entre 240 W en el título y 100 W en la imagen, solicitando confirmar la etiqueta.
- `CP43`: registra 60000 mAh como dato anunciado en la imagen; no como capacidad medida ni conversión automática de «amperios».
- `O949`: distingue la capacidad oficial de Battery 600 del anuncio de 6000 mAh de la imagen y pide confirmar la unidad. No presume estuche ni segunda batería incluidos.
- `O1027-BLACK`: sustituye el texto técnico antiguo por los datos investigados de Watch 6 Active.
- `BT309`: publica únicamente la autonomía anunciada por su propia imagen, sin atribuirle especificaciones de unos audífonos JBL parecidos.
- `05737`: continúa en borrador porque su imagen parece corresponder a un taladro y el nombre a un control remoto. La imagen se conserva por instrucción del propietario.
- `O315`: queda pendiente de confirmar Wired/Wireless; no se aplican las características de una variante distinta de Endurance Run 2.

Los [282 borradores pendientes](2026-09-18-pending-research.json) incluyen motivo y enlace al producto. Ese listado no abarca todos los datos todavía faltantes en las 1062 fichas parciales publicadas. Las fuentes regionales se califican cuando alimentación, accesorios o conectividad pueden variar.

## Conservación y respaldo

Se modifican únicamente `Product.technicalSpecs`, atributos, perfiles digitales y registros de investigación/procedencia. Las descripciones comerciales, nombres, marcas del ERP, categorías, precios, stock, imágenes, variantes, videos y documentos no son objeto de esta actualización.

La comparación posterior verificó imágenes y relaciones de **los 1688 productos** contra la instantánea, y los hashes técnicos de las **85 fichas conservadas**. No cambió ninguna descripción comercial. Resultado: **0 imágenes añadidas y 0 reemplazadas**. El importador comprueba además todos los campos no técnicos dentro de cada transacción bloqueada para detectar escrituras inesperadas.

Respaldo privado: `/home/IMPORTADORA-backups/catalog-all-20260918/`. Contiene `before.json`, `plan.json`, `applied-backup.json`, `verification.json`, `after-targets.json`, los resultados OCR y `simulator.json`. No se incluyen en Git las exportaciones completas, credenciales ni resultados privados del simulador. La investigación se hizo desde Codex, sin agregar una clave de API de OpenAI.

La carga se ejecutó en transacciones de 40 SKU. Una segunda ejecución confirmó **1603 ya aplicados, 0 pendientes**. La restauración rechaza cambios técnicos posteriores; instrucciones en el [README del importador](../../scripts/catalog-enrichment/README.md).

## Comprobaciones realizadas

- **32/32 pruebas automáticas**, tanto locales como en el VPS, y ESLint dirigido aprobado.
- Ensayo de aplicación, repetición y restauración de tres productos: fabricante, imagen revisada y borrador. Los tres se restauraron antes de la aplicación general.
- Aplicación de 1603 perfiles y comparación exacta posterior de atributos, estado, resumen y texto técnico con el plan revisado.
- Fichas públicas de `O846`, `CA605`, `O1027-BLACK` y `CA609`: HTTP 200, datos esperados y referencia de imagen original presente en HTML. `A16`: página pública de ficha en preparación. Esta comprobación fue de respuesta HTML, no una evaluación visual exhaustiva.
- Web, motor del BC y n8n: HTTP 200 después de la carga.

Se probaron **10 consultas sintéticas de información por código** mediante el simulador real de administración → n8n → BC. Las diez respuestas se revisaron por contenido, además del transporte:

| Caso | Código | Resultado esperado y observado |
| --- | --- | --- |
| ALL01 | O1020 | Autonomía de audífonos/estuche y condiciones de ANC diferenciadas |
| ALL02 | O846 | RAM física y virtual separadas; procedencia de imagen explícita |
| ALL03 | CA605 | Contradicción de potencia explícita, sin elegir un valor arbitrario |
| ALL04 | CP43 | Capacidad anunciada en mAh con su salvedad |
| ALL05 | O1027-BLACK | Ficha nueva, IP68 e iOS 14 |
| ALL06 | A16 | Reconoce que no hay ficha técnica publicada |
| ALL07 | BT309 | 35 horas anunciadas; no inventa especificaciones de JBL |
| ALL08 | O949 | Capacidad oficial y conflicto con imagen; presentación por confirmar |
| ALL09 | O1006 | Datos DJI Flip con condiciones de autonomía y límite del combo |
| ALL10 | CA609 | Ficha parcial; USB-C no implica video ni velocidad de datos |

**10/10 consultas aprobadas para lectura de fichas**, cero respuestas adicionales observadas y diez contactos temporales eliminados, cero restantes. No se enviaron mensajes a clientes.

Estas pruebas no certifican la precisión general de búsqueda ni el seguimiento de conversaciones sin repetir código. El defecto previo de contexto documentado en el [lote inicial](2026-09-18.md) sigue fuera del alcance de esta actualización de datos. No se cambió código de ejecución de Next.js, esquema de base de datos ni lógica del BC; no se requiere recompilar ni reiniciar los servicios para leer estas fichas.
