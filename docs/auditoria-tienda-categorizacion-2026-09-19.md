# Auditoría de organización de la tienda — 19 de septiembre de 2026

## Dictamen y alcance

La tienda tiene una base útil —buscador visible, imágenes, precios y compra directa—, pero su organización actual no es suficientemente clara para quien compra por primera vez. La prioridad es corregir la relación entre lo que promete cada enlace y lo que muestra, antes de cambiar la apariencia.

Se revisó la tienda pública https://tiendavirtualsuper.com/ como visitante sin iniciar sesión, en escritorio y a 390 × 844 px; las primeras páginas de sus 31 categorías activas (470 productos distintos); los siete atajos bajo el buscador; una ficha de producto; y ocho categorías adicionales que aparecen desde esa ficha. También se revisaron las reglas del código local.

Los conteos corresponden a lo mostrado durante la auditoría. Las categorías con paginación se muestrearon en su primera página: **no son un censo de todo el inventario**. Los seis atajos distintos de Más vendidos se revisaron completos: no mostraron enlace a una página siguiente. Más vendidos sí tiene paginación. No se verificó el volumen real de ventas del ERP ni una cuenta autenticada de cliente estándar. La conexión local a la base de datos no estuvo disponible. Los errores observados en la web son evidencia directa; las causas descritas desde el código local deben contrastarse con la versión desplegada antes de implementar.

Este entregable es un diagnóstico y una propuesta. No se modificaron productos, precios, categorías, código de la aplicación ni la tienda publicada.

## 1. Experiencia de entrada

**Lo que conservaría:** buscador prominente, botón de categorías accesible, agrupaciones con «Ver más», imágenes y precio unitario en cada tarjeta, compra sin pasos innecesarios. En móvil, el precio unitario aparece antes del mayorista.

**Lo que cambiaría:**

1. **La portada prioriza volumen de catálogo, no una selección comercial deliberada.** El servidor escoge hasta 12 categorías con más productos publicables, descarta las que tienen menos de seis y muestra hasta ocho productos de cada una. Eso favorece categorías grandes, incluidas las mezclas de Hogar y Novedades. No significa que sean las más demandadas. Propondría una cuadrícula inicial de familias y después 4–6 bloques elegidos por utilidad, disponibilidad y ventas verificadas.
2. **El banner es poco informativo en móvil.** Se reduce una composición con muchos productos y texto diminuto. Propondría una imagen específica para móvil, una frase breve y un enlace comercial concreto. Es una observación visual, no una medición de conversión.
3. **Los accesos móviles más visibles incluyen dos destinos vacíos.** Más vendidos, Ofertas y Preventa ocupan casi toda la primera vista de la franja. Familias con producto disponible quedan fuera de ella.
4. **La franja se mueve y repite en escritorio.** El código detiene el movimiento en pantallas pequeñas y con preferencia de movimiento reducido, pero en escritorio corriente sigue desplazándose. Recomiendo enlaces estables y desplazamiento manual cuando no quepan.
5. **Los listados carecen de controles visibles para reducir resultados.** Hay soporte de ordenación por URL en el código, pero la vista revisada no ofrece controles de precio, marca, tipo o disponibilidad. Añadir contador de resultados, filtros y ordenación visibles.
6. **Se repiten variantes como productos independientes.** JBL Tune 110 azul/negro, mouse Enkore negro/rosa y relojes de distintos colores ocupan varias posiciones. Agrupar por modelo con selector de color, conservando SKU y stock de cada variante. No fusionar automáticamente artículos que solo parezcan iguales.
7. **Las tarjetas muestran textos y fotografías con información comercial redundante.** Algunas imágenes incluyen precios impresos además del precio de la web. Esto obliga a mantener ambos sincronizados. Conviene usar foto limpia del producto en el listado y guardar las piezas promocionales como imágenes secundarias.
8. **El lenguaje sigue orientado al mayorista.** Para una compra individual, mostrar «Precio por unidad» y, en segundo plano, «Desde 3 unidades». No llamar oferta a un precio por cantidad. Cuando ambos precios son iguales, evitar presentar un ahorro inexistente.
9. **«Siguiente página» al final de la portada cambia de agrupaciones a una grilla general.** Reemplazar ese acceso por «Ver todos los productos» con un destino estable, y reservar la paginación para listados.

La conveniencia de páginas de categoría que prioricen subcategorías se apoya también en [la investigación de Baymard sobre categorías intermedias](https://baymard.com/research-articles/ecommerce-sub-category-pages). La estructura concreta que sigue es una propuesta para este catálogo, no un resultado de pruebas con sus compradores.

## 2. Los siete enlaces bajo la lupa

| Enlace | Resultado observado | Evaluación y propuesta |
|---|---|---|
| [Productos más vendidos](https://tiendavirtualsuper.com/?collection=mas-vendidos) | 24 productos en la primera página y paginación. La portada muestra «Productos destacados», cuyo «Ver más» lleva aquí. | El nombre es apropiado solo si existe un ranking verificable. El código permite mostrar el catálogo general cuando no recibe códigos de ventas. Usar «Más vendidos» con datos reales y periodo; si faltan, «Destacados» con una selección editorial coherente, sin completar el ranking con productos ajenos. |
| [Ofertas](https://tiendavirtualsuper.com/?collection=ofertas) | Cero productos. | Retirar temporalmente el atajo. En el código se traduce a `isFeatured`, que no demuestra descuento. Publicar aquí únicamente promociones vigentes, con precio habitual, precio promocional y condiciones. No es posible proponer SKU concretos en oferta sin esos datos. |
| [Preventa](https://tiendavirtualsuper.com/?collection=preventa) | Cero productos. | Retirar temporalmente. Actualmente se busca la palabra «preventa». Requiere un estado explícito y condiciones de reserva y entrega. Un producto sin stock no es automáticamente preventa. No inventar productos ni fechas. |
| [Proyectores](https://tiendavirtualsuper.com/?collection=proyectores) | 24 productos: 18 proyectores y seis pantallas/ecranes. El menú «Proyectores» tiene solo seis productos. | Mantener «Proyectores» para equipos y mostrar «Pantallas y accesorios» como subcategoría. Alternativa: «Proyectores y pantallas» si se desea una colección mixta. Ambos accesos deben apuntar a la misma familia. |
| [Drones](https://tiendavirtualsuper.com/?collection=drones) | Cuatro: E88, DJI Flip, DJI Neo 2 y DJI Avata 360. La categoría del menú contiene únicamente E88 y DJI Flip. | El nombre y los cuatro resultados son coherentes por su denominación. Incorporar Neo 2 y Avata 360 a la misma categoría. Mantener repuestos y accesorios aparte si los hubiera. |
| [Alexas](https://tiendavirtualsuper.com/?collection=alexas) | Cuatro: Echo Spot, Echo Dot, Echo Show y enchufe Wi-Fi OX1021. | Renombrar a «Amazon Echo y Alexa». Dejar los tres Echo como equipos principales; mover el enchufe a «Hogar inteligente > Enchufes». Puede aparecer como compatible en un bloque separado, previa verificación de compatibilidad. |
| [Consolas de videojuego](https://tiendavirtualsuper.com/?collection=consolas) | Doce resultados relacionados con consolas. Hay denominaciones muy similares de R36S y X7 Plus. | Usar «Consolas de videojuegos» o «Consolas». Mantener M15 Pro, R36 Ultra, M8, Game Stick X2, SUP, R36S/R40XX y X7 Plus. Revisar registros similares antes de fusionar. Mandos sueltos deben ir a una subcategoría distinta. |

### Productos concretos para corregir las colecciones

- **Proyectores del menú:** sumar los doce equipos presentes en el atajo y ausentes de esa categoría: N1450 (HY300 Ultra); O589, O366, O364, O363, O337 y O336 (Havit); N957 (AR300); N1167 (Budplus C2), N1166 (Sun 800 GTV), N1163 (Budplus A1) y N1121 (Q8). Los seis actuales son N2220, N2222, N2221, N496, N2224 y N2223.
- **Pantallas y ecranes:** O881, N2229, N2227, N2226, N2225 y N2228, hoy mezclados bajo el atajo Proyectores. Agregar N2078, «Tela para PROJECTOR 120 pulgadas», localizado en Hogar y ausente del atajo. Esto demuestra por qué una palabra en español no debe definir toda la familia.
- **Drones:** sumar O1005 (DJI Neo 2) y O1001 (DJI Avata 360) a la categoría que ya contiene N157 y O1007.
- **Amazon Echo y Alexa:** O256-AZUL (Echo Spot), O15-AZUL (Echo Dot) y O1038-WHITE (Echo Show). N2028 (enchufe OX1021) es un complemento, no un Echo.
- **Parlantes inteligentes:** el único producto de la categoría es P373, «SIMULADOR PARLANTE MAX DISEÑO EMPAQUE AL05». Su ficha no aporta especificaciones visibles que acrediten asistente inteligente. No clasificarlo como Alexa por aspecto o nombre; requiere revisión. Los Echo verificados por nombre no están agrupados allí.

Franja propuesta inicialmente: **Destacados — Parlantes — Audífonos — Cargadores — Proyectores — Drones — Amazon Echo**. «Destacados» se sustituiría por «Más vendidos» cuando el ranking esté disponible. Consolas puede ocupar otro acceso si el espacio o la demanda lo justifican. Ofertas y Preventa deben reaparecer cuando tengan contenido válido. El orden definitivo se debe contrastar con clics y ventas; no lo demuestra el número de SKU.

## 3. Categorías y subcategorías actuales

No hay jerarquía real padre/hijo en el modelo `Category`. Todo está al mismo nivel: por ejemplo, Audio y Sonido, Auriculares y Parlantes son tres destinos separados; la primera no reúne automáticamente a las otras dos. «Colección» en la portada es una etiqueta visual y tampoco crea subcategorías.

En la portada y listados aparecen **31 categorías activas**, pero desde la ficha revisada aparecen **39**. Las ocho adicionales se comprobaron y están vacías: Celulares, Hogar y Cocina, Iluminación LED, Juguetes/útiles escolares, Descartables, Ferretería ligera, Juguetería y Tecnología. Unificar el menú en todas las páginas y ocultar destinos sin productos publicables, salvo páginas informativas diseñadas expresamente para ello.

Tabla de las 31 categorías activas. «24+» significa que se revisaron 24 productos y existe una página siguiente; no expresa el total.

| Categoría actual | Muestra | Diagnóstico / destino recomendado |
|---|---:|---|
| Audio y Sonido | 1 | Tiene solo un JBL Tune 780 NC. Convertir en familia que reúna audífonos, parlantes y micrófonos; ese JBL va a Audífonos. |
| Auriculares | 24+ | En general coherente en la muestra. Nombre público sugerido «Audífonos»; aceptar «auriculares» en búsqueda. Subtipos: inalámbricos, con cable, de diadema y gamer. |
| Parlante Inteligentes | 1 | Corregir concordancia a «Parlantes inteligentes» y revisar P373. Debe reunir equipos con funciones inteligentes acreditadas. |
| Parlantes | 24+ | Mayormente coherente; mezcla intercomunicador y Echo. Separar Bluetooth, karaoke, barras, radios y dispositivos inteligentes. |
| Accesorios para Celulares | 24+ | Nombre útil; crear cargadores, cables, soportes y power banks. Audífonos deben tener una clasificación principal coherente. |
| Smart Watch y Sus Accesorios | 24+ | Unificar con Complementos en «Relojes inteligentes y accesorios». |
| Smart Watch y Sus Complementos | 24+ | Misma familia, con relojes y correas. Dividir por tipo de producto, no por sinónimos de accesorios. |
| Dispositivos Portatiles | 24+ | Demasiado ambiguo: tablets, cables, cargadores, trípodes, radios y grabadora. Separar Tablets, accesorios, comunicación y seguridad. |
| Perifericos | 24+ | Cambiar a «Accesorios para computadora»; separar mouse, teclados, soportes, refrigeración y conectividad. Retirar intercomunicador para casco. |
| Baterias | 24+ | «Power banks y energía»; separar pilas y estaciones de energía. No incluir aparatos solo porque tienen batería. |
| Dispositivos de Almacenamiento | 24 | «Memorias USB y microSD». El adaptador Bluetooth N495 no almacena datos. |
| Entretenimiento y Multimedia | 24+ | Mezcla amplia. Distribuir entre TV/proyección, videojuegos, audio y computación. |
| Proyectores | 6 | Nombre correcto; incompleta respecto del atajo. |
| Tv Box | 1 | «TV Box y streaming»; consolidar aparatos de ese tipo que hoy estén en Multimedia. |
| Camara de Seguridad | 24+ | «Cámaras de seguridad». Separar equipos, grabadores y accesorios. Regalos de la marca EZVIZ no son cámaras. |
| Accesorios para Auto | 24+ | «Autos y motos» si integra ambos. Retirar soporte de laptop y memoria USB genérica. |
| Utencillos de Cocina y Accesorios de Uso Domestico | 24+ | Corregir «utensilios». Simplificar a «Cocina» y separar utensilios/electrodomésticos; retirar cuidado personal y auto. |
| Articulos para El Hogar | 24+ | Unificar como Hogar y distribuir audio, TV, redes y accesorios de auto en sus familias. |
| Articulos para El Hogar e Iluminacion | 24+ | Se solapa con Hogar e Iluminación. Asignar subcategorías de función. |
| Iluminacion | 16 | Nombre correcto con tilde. Retirar TV, plancha, manguera y climatizador. |
| Accesorios de Cuidado Personal | 24+ | Mezcla máquinas y accesorios. Integrar en Cuidado personal con subtipos. Separar GPS y candado. |
| Cuidado Personal | 6 | Nombre correcto como familia, pero contiene mouse. Unificar sus otras dos categorías. |
| Maquina de Cuidado Personal | 6 | Los seis artículos son afeitadoras/cortadoras. Llamar «Afeitadoras y cortadoras de cabello». |
| Articulos Escolares | 6 | Calculadoras sí; lápices ópticos van principalmente en accesorios para tablets. |
| Equipaje/bolsos | 4 | «Mochilas y bolsos» describe mejor la muestra, compuesta por morrales y mochila. |
| Billetera | 2 | Contiene mini carteras para dama. «Carteras y billeteras», dentro de Bolsos y accesorios. |
| Drones | 2 | Nombre correcto; sumar los dos DJI que aparecen en el atajo. |
| Juguetes/niños | 7 | «Juguetes». Revisar reloj e inflador: no basta estar relacionado con niños para ser juguete. |
| Laptop | 2 | Ambos son extensores de pantalla, no laptops. «Monitores y extensores de pantalla» en Computación. |
| Novedades | 24+ | Mezcla megáfonos, robot aspirador, afeitadora, sartén, scooter, ropa y otros. Debe ser una colección por fecha de incorporación comercial, no categoría residual. |
| Juguetes Sexuales | 2 | Los productos coinciden por nombre. «Bienestar íntimo» es una alternativa editorial; conservar términos de búsqueda. Mantener su acceso específico y una política coherente de exposición en portada. |

## 4. Correcciones concretas de ubicación

Las siguientes propuestas se basan en el tipo indicado en el nombre; los casos ambiguos se marcan para revisión, no para una actualización automática.

| Código / producto | Ubicación observada | Ubicación propuesta |
|---|---|---|
| N917 — Afeitadora VGR V-353 | Cocina | Cuidado personal > Afeitadoras |
| L500 — Cepillo alisador RAF R412 | Cocina | Cuidado personal > Alisadores |
| N299 — Colchón inflable para auto | Cocina | Autos > Accesorios de viaje |
| N439 — Mini máquina de coser | Cocina | Hogar > Costura |
| N2325 — Soporte para laptop | Auto | Computación > Soportes |
| HPM32 — Memoria USB 32 GB | Auto | Computación > Memorias USB |
| N2255 — Lámpara solar 1500 mAh | Baterías | Hogar > Iluminación solar |
| N2098 — Taladro atornillador doble batería | Baterías | Herramientas > Taladros |
| N2176 — Hidrolavadora de dos baterías | Baterías | Hogar/herramientas > Hidrolavadoras; acceso secundario en lavado de autos |
| N495 — Adaptador Bluetooth USB | Almacenamiento | Computación > Conectividad |
| N927 — Radio intercomunicador Lantun | Parlantes | Comunicación > Radios e intercomunicadores |
| N419 — Intercomunicador para casco | Periféricos | Autos y motos > Intercomunicadores |
| PC367 — Mouse con cable | Multimedia | Computación > Mouse |
| PC372 — Audífono con micrófono Halion | Multimedia | Audio > Audífonos gamer |
| N2284 / N1369 — Micrófonos | Multimedia | Audio > Micrófonos |
| O902 / O948 / O946 — Cargadores Samsung | Dispositivos portátiles | Cargadores y accesorios > Cargadores |
| CB08 — Cable USB-C con soporte | Dispositivos portátiles | Cargadores y accesorios > Cables |
| N2041 — Trípode cámara/celular | Dispositivos portátiles | Foto y video > Trípodes |
| O849-BLUE — Power bank Xiaomi | Dispositivos portátiles | Energía > Power banks |
| O825 — Grabadora EZVIZ de 4 canales | Dispositivos portátiles | Seguridad > Grabadores |
| O888 / O887 — Radios Motorola | Dispositivos portátiles | Comunicación > Radios |
| O832 / O970 — Extensores de pantalla | Dispositivos portátiles | Computación > Monitores y extensores |
| O925 — Pizarra LCD de escritura | Dispositivos portátiles | Escolares > Pizarras de escritura; no confundir con tablet informática |
| N238 — Antena HDTV | Hogar | TV y proyección > Antenas y accesorios |
| N2282 / P1006 — Megáfonos | Hogar / Novedades | Audio > Megáfonos |
| N2078 — Tela para proyector | Hogar | TV y proyección > Pantallas y ecranes |
| N2261 — Repetidor Wi-Fi | Hogar | Computación > Redes |
| L759 — Hervidor RAF | Hogar | Cocina > Hervidores |
| N314 — Luz de gestos para auto | Hogar | Autos > Iluminación y accesorios |
| O872 — Xiaomi TV A Pro 55 | Iluminación | TV y proyección > Televisores |
| L462 — Plancha de ropa | Iluminación | Hogar > Cuidado de ropa |
| N1436 — Manguera expandible | Iluminación | Hogar > Jardín y limpieza |
| N2100 — Climatizador/calefactor | Iluminación | Hogar > Climatización, sujeto a verificar el tipo real |
| O1014-NEGRO — Mouse vertical Ugreen | Cuidado personal | Computación > Mouse |
| N2238 / N2163 — Localizadores para objetos o mascotas | Cuidado personal / Novedades | Tecnología > Localizadores; verificar conectividad antes de prometer GPS |
| N1246 — Candado inteligente | Cuidado personal | Seguridad > Cerraduras y candados |
| O1041 / O1040 / O1039 — Lápices ópticos | Escolares | Tablets > Lápices y accesorios compatibles |
| PC401 / PC402 — Extensores de pantalla | Laptop | Computación > Monitores y extensores |
| N2318 — Robot aspirador | Novedades | Hogar > Limpieza |
| N1548 — Máquina para barba | Novedades | Cuidado personal > Afeitadoras |
| L816 / L784 — Exprimidor / sartén | Novedades | Cocina > Exprimidores / Sartenes |
| P1038 — Torre de audio Aiwa | Novedades | Audio > Parlantes de fiesta |
| N1119 — Tira LED RGB | Novedades | Hogar > Iluminación |
| RGLO-TAPE / RGLO-MATE / RGLO-BOT | Cámaras de seguridad | Revisar si son artículos promocionales: cinta, taza y botella no se deben clasificar como cámaras por llevar marca EZVIZ |

## 5. Estructura propuesta

La jerarquía debe indicar **qué es el producto**. Marca, color, capacidad, conectividad y precio normalmente funcionan mejor como filtros. Un producto puede participar en varias colecciones sin cambiar su categoría principal.

| Familia visible | Subcategorías propuestas |
|---|---|
| Audio | Audífonos; Parlantes; Barras de sonido; Micrófonos; Radios y megáfonos |
| Celulares y tablets | Celulares, solo con catálogo publicable; Tablets; Accesorios para tablets |
| Cargadores y accesorios | Cargadores; Cables; Power banks; Soportes; Adaptadores |
| Relojes inteligentes | Smartwatches; Pulseras inteligentes; Correas; Accesorios compatibles |
| Computación | Mouse; Teclados y combos; Monitores/extensores; Soportes y refrigeración; Memorias; Redes |
| TV, proyectores y videojuegos | Televisores; Proyectores; Pantallas/ecranes; TV Box/streaming; Consolas; Mandos |
| Drones, foto y video | Drones; Cámaras deportivas; Trípodes y estabilizadores; Iluminación fotográfica |
| Hogar y cocina | Cocina; Organización; Limpieza; Cuidado de ropa; Climatización; Iluminación; Herramientas |
| Hogar inteligente y seguridad | Amazon Echo; Enchufes inteligentes; Cámaras; Grabadores; Timbres; Cerraduras y localizadores |
| Autos y motos | Cargadores/soportes; Dashcams; Infladores/arrancadores; Intercomunicadores; Viaje y organización |
| Cuidado personal | Afeitadoras; Cortadoras; Secadoras/alisadores; Masajeadores; Accesorios |
| Juguetes y escolares | Juguetes; Juegos de agua; Calculadoras; Pizarras; Útiles escolares |
| Bolsos y accesorios | Mochilas/morrales; Carteras/billeteras; Viaje; Otros accesorios personales con suficiente catálogo |
| Bienestar íntimo | Tipos de producto existentes, sin crear subdivisiones vacías |

No es necesario exhibir las 14 familias en la franja bajo el buscador: el menú completo puede contenerlas, mientras la portada destaca 8–10 mediante tarjetas visuales. Las subcategorías se publican según disponibilidad real, evitando añadir categorías para productos que no existen. Energía solar/estaciones, comunicación y movilidad eléctrica pueden tener páginas específicas según se confirme su volumen; no deben volver a un cajón «Novedades».

Ejemplo de recorrido: **Audio → Audífonos → filtros: inalámbrico, marca, precio, disponibilidad**. Otro: **TV, proyectores y videojuegos → Proyectores → filtros: resolución nativa, brillo verificado, conectividad, precio**. Los atributos técnicos requieren datos comprobados; no inferirlos del nombre.

## 6. Nombres y calidad editorial

- Usar nombres cortos, en español natural y con tildes. «Utencillos» debe ser «Utensilios»; «Parlante Inteligentes», «Parlantes inteligentes»; «Laptop» no describe extensores de pantalla.
- «Novedades» debe significar incorporaciones recientes al catálogo comercial. El código actual usa ese nombre como destino por defecto de lo que no reconoce. Además, `updatedAt` puede cambiar por mantenimiento o sincronización y no demuestra que el producto sea nuevo.
- En productos, conservar marca/modelo y características útiles, apartando códigos internos a su campo SKU. Ejemplos sugeridos: «Proyector Super HY400 Pro», «Audífonos JBL Tune 110 — Azul», «Pantalla para proyector de 120 pulgadas». No eliminar diferencias relevantes de modelo.
- Revisar «N08», que no explica qué se vende; «acero inolvidable», probablemente un error por «inoxidable» que debe confirmarse; «XIOMI» y «XIOAMI», verificando marca real; repeticiones como «ST501A ST501A» y restos `_x000D_` en textos alternativos.
- «SQ», «PLA», «PT», «COD.» y códigos numéricos generan ruido para un cliente nuevo. Confirmar si representan una diferencia comercial necesaria y, de ser así, expresarla en lenguaje claro antes de retirarlos del título público.

## 7. Causas y cambios técnicos recomendados

1. **Separar categoría, colección y atributo.** Introducir jerarquía de categorías o una capa comercial equivalente. Ofertas, destacados, más vendidos y novedades son colecciones con criterios propios, no familias de producto.
2. **Una única definición de pertenencia.** Menú, accesos, buscador y «Ver más» deben resolver el mismo catálogo para una misma etiqueta. Hoy `/?category=proyectores` y `/?collection=proyectores` consultan criterios diferentes.
3. **Corregir clasificadores por palabras demasiado generales.** En el código local, «mAh»/«batería» puede ganar antes que iluminación/herramientas; «Samsung»/«celular» puede ganar antes que cargadores/soportes; «EZVIZ» puede convertir regalos en seguridad. El clasificador debe identificar primero el tipo principal y manejar marcas/capacidades como atributos. No ejecutar un reclasificado masivo con esas reglas sin revisión.
4. **Mantener decisiones editoriales al sincronizar ERP.** Conservar ID, SKU, precios y stock; distinguir categoría del ERP de categoría comercial y proteger correcciones manuales. Cambiar solo nombres en el frontal no arregla las asignaciones.
5. **Menú consistente.** La portada usa categorías activas y el encabezado sin categorías proporcionadas recurre a todas. Usar el mismo criterio en portada, listados y fichas.
6. **Disponibilidad precisa.** `buildSellableProductWhere` filtra visibilidad, fotos y bloqueo, pero no stock positivo. No dar por hecho que «publicable» equivale a «disponible para comprar». Mostrar agotados expresamente y priorizar stock; validar esto al migrar.
7. **Ranking honesto.** No reemplazar silenciosamente Más vendidos por todos los productos. Tampoco rellenar el bloque con productos ajenos si no alcanza ocho resultados.
8. **Preservar enlaces antiguos.** Al unificar nombres y slugs, preparar redirecciones y actualizar enlaces internos. Revisar aparte el tratamiento SEO de categorías filtradas y páginas canónicas.

Archivos revisados: `src/app/page.tsx`, `src/app/categoria/[slug]/page.tsx`, `src/lib/store-catalog.ts`, `src/lib/store-shared.ts`, `src/lib/erp-sales.ts`, `src/lib/product-category-classifier.ts`, `src/components/catalog/public-store-header.tsx`, `src/components/catalog/public-store-category-menu.tsx`, `src/components/catalog/catalog-experience.tsx`, `src/components/catalog/product-card.tsx`, `src/components/catalog/scrolling-shortcuts-marquee.tsx` y `prisma/schema.prisma`.

## 8. Orden de ejecución y validación

**Prioridad 1 — Coherencia inmediata:** ocultar Ofertas/Preventa vacías; resolver Más vendidos/Destacados; unificar Proyectores y Drones; separar Echo de compatibles; retirar categorías vacías de todas las páginas.

**Prioridad 2 — Catálogo:** aprobar una tabla completa SKU → categoría/subcategoría, partiendo de los errores documentados; revisar casos ambiguos y registros similares; fusionar duplicidades de Hogar, Cuidado personal y Relojes; crear respaldo y registro de cambios; garantizar persistencia frente al ERP.

**Prioridad 3 — Descubrimiento:** menú con familias/subcategorías, categorías visuales en portada, navegación estable, filtros, variantes agrupadas y títulos limpios. Después ajustar banner y tarjetas.

Antes de publicar: comprobar que todos los accesos con el mismo nombre devuelven el mismo conjunto; revisar falsos positivos/omisiones en Proyectores, Alexa y Drones; validar la regla de oferta y preventa con datos reales; confirmar que no se pierden productos, variantes ni enlaces; y recorrer móvil/escritorio como visitante y como cliente autenticado.

Para evaluar el resultado: registrar clics por categoría, destinos vacíos, búsquedas sin resultados, uso de filtros y paso de listado a ficha/carrito. Comparar periodos equivalentes y realizar pruebas de encontrar productos con compradores nuevos. Esta auditoría identifica fricciones y errores; no cuantifica aún su efecto en ventas.
