# Rocky: lectura de códigos en fotos y capturas

21/09/2026. El lector usa los códigos visibles actuales del inventario, en lugar de aceptar únicamente una expresión regular de códigos alfanuméricos. Admite códigos numéricos, cortos, espacios, paréntesis y variantes. La comprobación de formatos resolvió los 1679 códigos visibles consultados durante la prueba; esto mide cobertura de formatos, no precisión visual.

## Comportamiento

- Conserva coincidencia exacta por hash de imágenes originales del catálogo. Las capturas modificadas pasan por OCR local.
- Escanea imagen, cabecera, pie, regiones, canales de color y recortes; intenta rotaciones cuando no logra confirmar. Exige dos lecturas coincidentes con confianza OCR mínima de 70. Esa confianza no es una probabilidad calibrada de acierto.
- No sustituye O por 0 ni inventa dígitos para conseguir coincidencias.
- Cruza códigos impresos con referencias explícitas del nombre (`(N1382)` o `COD BT23`). Conserva las colisiones y pide confirmación; no elige automáticamente color o variante.
- Si encuentra varios productos distintos, consulta y presenta hasta seis por respuesta, con precio y stock actuales. No garantiza detectar todos los productos de una composición.
- Una foto nueva limpia la selección anterior. Las solicitudes de atención humana mantienen prioridad.
- Límites: imagen 4 MB / 12 MP en OCR; presupuesto Python 18 segundos, proceso 22 segundos, un OCR por proceso web. Requiere Python 3, Pillow y Tesseract inglés. El script `scripts/rocky/image-code-ocr.py` debe distribuirse junto con el servidor.

## Evidencia

`evaluate-photos.ts` seleccionó 24 fotos locales de productos visibles, con diversidad de categorías, y produjo capturas reducidas a 500 px, borde y JPEG calidad 75. Se comparó el mismo conjunto antes y después:

| Resultado | Antes | Después |
|---|---:|---:|
| Imágenes con alguna lectura de código | 7 | 16 |
| Sin lectura confirmada | 17 | 8 |

El nuevo resultado contiene 12 identificaciones únicas y 4 casos que requieren elección. Los cuatro son BT23, BT28, AU147 y CE103. Los códigos leídos en las 16 imágenes se revisaron contra las etiquetas y referencias; no es una estimación representativa de precisión en todas las fotos de clientes.

Los JSONL conservan comparación contra el código ERP de origen, que **no es ground truth visual**: por ejemplo, el producto ERP 05703 muestra N1123 y Q28; G15E muestra N1382. Comparar únicamente texto OCR con código ERP clasificaría estas lecturas válidas como errores. La foto asociada a 05737 es un taladro N2339 aunque el nombre del registro describe un control remoto: ese caso permanece sin identificar; no se modificó la información del ERP.

Siguen sin lectura confirmada las capturas de 05737, 06778, 101-16, CB08, CP151, Kaperh 220, L02 y L05. Algunas no muestran código del inventario y otras tienen etiquetas pequeñas que el OCR no resuelve con suficiente confianza. Cuando no hay evidencia, Rocky solicita una etiqueta más cercana o el código escrito.

Pruebas adicionales: captura reportada BT284; alias N1382 → G15E; variante AU147; colisión BT23; composición B7 + CP588. Los resultados HTTP locales se guardan en `image-code-http.jsonl` y los públicos en `image-code-public.jsonl`. Las 38 pruebas automatizadas pasaron, junto con TypeScript, ESLint de los archivos cambiados y build Linux. La evaluación incluye pruebas del comportamiento y de la prioridad de atención humana; no envía mensajes a clientes reales.

## Operación

Release `rocky-20260921-r2`, PM2 `importadora-rocky-web-v2`, localhost 4003. Nginx deriva únicamente las seis rutas del bloque Rocky. La tienda conserva su proceso original. Antes de compilar, `public/uploads` no debe ser un enlace fuera del proyecto; después se enlaza al directorio de cargas de la tienda para servir imágenes y PDF. La versión anterior queda detenida y disponible para reversión.
