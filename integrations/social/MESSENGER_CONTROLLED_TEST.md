# Prueba controlada de Messenger y Super Bot

Esta guía valida el recorrido completo de Messenger sin poner conversaciones de
clientes reales en riesgo. Úsala sólo con una cuenta de prueba que haya dado
consentimiento y una conversación marcada para pruebas. No pegues tokens,
claves, URLs firmadas ni datos personales en esta guía, en capturas o en el
registro de evidencias.

## Alcance y regla de seguridad

- La prueba es manual y controlada; quien la ejecuta decide cuándo enviar cada
  mensaje desde la cuenta de prueba.
- No se deben enviar mensajes desde esta guía ni desde herramientas de
  administración a clientes reales.
- Usa un código de producto existente, con precio y stock conocidos antes de
  comenzar. Anota el código como `CODIGO-PRUEBA` y conserva el valor real sólo
  en el registro interno autorizado.
- Si una respuesta podría ser comercialmente incorrecta, detén la prueba,
  pausa la automatización de esa conversación y deriva el caso a un asesor.
- Para distinguir eventos de prueba, registra el `eventId` o el identificador
  de conversación sólo en forma parcial o anonimizada.

## Preparación

1. Confirma que la cuenta Messenger de prueba está vinculada al workspace de
   ChatbotX y que el adaptador de producción apunta al endpoint interno de
   Super Bot. No inspecciones ni copies su clave compartida.
2. Abre `/admin/mensajes/messenger` como propietario autorizado de mensajería.
   Verifica que aparece la conversación de prueba y que su estado inicial dice
   **Super Bot activo**.
3. En ChatbotX, prepara una vista de eventos o entregas de esa conversación.
   La evidencia debe mostrar una única respuesta saliente por evento, nunca el
   contenido de secretos.
4. Antes de probar precio o stock, consulta la fuente de catálogo autorizada y
   fija el resultado esperado de `CODIGO-PRUEBA` (nombre, precio mostrado y
   disponibilidad). Así se detecta una respuesta desactualizada o inventada.
5. Conserva capturas con datos personales ocultos. Para cada fila, registra
   hora, identificador parcial y el resultado observado.

## Matriz de casos

| Caso | Acción desde la cuenta de prueba | Criterio observable de aprobación | Evidencia / resultado |
| --- | --- | --- | --- |
| 1. Saludo | Envía `Hola` en una conversación nueva. | Llega una sola respuesta útil y en español, sin precio ni stock inventados. La entrega queda asociada al evento entrante. | Fecha/hora: ____ · eventId parcial: ____ · respuesta única: Sí / No · resultado: ____ |
| 2. Consulta por código | Envía `Busco CODIGO-PRUEBA`. | Identifica el producto correcto o pide una aclaración segura; no cambia a otro producto parecido. Si ofrece ficha o enlace, corresponde al producto esperado. | Código validado: ____ · producto citado: ____ · resultado: ____ |
| 3. Stock | Envía `¿Hay stock de CODIGO-PRUEBA?`. | La disponibilidad coincide con la consulta de catálogo hecha en la preparación. Si el dato no está disponible, el bot lo reconoce o deriva; no promete unidades. | Stock esperado/recibido: ____ / ____ · resultado: ____ |
| 4. Precio | Envía `¿Cuánto cuesta CODIGO-PRUEBA?`. | El precio y moneda coinciden con la fuente aprobada. Si no puede confirmarlo, no inventa importe ni descuento y ofrece la siguiente acción segura. | Precio esperado/recibido: ____ / ____ · resultado: ____ |
| 5. Error de escritura | Envía una variante realista, por ejemplo `CODIGO PRUEVA` o un modelo con una letra equivocada. | Tolera el error sólo si la coincidencia es inequívoca; de lo contrario solicita código, foto o modelo. No afirma una coincidencia dudosa como segura. | Texto enviado: ____ · respuesta: ____ · resultado: ____ |
| 6. Seguimiento con contexto | Después de identificar el producto, envía `¿y el más barato?` o `¿tienes 12?`. | Conserva el producto y la intención del turno anterior, o hace una pregunta de aclaración. No responde como si fuera una conversación nueva ni mezcla otro producto. | Contexto previo: ____ · respuesta: ____ · resultado: ____ |
| 7. Imagen o adjunto | Envía una imagen de prueba sin texto, y luego una imagen acompañada de `¿tienen este modelo?`. | No deduce precio, stock ni modelo a partir del archivo. Sin texto útil, pide código/modelo o deriva; con texto, trata sólo la consulta escrita. El adjunto se visualiza o queda disponible de forma segura en la bandeja. | Tipo de archivo: ____ · respuesta: ____ · adjunto visible: Sí / No · resultado: ____ |
| 8. Derivación a asesor | Formula una petición que el bot no debe resolver con certeza, por ejemplo un reclamo, una negociación especial o un código inexistente. | Declara el límite de forma clara y ofrece derivación o el siguiente paso humano. No inventa políticas, garantías, precios o stock. | Motivo: ____ · respuesta: ____ · derivación clara: Sí / No · resultado: ____ |
| 9. Evento duplicado | Repite controladamente el mismo evento mediante la herramienta de prueba del adaptador o reintento con el mismo `eventId`; no reescribas el mensaje ni cambies el cuerpo. | Hay como máximo una respuesta saliente para ese evento. Un `200` repetido no crea un segundo mensaje; un `202` no envía nada mientras procesa. | eventId parcial: ____ · mensajes salientes: ____ · estado proveedor: ____ · resultado: ____ |
| 10. Pausa global | Desactiva el interruptor global de automatización sólo en el entorno controlado. Envía un mensaje nuevo desde la cuenta de prueba. | No se envía respuesta automática. Confirma además en el flujo/adaptador que no se sustituyó por otro bot o respuesta comercial predefinida. Vuelve a activar el interruptor al terminar. | Hora de pausa: ____ · respuesta automática: Sí / No · verificación adaptador: ____ · resultado: ____ |
| 11. Atención humana y reactivación explícita | Con Super Bot activo, envía manualmente una respuesta desde `/admin/mensajes/messenger`. Comprueba que el estado pasa a **Atención por asesor**. Luego pulsa **Reactivar Super Bot**. | La respuesta humana pausa el bot. La reactivación no envía ningún mensaje al cliente y sólo cambia el estado a **Super Bot activo**. Envía después un mensaje nuevo de prueba: entonces puede responder una sola vez. | Estado tras asesor: ____ · mensaje al reactivar: Ninguno / Otro: ____ · estado final: ____ · resultado: ____ |

## Cómo interpretar un resultado

- **Aprobado:** cumple todos los criterios observables y la evidencia permite
  vincular la respuesta con el evento de prueba sin revelar secretos.
- **Bloqueado:** falta una cuenta autorizada, acceso de propietario, conexión
  del proveedor o datos de catálogo. Registra el bloqueo y no uses una cuenta
  de cliente como sustituto.
- **Falla crítica:** respuesta duplicada, precio/stock inventado, respuesta
  automática durante pausa global, o reactivación que envía un mensaje sin una
  nueva entrada del cliente. Pausa la automatización de la conversación y
  escala el caso antes de continuar.
- **Falla funcional:** no conserva contexto, no deriva correctamente, no
  muestra el adjunto o no recupera una falta de ortografía segura. Adjunta el
  identificador parcial, la hora y una captura anonimizada para reproducción.

## Cierre de la sesión de prueba

1. Deja el interruptor global en el estado que tenía antes de probarlo.
2. Verifica en Messenger y ChatbotX que no quedan reintentos o mensajes
   pendientes para la conversación de prueba.
3. Si la conversación quedó en atención humana, reactiva Super Bot sólo si el
   responsable operativo lo decide explícitamente; nunca debe ocurrir por
   cargar la bandeja, reintentar, entregar un mensaje o vencer la ventana de
   24 horas.
4. Consolida las filas aprobadas/fallidas, elimina información personal de las
   capturas y comparte el informe sólo con el equipo autorizado.

## Señales mínimas para aceptar producción

Todos los casos deben tener evidencia. En particular, no apruebes la salida a
producción si no se verificaron los casos 3, 4, 9, 10 y 11: cubren datos
comerciales, deduplicación, la parada de emergencia y el traspaso seguro entre
bot y asesor.
