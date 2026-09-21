# Corrección de espera del simulador

El POST de ROCKY esperaba la inferencia de Ollama, cuyo timeout era de 90 segundos. El formulario no tenía plazo máximo ni cancelación y mantenía «Disparando». Además, «tienes» no se clasificaba como búsqueda y el skill de stock no permitía resolver una consulta por nombre sin código.

Cambios: catálogo directo para intenciones reconocidas; inferencia reservada para intención desconocida o imagen. Búsqueda por nombre habilitada en la consulta de stock/precio. Se conserva «deseo 12 unidades» como cantidad y se elimina del texto de búsqueda. Ollama chat: 30 s; embeddings: 10 s. El navegador limita la espera a 65 s, ofrece «Dejar de esperar», muestra segundos y libera el formulario con finally. Cancelar la espera no equivale a borrar el mensaje que ya recibió el servidor.

Pruebas: consultas exactas de AirPods del reporte, cantidad/precio, timeout, cancelación, siguiente envío y errores HTML/JSON; 27 pruebas aprobadas y compilación de producción. La etiqueta depende del motor seleccionado. Los casos ambiguos pueden seguir tardando hasta el límite; no se promete latencia constante.

La verificación real descubrió una coincidencia incorrecta entre AirPods Pro 2 y AirPods 4. Se filtran números de modelo y variantes explícitas también en resultados de RAG; si no hay coincidencia, se pide precisar el producto sin atribuirle precio/stock de otro modelo.
