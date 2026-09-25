# Cobertura conservadora de las últimas 24 horas

Ventana: 24/09/2026 02:47:25 a 25/09/2026 02:47:25, hora de Perú. Se leyeron 3.450 mensajes entrantes reales de 627 conversaciones. Se excluyeron contactos de simulación.

| Casos con respaldo identificado | Mensajes |
| --- | ---: |
| Solicitudes de catálogo | 568 |
| Consultas de producto con resultados pertinentes | 43 |
| Dirección y horario publicados | 33 |
| Subtotal comercial | 644 |
| Saludos simples | 320 |
| Total incluyendo saludos | 964 |
| No verificados | 2.486 |

La cobertura comercial identificada es 18,67 % de todos los mensajes entrantes; incluyendo saludos, 27,94 %. Son estimaciones conservadoras de cobertura, no exactitud medida del modelo ni número garantizado de respuestas correctas en producción.

## Método y límites

Reproducción de solo lectura del orquestador y sus herramientas en la versión `rocky2-precision-20260925` (`d409c66`). Se utilizaron datos actuales de productos y configuración de tienda, con caché de consultas durante la auditoría. Se reconstruyeron referencias de códigos explícitos a partir de mensajes anteriores, con un contexto limitado. Se revisaron candidatos de producto, catálogo y negocio para excluir resultados ajenos, respuestas parciales y referencias no verificadas.

No se ejecutó Ollama, visión, embeddings, generación de PDF ni el flujo completo del servicio o checkout. Tampoco se enviaron respuestas ni se modificaron conversaciones. Los 287 mensajes no textuales quedaron sin verificar. Las derivaciones a asesores y respuestas genéricas no cuentan como resolución comercial. Los ejemplos y pruebas anteriores no acreditan una precisión del 99,9 %.

Persisten fallos observados en la reproducción: «precio de la caja de 100» devuelve un cargador de 100 W; algunas fórmulas de cortesía se interpretan como filtros de catálogo; una consulta de dos modelos Samsung obtiene un soporte de laptop. Esos casos se excluyeron. Identificar un fallo aquí no implica haberlo corregido.

El total no es directamente comparable con la auditoría anterior: cambiaron la ventana, los mensajes y la versión. Los 2.486 no verificados no equivalen a mensajes imposibles de automatizar. Para conocer la exactitud final se necesita una evaluación con respuestas completas y revisión humana, incluyendo modelo, contexto y medios.

Los mensajes, referencias e identificadores de evaluación se conservan únicamente en archivos privados dentro de `.cache`; este informe no incluye datos de clientes.
