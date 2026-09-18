# BC: diagnóstico con consultas reales de la bandeja

Se revisaron 300 conversaciones recientes y se seleccionaron **150 casos de 150 conversaciones distintas, con 232 mensajes reales anonimizados**. Se ejecutaron por la API del simulador, n8n y el BC instalado en el VPS. Las pruebas muestran problemas relevantes de identificación de productos, interpretación de cantidades y conservación de preguntas entre mensajes.

Esta entrega establece una línea base reproducible. No modifica el buscador, no incorpora todavía un intérprete de IA y no activa respuestas automáticas a clientes reales.

## Resultados

| Medición | Resultado | Alcance |
| --- | ---: | --- |
| Casos ejecutados | 150 | Mensajes reales seleccionados y anonimizados; sin consultas sintéticas |
| Respuesta dentro de 90 s | 149/150 | El caso restante respondió después del plazo |
| Casos que pasan todos los controles automáticos | 75/150 | 73 fallan y 2 requieren revisión; no equivale a satisfacción del cliente |
| Solicitudes cubiertas | 86/174 | 84 fallan y 4 requieren revisión semántica |
| Precisión de productos mostrados | **73,9 %** | 184 pertinentes de 249 recomendaciones evaluables; códigos únicos por caso |
| Casos con productos ajenos a lo solicitado | **17** | Etiquetas completas; no contabiliza como incorrectos los casos sin resultado |
| Objetivos con productos disponibles que obtienen al menos una opción pertinente | **47/99 — 47,5 %** | Mide cobertura por objetivo/familia, no recall exhaustivo |
| Cobertura media de los catálogos | **32,3 %** | 16 solicitudes con referencia completa y productos disponibles; sin PDF se cuenta cero |
| Alertas de aclaración posiblemente evitable | 24 | Indicador automático, pendiente de adjudicación adicional |
| PDF entregados dentro del plazo y comprobados | 10/10 válidos | HTTP y cabecera PDF; la selección de productos se evalúa aparte |
| Importes en texto asociados a SKU comprobados | 236/236 coinciden | Contra la foto de precios; incluye repeticiones. No certifica que el producto cotizado sea el que pidió el cliente |
| Mediana / percentil 95 de respuesta | 12,503 s / 13,271 s | Solo respuestas dentro del plazo; incluye los 12 s de agrupación |
| Contactos temporales eliminados | 150/150 | Más 4 contactos de la prueba piloto, también eliminados |

La revisión asistida de las cuatro comprobaciones semánticas pendientes encontró fallos: catálogo sin precios, demostración en tienda y dos preguntas sobre originalidad. Considerando esa revisión, **75 casos pasan los controles definidos y 75 requieren corrección; 86 de 174 solicitudes quedan cubiertas y 88 no**. Las decisiones y sus motivos se conservan en [manual-review-2026-09-17.json](manual-review-2026-09-17.json). Esta revisión no sustituye una validación comercial del propietario.

## Fallos reproducidos que conviene corregir primero

| Caso | Consulta real | Respuesta observada | Resultado esperado |
| --- | --- | --- | --- |
| BC050 / BC056 | «Catálogo de los tv» / «Catálogo tv» | PDF con dos televisores y dos TV Box; omite otros televisores de la referencia | Catálogo de televisores, con tamaños y stock correctos; TV Box en otra familia |
| BC041 | «Necesito audífonos Bluetooth» | Incluye un audífono Tipo C con cable y un adaptador Lightning | Conservar Bluetooth como filtro y excluir adaptadores/cables |
| BC025 | «Tienes el ecoflow river 2 pro?» → «CP602» → «Necesito 01 unidad» | Encuentra CP602 y luego ofrece ocho productos ajenos al interpretar «unidad» como búsqueda | Mantener CP602 y aplicar cantidad 1 |
| BC102 / BC140 | Pregunta por Alexa Kids o aspiradora robot y luego «cuanto por caja» / «Caja» | Ofrece N2137, una caja controladora de carga solar, a S/ 280 | Interpretar caja/cajón como presentación o cantidad del producto en conversación |
| BC030 | «Maquinas de barberia» → «Clipper» → «Y shaver» → «Profesional» → «Trimer» | «Shaver» produce resultados SILVER: relojes y audífonos | Asociar clipper/shaver/trimmer con barbería; evitar correcciones ortográficas que cambien la familia |
| BC008 | «JBL Turner 3. Precio y stock…» → «JBL tuner 3» | La corrección identifica O1030, pero las solicitudes del texto anterior conservan otro tema pendiente | Corregir el tema original y resolver sus preguntas acumuladas |
| BC081 / BC124 | «Cargadores y audifonos inalambricos» / «Power Bank y audífonos» | La lista inicial cubre una sola familia; la otra queda fuera de los ocho resultados | Recuperar y presentar opciones por cada familia solicitada |
| BC133 | Cargadores originales Xiaomi/Redmi/Samsung | Incluye una marca SUPER y un producto denominado SEGUNDERO | Respetar marcas solicitadas y no afirmar originalidad sin confirmación |
| BC064 / BC075 / BC100 / BC119 | «Tablet de 32 pulgadas» | No encuentra la pantalla interactiva Android N2315 | Reconocer el nombre comercial que usa el cliente y confirmar el modelo pertinente |
| BC005 | «Catálogo de JBL» → «Catálogo solo de JBL» | Supera 90 s y luego entrega dos catálogos de 92 productos | Un único catálogo pertinente; controlar generación lenta y solicitudes equivalentes |

Estos ejemplos proceden de respuestas del simulador, no de una inferencia basada solo en el código. Las consultas con errores tipográficos y los mensajes breves se conservaron para no facilitar artificialmente la prueba.

## Calidad de los datos

La foto usada como referencia contiene **1.687 productos visibles con stock positivo**:

- **1.686** tienen vacío el campo `brand`; la búsqueda depende de inferencias sobre el nombre.
- **1** tiene ficha digital con estado `PUBLICADA`.
- **1** tiene especificaciones estructuradas.
- Hay categorías inconsistentes: el televisor Xiaomi de 55 pulgadas O872 figura en **ILUMINACION**.

La interpretación de lenguaje puede mejorar la identificación y el seguimiento de la conversación. Para confirmar autonomía, garantía, compatibilidad, conectores u originalidad, también hacen falta datos verificados y publicados. Cuando no existan, la respuesta correcta debe reconocer qué información falta.

## Siguiente cambio recomendado, ordenado por los fallos medidos

1. **Separar producto, filtros y operación.** Extraer tipo/modelo/marca/color/características por un lado y precio, stock, cantidad, caja/cajón, envío o catálogo por otro. Evitar que palabras como «unidad», «caja» y «color» inicien búsquedas de todo el inventario.
2. **Mantener temas y preguntas pendientes.** Las correcciones de nombre y los mensajes «uno», «por caja», «y el envío» deben referirse al producto correcto. Resolver cada solicitud pendiente una vez y reconocer cambios de tema.
3. **Completar familias y alias revisados.** TV ↔ televisor; tablet de 32 ↔ pantalla interactiva de 32; barbería ↔ clipper/shaver/trimmer. Proteger TV/TV Box, dispositivo/accesorio y las variantes de modelo. No convertir palabras desconocidas en cualquier término parecido del catálogo.
4. **Presentar resultados por cada solicitud.** Una lista global de ocho productos ordenada por marca puede ocultar otra familia pedida. Dar resultados o una falta de coincidencias explícita por cada familia.
5. **Incorporar IA como intérprete con salida estructurada**, después de fijar las reglas anteriores. La propuesta de la IA debe validarse contra el catálogo; no debe generar libremente precios, stock ni especificaciones. Comparar la versión nueva con esta línea base y con conversaciones nuevas antes de activarla.
6. **Completar fichas y mejorar la entrega de PDF.** Priorizar familias muy consultadas y registrar confirmación de atributos. Evitar dos PDF equivalentes por una reformulación y medir el tiempo de generación con y sin caché.

El siguiente despliegue de comportamiento debería aumentar la cobertura sobre los 99 objetivos disponibles y reducir los 17 casos con productos incorrectos, sin introducir diferencias en los importes comprobados ni omitir solicitudes adicionales. Los umbrales finales deben fijarse antes de evaluar la siguiente versión; no convertir el porcentaje de esta muestra en una promesa de precisión general.

## Trazabilidad y límites

- Muestra de entrada: 300 conversaciones recientes con mensajes de cliente, excluyendo contactos `SIMULATOR:`. Ventana desde `2026-09-17T00:00:00Z`; selección tomada a `2026-09-18T00:53:27Z` (17 de septiembre, 19:53 en Perú).
- Ejecución principal: `2026-09-18T01:04:48Z` a `01:16:49Z`, **17 de septiembre de 20:04 a 20:16 en Perú**, con hasta tres sesiones de prueba concurrentes y plazo de 90 s por caso. Cuatro casos piloto anteriores se excluyen de las 150 mediciones.
- Web evaluada: `058c452b7edee21245ed1ebbeb6a3d2e0b8f0d0e`; último cambio de aplicación `09c3a9201dab493821ff370fa1b601a3c614a1b1`. Motor: `fe81989fe6c9dc7e937892d8f55717f5f6155866`.
- Datos originales y relación con IDs reales: respaldo privado `/home/IMPORTADORA-backups/bc-inbox-eval-20260918/`. No se suben conversaciones originales, datos de contacto, cookies ni credenciales a Git.
- [Corpus anonimizado y modo de repetir las pruebas](../../scripts/bc-evaluation/README.md), [resultados por caso](baseline-2026-09-17.json), [revisión de preguntas semánticas](manual-review-2026-09-17.json).
- El conjunto se eligió para cubrir problemas comerciales; **no es una muestra aleatoria representativa de todos los clientes**. Predominan consultas de texto. Los mensajes de cada caso se reprodujeron juntos; no se evalúan imágenes, audios, pausas originales ni conversaciones largas con intervenciones alternadas.
- Hay 115 conversaciones de desarrollo y 35 reservadas, separadas por conversación pero con frases similares entre grupos. Ambos resultados están registrados como línea base. Las etiquetas se revisaron durante esta primera auditoría; una siguiente evaluación ciega requiere congelarlas y añadir conversaciones nuevas.
- El inventario cambia durante la operación. El comparador exige la foto de referencia correspondiente a las etiquetas. Un resultado histórico no debe usarse como precio o stock actual para un cliente.
- Verificación de esta entrega: 15 pruebas del evaluador/corpus, ESLint de los cuatro scripts, comprobación de diferencias y la ejecución integral descrita. No requiere recompilar ni reiniciar el BC: solo incorpora pruebas y documentación.

Metodología: [OpenAI Docs sobre evaluación con datos de producción y criterios específicos](https://developers.openai.com/api/docs/guides/evaluation-best-practices), [Stanford sobre precisión y recall](https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-of-unranked-retrieval-sets-1.html).
