# Auditoría individual de fotos del catálogo

La página **Requiere atención → Códigos incongruentes** compara cada fotografía con el código y nombre de su registro de inventario. Incluye foto ampliable, texto OCR, motivo, variante, enlace al editor, búsqueda, filtros y exportación CSV/JSON. Solo un administrador autenticado puede descargar el reporte. Las diferencias publicadas en el filtro de incongruentes requieren un contraste visual registrado; una lectura dudosa no se publica como diferencia confirmada.

## Alcance y significado

El inventario congelado para este barrido tiene 7.142 productos, incluidos los ocultos. Se registraron 5.917 fotografías asociadas a productos y 1.227 productos sin fotografía real. Una copia local y su URL de origen representan la misma foto; una URL utilizada por varios productos se procesa para cada registro. Galerías y variantes se incluyen. No se infiere el contenido visual del nombre de archivo ni del código esperado.

Cada fotografía recibe cuatro lecturas OCR: imagen completa con dos modos de segmentación, cabecera y pie. Se conservan SHA256, fecha, dimensiones, texto, confianza y posición de las lecturas. Este es un barrido automático individual, no una afirmación de inspección humana de las 5.917 fotos. El asistente contrasta visualmente los candidatos a discrepancia antes de publicarlos como incongruentes. La decisión comercial final corresponde al propietario.

Estados independientes:

- **Código congruente:** coincide la etiqueta normalizada; no certifica todos los detalles de la fotografía.
- **Códigos incongruentes:** una referencia impresa distinta fue contrastada visualmente. Una referencia base frente a un código con sufijo de color no implica una foto equivocada.
- **Nombre coincidente · código sin confirmar:** hay coincidencia textual suficiente; modelo y variante aún necesitan confirmación.
- **Por verificar:** evidencia insuficiente o varias referencias posibles. No se clasifica como incorrecta.
- **Sin foto:** únicamente una imagen genérica o ninguna fotografía.
- **Error de lectura:** imagen inaccesible o procesamiento fallido; se reintenta desde la fuente ERP conocida cuando corresponde.

Los resultados describen el snapshot, no futuras modificaciones del ERP. La interfaz advierte si cambió el nombre, código o URL del producto. El contenido sustituido manteniendo la misma URL requiere un nuevo barrido para comprobar su hash. No se cambiaron fotografías, códigos ni nombres del inventario.

## Reconocimiento de Rocky

Cuando no se confirma un código, Rocky contrasta palabras distintivas del nombre en al menos dos lecturas OCR. Exige un modelo alfanumérico coincidente o un conjunto más amplio de palabras; un nombre genérico no basta. Si hay varias referencias, muestra opciones y pide confirmar variante. Si solo hay una coincidencia por nombre, también pide confirmación y no afirma haber leído su código interno.

La auditoría impide utilizar como prueba suficiente un hash de portada asociado a cualquier discrepancia confirmada, incluidas las diferencias de variante. Ejemplo: el inventario **05737** dice control remoto, pero su foto muestra un taladro **N2339**. La fotografía equivocada no debe convertir el taladro en un control remoto por compartir archivo con ese registro.

Prueba real: al recortar el código superior de AU30, el simulador público reconoce «AUDÍFONO AK6 ARES», encuentra AU30 y solicita confirmación. También se comprobaron códigos enteramente numéricos, capturas, variantes, colisiones entre referencias y dos productos en una imagen. Esto no garantiza reconocer cualquier foto futura ni todas las variantes con exactitud.

## Operación reproducible

Los datos completos permanecen fuera de `public`, en `/home/IMPORTADORA-audits/catalog-images`. El directorio se configura mediante `CATALOG_AUDIT_DIR`; el servicio usa esa ubicación por defecto. No se añade un cron ni se altera el sincronizador ERP.

Para una nueva auditoría, elegir un directorio nuevo; `snapshot.mjs` rechaza sobrescribir un snapshot existente:

```bash
cd /home/IMPORTADORA-releases/rocky-20260921-r2
export CATALOG_AUDIT_DIR=/home/IMPORTADORA-audits/catalog-images-NUEVA-FECHA
node --env-file=.env scripts/catalog-image-audit/snapshot.mjs --execute
OMP_THREAD_LIMIT=1 CATALOG_AUDIT_WORKERS=3 nice -n 15 python3 scripts/catalog-image-audit/scan.py
python3 scripts/catalog-image-audit/retry.py
node --import tsx scripts/catalog-image-audit/report.ts
```

`scan.py` reanuda solo el mismo snapshot conservado. `retry.py` repite los errores y añade el nuevo resultado al registro; prevalece el último por ID. El reporte se publica mediante reemplazo atómico y se relee cuando cambia su fecha de modificación.

Las revisiones visuales se guardan en `visual-reviews.json`, mapa por ID de foto, con `sha256`, `status`, `printedCodes`, `note`, `reviewedAt` y `reviewer: ASSISTANT_VISUAL`. Solo se aplican cuando coincide el hash. Un candidato automático sin revisión permanece en **Por verificar**. No confundir esta revisión técnica con una aprobación del propietario.

## Despliegue y validación

Release activo: `/home/IMPORTADORA-releases/rocky-20260921-r2`, PM2 `importadora-rocky-web-v2`, localhost 4003. Se conservan tienda 4000 y router 4001. El slot anterior 4002 está detenido y disponible para reversión. Nginx incluye las rutas exactas `/admin/atencion` y `/api/admin/catalog-image-audit`, además de las rutas previas de Rocky. La configuración anterior se conserva en `/var/log/rocky/nginx-before-catalog-audit.conf`.

El build de Next.js finalizó correctamente. TypeScript y 42 pruebas unitarias pasaron. La verificación HTTP prueba autenticación, los seis filtros, recursos estáticos, exportaciones, integridad de IDs y reconocimiento real de una imagen sin código. El informe final de ejecución queda junto a este documento.

```bash
AUDIT_TEST_BASE=https://tiendavirtualsuper.com AUDIT_REQUIRE_COMPLETE=true node --env-file=.env scripts/catalog-image-audit/verify.mjs --execute
ROCKY_TEST_BASE=https://tiendavirtualsuper.com node --env-file=.env scripts/rocky/verify-image-codes.mjs --execute
```

El Excel entregado conserva una fila por fotografía y una por producto sin foto, evidencia, enlaces y columnas editables de validación del propietario. Los contadores por foto no deben presentarse como cantidad de productos únicos identificados.

## Resultado final del 21/09/2026

Barrido terminado a las 07:29 de Lima; reintentos y clasificación final publicados a las 07:32. Las 5.917 fotos se pudieron procesar: 12 archivos locales faltantes se recuperaron para la auditoría desde su URL ERP con las cabeceras del descargador de imágenes existente. No se repusieron ni cambiaron archivos públicos del inventario.

| Resultado | Fotos / registros |
| --- | ---: |
| Código congruente | 301 |
| Diferencia de código contrastada visualmente | 62 |
| Nombre coincidente, código sin confirmar | 1.897 |
| Por verificar | 3.657 |
| Error de lectura | 0 |
| Productos sin foto | 1.227 |

Se contrastaron visualmente 130 registros y quedaron cero candidatos automáticos de discrepancia pendientes de ese contraste. Las 62 diferencias incluyen referencias alternativas y sufijos de variante; no son 62 fotografías necesariamente equivocadas. Las 3.657 filas por verificar no se declaran correctas ni incorrectas.

Ejemplos que requieren atención: 05737 (control remoto con foto de taladro N2339), P581 (mini parlante KTS-1677 con foto P582/BTS-2101), O265-NEGRO (foto de audífonos blancos) y BT151 (foto blanca frente a variante amarilla). Cada fila conserva la observación exacta y la imagen para decisión del propietario.

La comprobación final reconcilió 7.142 productos y 7.144 filas: hay dos asociaciones de foto adicionales a las portadas. No hubo productos añadidos ni cambios de código, nombre o URL respecto del snapshot durante el barrido. El JSON de integridad documenta este control. El Excel y el CSV completos se entregan de forma privada; los datos de inventario oculto no se incorporan al repositorio.
