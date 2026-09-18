# BC: venta conversacional y contexto multimodal

Objetivo activo: completar una venta de principio a fin comprendiendo lenguaje del cliente, contexto, audio, imágenes y referencias sociales, y añadir aprendizaje persistente verificable.

## Ubicación de los componentes

- Web, agenda de consultas y workflows: checkout principal, rama `codex/desarrollo-actualizado`.
- Motor y checkout: `.git/bc-router-worktree`, rama `codex/bc-router-simulador`.
- Los cambios anteriores del usuario en `catalog-pdf` y el informe de línea base se conservan.

## Avance local del 18 de septiembre

- Simulador: adjuntos de imagen/audio con límite de 4 MB, validación de MIME/base64/tipo, reproducción de audio, conservación del borrador cuando falla la petición y bloqueo del cambio de sesión mientras se envía.
- Entrada n8n: persistencia de medios/captions y derivación al motor multimodal aunque otro fragmento pida un catálogo.
- Agrupación: fragmentos identificados por mensaje para intercalar transcripción en su posición original. Una corrección escrita posterior no desaparece.
- Foto + audio: el identificador recibe la imagen, no la URL de audio. El comprobante conserva su imagen/documento y no se procesa como referencia comercial.
- Más de un audio o foto: aclaración visible, sin descartar archivos silenciosamente. Videos: solicitud de captura.
- Checkout del motor: audio/video/texto no equivalen a comprobante; una imagen sin archivo tampoco. La evidencia recibida no se marca como pago verificado.
- Datos: nombre y teléfono juntos, documento junto con boleta/factura, preservación de datos proporcionados frente al perfil del canal. DNI/RUC no se extraen truncando o concatenando cifras ajenas.

## Validación local

- 23 pruebas de medios, recepción, esquema del simulador y agrupación.
- 9 pruebas de los workflows, incluida intercalación texto/audio, imagen correcta, comprobante y límites de medios.
- 26 pruebas del motor de checkout/contexto/pago y flujos existentes; prueba adicional del servicio de pedidos simulados pasada.
- TypeScript de la web sin errores; ESLint de los archivos modificados sin errores (advertencia existente de `img` en simulador).
- Las pruebas de checkout recorren las funciones de decisión; **no son una prueba integrada desde selección de producto hasta pedido real**.

## Pendiente para cumplir el objetivo

1. Revisar/publicar los cambios locales en el entorno del simulador, comprobar límites de carga y configuración de transcripción/visión. Validar visualmente adjuntos en la interfaz y repetir las pruebas por n8n.
2. Probar recorridos largos desde búsqueda real de SKU y precios hasta confirmación, pedido simulado y evidencia de pago. Cubrir correcciones, preguntas intermedias, reintentos, cambios de inventario y varios productos. No marcar el pago verificado por una captura.
3. Mejorar interpretación contextual y errores de escritura contra el corpus de consultas existente; comparar cobertura y productos incorrectos sin alterar etiquetas para favorecer el resultado.
4. Implementar memoria por cliente con procedencia y correcciones; aprovechar preguntas frecuentes y variantes confirmadas sin convertir afirmaciones del cliente en hechos de catálogo.
5. Referencias sociales: distinguir enlace de contenido realmente accesible. Las capturas se admiten; enlaces y videos aún no se interpretan. Añadir resolución explícita y alternativas cuando el contenido requiera sesión o no esté disponible.
6. Verificar capacidades con proveedores configurados, incluida falla/ausencia de IA, sin inventar lo que dice un audio o imagen.

No se ha desplegado esta iteración ni activado respuesta automática a clientes. El objetivo permanece abierto.

## Continuación: memoria persistente

- Se añadió [memoria por cliente](customer-memory.md), migración, aprendizaje de términos confirmados y preguntas técnicas recurrentes, recuperación entre sesiones y verificación de revisión antes de publicar.
- Pasaron 77 pruebas de regresión de catálogo/agenda/memoria y la integración con PostgreSQL local aislado. La integración prueba corrección real, recuerdo entre conversaciones, precio y ficha actuales, separación de clientes, SKU ocultos y eliminación en cascada.
- La memoria solo se activa con `BC_CUSTOMER_MEMORY_ENABLED=true`, después de migrar y desplegar. Está pendiente en el servidor.
- Auditoría remota de solo lectura: web `5d30b03`, motor `d8e607b`, ambos PM2 online y sin cambios Git. Ninguno tiene `OPENAI_API_KEY`; por eso transcripción y visión reales siguen sin poder verificarse. Se pidió al usuario configurar la clave en el servidor o indicar otro proveedor, sin compartir secretos en el chat.
- PostgreSQL local está disponible en Docker. La base aislada `bc_goal_20260918` contiene el esquema de pruebas; las fixtures se eliminan. La cadena histórica de migraciones falla al crear desde cero por ausencia de `Product`; el SQL nuevo de memoria sí se probó contra el esquema previo.
- Continúan pendientes despliegue coordinado web/motor/n8n, venta integrada completa, preferencias de conversación, memoria de checkout, comprensión real de multimedia y enlaces sociales.
- El usuario respondió preguntando si hace falta proveedor pago y cuánto costarían 10 mil mensajes/conversaciones iniciadas al mes. Está evaluando el costo; no confirmó proveedor ni habilitación de consumo. Se consultaron tarifas oficiales actuales para una estimación por volumen. Continuar el desarrollo sin gasto y distinguir proveedor alojado de modelos locales; no tratar la ausencia de OpenAI como única arquitectura posible.
- Verificación final de esta continuación: ESLint y TypeScript sin errores; integración PostgreSQL con FAQ proactiva y control de revisión superada.

## Continuación: recorrido del motor con PostgreSQL

- Se creó `scripts/checkout-integration.ts` en el checkout del motor. Ejecutar allí con `DATABASE_URL` local apuntando a `bc_goal_20260918` y `node --import tsx scripts/checkout-integration.ts --execute-local`. Invoca el handler real y persiste los pasos en PostgreSQL; usa producto/contacto ficticios y los elimina al finalizar.
- Se restauró `purchaseIntent` en el esquema Prisma de la web: la columna ya tiene migración histórica y el motor la utiliza, pero faltaba en el esquema principal. Se generó el cliente actualizado y se ajustó únicamente el esquema de la base aislada.
- La prueba reprodujo una pérdida del checkout: AUDIO con URL se interpretaba como referencia visual/producto y borraba la selección al decir «ya pagué». Se corrigieron detección de audio, activación de visión exclusivamente para IMAGE y prioridad de comprobantes sobre búsqueda genérica, manteniendo atención humana.
- El resumen de confirmación muestra producto/código, cantidad, importe por unidad, cliente, teléfono, documento y entrega. Para envíos indica que el flete aún no está incluido.
- Si el precio varía mientras espera confirmación, muestra el resumen actualizado y exige nueva confirmación antes de crear pedido. El servicio de pedidos también rechaza un importe diferente al recibido.
- El recorrido pasó: SKU → compra → 3 unidades con precio mayorista → nombre → boleta/DNI → recojo → resumen → cambio de precio → reconfirmación → referencia SIM → Yape → audio de pago → comprobante pendiente de verificación. Se comprobaron cero pedidos reales y stock sin cambios. Pasaron además pruebas de flujos, redacción y servicio de pedidos; ESLint sin errores.
- Alcance: aún no es una prueba de HTTP/n8n desplegado, transcripción real ni pago bancario validado. Falta cubrir cesta con varios productos, correcciones durante checkout y consistencia entre precio/stock y creación real bajo concurrencia. Los cambios siguen locales.
- TypeScript del motor pasó después de generar su cliente Prisma propio en `node_modules/@prisma/client` del worktree (su esquema también tiene `ChatMessage.requestId`, que no está en el cliente principal). Se aplicó esa migración histórica solo a la base aislada. Se corrigió la importación del tipo `Metadata` de sharp y una aserción de prueba nullable. Se repitió el recorrido PostgreSQL con ese cliente: correcto.

## Continuación: pago tras cambios de catálogo y tono

- La integración reprodujo otro fallo: después de crear la referencia SIM, ocultar el producto y cambiar su precio/stock hacía que «Yape» borrase la selección y devolviese al cliente a búsqueda de producto.
- Se evita recalcular el precio y aplicar la invalidación de catálogo sobre un pedido ya creado. La integración ahora cambia el mayorista a 60, pone stock cero y oculta el producto después de confirmar 135; verifica que mantiene ese total, producto y referencia y llega a recepción de comprobante sin verificar automáticamente el pago.
- Se ajustaron las respuestas de datos del cliente, documento, entrega, resumen y pago a un tono cercano con emojis moderados. Se retiró de esas respuestas el lenguaje interno «opciones configuradas» y «el bot».
- Pasaron el recorrido completo con PostgreSQL, 10 pruebas de checkout/redacción/evidencia, TypeScript y ESLint. Todo permanece local; no se enviaron mensajes a clientes ni se habilitó consumo de IA.
- Sigue pendiente la protección completa frente a cambios explícitos de producto/cantidad sobre un pedido existente y el resto de alcance anterior. El objetivo actualizado también exige verificar nombres como «Parlantes JBL.pdf» y ausencia de respuesta encima del PDF en la interfaz real; los commits anteriores de PDF no sustituyen esa verificación.

## Objetivo actualizado: consultas separadas y orden de respuesta

- El usuario sustituyó el objetivo: prioriza venta completa, contexto y aprendizaje, errores de escritura, referencias visuales/sociales y distinguir 1/3/4/5 consultas dentro de cinco mensajes, respondiendo por orden. Audio, tono y formato PDF ya no aparecen como requisitos explícitos del objetivo vigente; no se continúa trabajo exclusivo de esos puntos.
- Pruebas nuevas reprodujeron fragmentación incorrecta de «precio / de audífonos / JBL / negros / seis unidades» y mezcla de temas en «precio A1 y stock P1 y aceptan yape».
- El agrupador reconoce la marca como continuación de un tema precedido por una operación comercial; la división de cláusulas reconoce stock/disponibilidad/información independientes. Las características se extraen y responden en el orden solicitado, en vez del orden fijo del diccionario.
- Pasaron 50 pruebas de agenda/catálogo/agrupación/memoria y ESLint. Se amplió la integración PostgreSQL para recibir una ráfaga real de cinco filas, verificar cuatro solicitudes persistidas (precio, stock, pago y envío), conservar seis unidades y verificar orden de las respuestas almacenadas. La integración pasó junto con los casos previos de memoria.
- Pendiente desplegar y comprobar n8n/interfaz, ampliar corpus de consultas mixtas y correcciones, evitar que notas proactivas de memoria se adelanten a preguntas previas y cubrir ambigüedades. Los cambios siguen locales; no se afirma cobertura universal ni objetivo terminado.

## Continuación: memoria en el orden de la consulta

- Reproducción PostgreSQL: «aceptan yape / precio del sopladorcito / seis unidades / envíos a Arequipa / gracias» adelantaba la explicación de memoria a la pregunta de pago. Se difiere esa explicación hasta la primera solicitud de su producto y se emite una sola vez.
- La integración verifica pago → explicación de referencia recordada → cotización actual → envío. Pasaron además 26 pruebas de agenda/persistencia/memoria, 9 verificaciones del flujo n8n, TypeScript y ESLint.
- Auditoría remota actualizada: web `4686af7` (incluye cambios recientes de PDF), motor `d8e607b`, ambos limpios y online. Memoria desactivada y proveedor IA sin configurar. La revisión web local coincide con el servidor; los cambios ajenos de PDF se conservan.

## Referencias sociales: separación de URL y pregunta

- El despliegue anterior quedó verificado en `2026-09-18-deployment-memory-checkout.md`.
- Se detectó y corrigió localmente que `?precio=99&stock=1` dentro de un enlace generaba solicitudes adicionales. La separación de cláusulas conserva URL completas; parámetros del enlace no determinan intención, cantidad ni características.
- Referencias de TikTok, Instagram, Facebook, YouTube y Pinterest se reconocen por dominio real, sin descargar URLs ni confundir dominios parecidos. Para consultas de producto sin identificación confirmada, se explica que el contenido no se ha visto y se solicita captura/modelo/código. La consulta permanece pendiente, en su orden. Esto NO implementa visión ni extracción de contenido social.
- Pasaron 84 pruebas de regresión, TypeScript y ESLint. Se añadió un recorrido PostgreSQL para aclarar el código y recuperar las seis unidades, pero aún NO pudo ejecutarse: Docker Desktop local está detenido/fallando al arrancar y PostgreSQL no responde. No se usó la base productiva para sustituir esta prueba.
- Estos cambios de referencias sociales aún son locales, sin desplegar. Falta comprobar la integración nueva, las ramas de catálogo/fotos con enlaces y la comprensión del contenido accesible.

## Referencias sociales: integración y publicación verificadas

- Se resolvió la dependencia de Docker local ejecutando el mismo recorrido en una base PostgreSQL NUEVA y aislada del VPS (`bc_goal_social_20260918_a743c90`). La base se creó vacía con el esquema de pruebas, se ejecutó la integración y se eliminó al terminar. No se modificaron datos comerciales.
- Pasó la recuperación de una consulta de TikTok pendiente: al aclarar el código se cotizan las seis unidades originales. También pasaron las verificaciones anteriores de memoria y aislamiento de contactos.
- Publicado `a743c90` en Git y activado en la web con compilación aislada y respaldo de la versión anterior. El primer intento de build rechazó el enlace a node_modules; se corrigió usando una copia privada y la compilación pasó. Motor continúa `cd87fc0`.
- Verificación HTTP administrativa → n8n → PostgreSQL en VPS: cinco mensajes produjeron pago → referencia TikTok pendiente → envío; cantidad seis preservada; sin cotización ni stock inventado y cero respuestas tardías/duplicadas. Contacto temporal eliminado. Evidencia privada en `/home/IMPORTADORA-backups/bc-social-a743c90/live-results.json`.
- Sigue pendiente interpretar contenido visual/social real y validar enlaces en ramas de catálogo/fotos. Se consultó al usuario su preferencia entre proveedor con presupuesto objetivo de US$50/100 mensuales o evaluar modelo local; no se activó consumo de IA.

## Corrección de cantidad al revisar el pedido

- Motor `486c434`, publicado en Git y activado en VPS con compilación aislada y respaldo. Reconoce «mejor 4» o «cambia a 6 unidades» al revisar el pedido; números sueltos no se interpretan como cantidad en esa etapa.
- El resumen recalcula el importe y conserva nombre, teléfono, documento y entrega. Indica que cambió la cantidad y exige confirmar el resumen antes de crear el pedido.
- Pasaron 64 pruebas del motor, TypeScript y ESLint. Integración en base temporal aislada del VPS: 3→4 unidades (120→160), cambio posterior de tarifa (180), nueva confirmación y recepción de comprobante pendiente de validación. Base de pruebas eliminada.
- Verificación HTTP sobre el motor desplegado: N1321, 1→2 unidades, total 258, datos conservados y pedido aún sin crear. Primer intento con L516 se descartó porque el producto no tenía foto utilizable y activó correctamente la regla de disponibilidad; no se cambiaron sus datos. Todos los contactos temporales se eliminaron.
- Sigue pendiente corregir otros datos durante el checkout, cambios sobre pedidos ya creados, cesta con varios productos y el resto del objetivo. Esto no prueba todavía una venta completa por n8n ni verificación bancaria.

## Venta completa por simulador y n8n

- Se añadió `scripts/bc-evaluation/checkout-live.cjs`, ejecutable con `--execute-simulator` en el servidor: usa la API administrativa y n8n, crea un contacto SIMULATOR propio y lo elimina al finalizar. Nunca confirma una transferencia bancaria ni crea un pedido real.
- La primera ejecución reprodujo un fallo de integración: responder «2» en AWAITING_QUANTITY entraba en la agenda de búsquedas y borraba el producto. Corregido en web `d179fab`: las respuestas del checkout mantienen su propietario y las preguntas independientes siguen disponibles para la agenda. También se elimina el saludo repetido en cada lote.
- Pasaron 85 pruebas, TypeScript, ESLint y compilación. Web publicada y activada con respaldo, motor `486c434`.
- Segunda ejecución completada en VPS: SKU N1321 → sí → 2 → sí → nombre → boleta/DNI → recojo → mejor 3 → confirmo → Yape → imagen de comprobante de prueba. La cantidad corregida aplicó precio mayorista (3 × 115 = 345); se conservaron datos, se creó referencia SIM y la evidencia quedó recibida pero NO verificada. No existe pedido real asociado. Contacto temporal eliminado.
- Evidencia: `2026-09-18-checkout-live.json`. Este recorrido sí atraviesa el simulador administrativo, los workflows n8n publicados y los dos servicios desplegados. No acredita toda variante de venta ni interpretación visual, y no se marca el objetivo completo.

## Preguntas intermedias sin reiniciar la compra

- La prueba completa con una pregunta de envío reprodujo pérdida de etapa: AWAITING_QUANTITY volvía a AWAITING_PURCHASE_CONFIRMATION al publicar la respuesta de la agenda.
- Corregido en web `99b30b1`: publicar información sobre el mismo SKU no vuelve a inicializar la selección, cantidad, cotización ni etapa. Una selección distinta mantiene las reglas de cambio existentes.
- Pasaron las pruebas que reproducían el reinicio, TypeScript, ESLint y las 85 regresiones del build aislado. Publicado en Git y activado en VPS con respaldo.
- Recorrido completo por API del simulador y n8n: pregunta de envío al pedir cantidad, pregunta sobre Yape al confirmar precio, datos, entrega, cambio a tres unidades, pedido SIM y comprobante pendiente de validación. Correcto, sin pedido real; contacto temporal eliminado. Evidencia `2026-09-18-checkout-interruptions.json`.
- Mantener pendiente el alcance restante: interpretación visual/social real, cambios de datos y de pedidos existentes, varios artículos y evaluación con más conversaciones reales anonimizadas. No hay confirmación de proveedor/presupuesto de IA todavía.

## Reconocimiento de fotos de origen sin proveedor

- Motor `1aa5f53` publicado y activo. El endpoint de visión compara SHA-256 de imágenes adjuntas inline (máximo 4 MB) con `sourceImageContentHash`. Solo devuelve código si hay un único producto visible; una foto compartida no permite elegir arbitrariamente una variante. No descarga enlaces del cliente para esta comparación.
- El catálogo tenía 1,653 productos visibles con huella de origen: 1,469 fotos únicas y 76 huellas compartidas. Este dato indica disponibilidad de referencias, no precisión general de visión.
- Pasaron 67 pruebas, TypeScript, ESLint, compilación e integración del endpoint con PostgreSQL temporal: coincidencia única, duplicados y cambios de visibilidad. Base temporal eliminada.
- Prueba real: foto de origen de N1321 obtenida del host ERP ya utilizado (`original.negocioserp.com`), descarga limitada a 4 MB y validada contra la huella almacenada. El endpoint devolvió `catalog-source-image-sha256`, y la misma foto enviada por el simulador atravesó n8n y seleccionó N1321, mostró precio vigente y avanzó a pedir cantidad. Contacto temporal eliminado; cero llamadas a proveedor de IA.
- Límite explícito: identifica archivos de origen idénticos. Una captura de TikTok/Instagram, foto desde otro ángulo, recorte o recompresión puede tener otra huella y aún necesita visión/OCR u otro análisis. Esto no sustituye la comprensión visual general ni acredita el objetivo completo.
