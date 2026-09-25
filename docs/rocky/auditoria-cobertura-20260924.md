# Cobertura conservadora de Rocky 2 sobre mensajes reales

Ventana fija: del 23/09/2026 a las 23:44:03 al 24/09/2026 a las 23:44:03, hora de Perú. Equivale a 2026-09-24T04:44:03.846Z–2026-09-25T04:44:03.846Z.

## Universo y resultado

Se consultaron 3.572 mensajes entrantes del Centro de Mensajes. Se excluyeron 42 de contactos con identificador SIMULATOR:. Los 3.530 restantes corresponden a clientes de WhatsApp en 641 conversaciones: 3.239 textos y 291 mensajes de otros tipos (231 imágenes, 20 audios, 20 desconocidos, 13 videos, 5 stickers y 2 ubicaciones).

| Respuestas con sustento en esta evaluación | Mensajes |
| --- | ---: |
| Solicitudes de catálogo con selección pertinente | 580 |
| Consultas de productos con resultados pertinentes y datos de catálogo | 34 |
| Dirección de la tienda | 13 |
| Subtotal de atención comercial | 627 |
| Saludos básicos | 239 |
| Total incluyendo saludos | 866 |
| Sin cobertura validada en esta evaluación | 2.664 |

Cobertura estimada incluyendo saludos: 24,5% del volumen entrante. Atención comercial sin saludos: 17,8%. Son mensajes individuales, no conversaciones resueltas, clientes atendidos ni ventas cerradas.

## Método y límites

- Evaluación de solo lectura sobre el release publicado `rocky2-conversations-20260924`. No se llamó a `runRocky`, no se guardaron respuestas, no se enviaron mensajes ni se crearon pedidos.
- Se ejecutó el orquestador determinista con backend real de consulta, sin proveedor LLM, embeddings, visión ni generación de PDF. Los catálogos se evaluaron como enlaces a la tienda. El corpus aprobado solo contenía 1.679 documentos de tipo PRODUCT; no había políticas aprobadas de pago, entrega, garantía o devolución.
- Se recorrieron los textos cronológicamente por conversación, con memoria de la reproducción y referencias explícitas disponibles en mensajes anteriores. Se consultaron hasta seis mensajes anteriores a la ventana y se conservó un contexto breve para revisión. No se emplearon respuestas futuras como evidencia. No equivale a reproducir toda la memoria histórica del servicio ni las interpretaciones del modelo y las fotos.
- Se reutilizaron resultados de consulta dentro de esta auditoría. Se usaron los datos de catálogo disponibles durante la revisión, no una reconstrucción de precios y stock históricos. Hubo cambios de catálogo durante la lectura; no se afirma que fuera una instantánea transaccional.
- Se revisó la pertinencia de los candidatos con catálogo, productos y datos de tienda. No bastó con que el motor produjera una respuesta o declarara confianza alta. Se excluyeron resultados incorrectos, solicitudes parcialmente contestadas, pedidos reales sin resolver y referencias a adjuntos no evaluados.
- Los 239 saludos son interacciones básicas, no resolución de consultas comerciales. Los otros 2.664 mensajes no se clasifican todos como errores o imposibles: incluyen mensajes que necesitan contexto, datos de cliente, respuestas mediante modelo, adjuntos y atención humana.
- **866 es un conteo bajo estos criterios conservadores, no una garantía de exactitud ni una tasa medida en producción.** No se midieron mensajes por minuto ni capacidad concurrente.

## Fallos observados que deben corregirse antes de atención general automática

1. Frases como «tendrá catálogo» pueden activar una selección de teteras; cortesías como «xfavor» o «actualizado» pueden convertirse en filtros sin resultados.
2. Búsquedas sin referencia inequívoca pueden devolver productos ajenos. También se observó una consulta de Samsung S24 Ultra respondida con un cable para ese modelo.
3. «DIRECCION y HORARIO» apareció 18 veces y el motor solo entregó horario: no se contó como resolución completa.
4. Pedidos compuestos pueden perder productos/cantidades en el orquestador real. El checkout mejorado permanece limitado al simulador.
5. Preguntas sobre entregas, pagos y garantías no tienen políticas aprobadas que sustenten una respuesta autónoma. Las referencias a fotos, audios y videos no se validaron en esta prueba.

La evidencia detallada con decisiones por mensaje permanece en `.cache/rocky-audit-assessment.json`; el extracto de auditoría está en `.cache/rocky-inbox-audit-20260924.json`. Contienen referencias o contenido de clientes y no deben publicarse ni añadirse al repositorio. Este informe solo expone agregados y ejemplos sin identificar clientes.
