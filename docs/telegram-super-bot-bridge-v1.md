# Contrato del bridge Telegram para Super Bot v1

Este repositorio no modifica el bridge de Telegram. La aplicación mantiene
Super Bot apagado para Telegram hasta que el bridge anuncie explícitamente esta
capacidad y el operador habilite `TELEGRAM_BRIDGE_SUPER_BOT_COMPATIBLE=true`.

## Descubrimiento de capacidad

`GET /inbox/status` debe responder:

```json
{
  "connected": true,
  "capabilities": {
    "superBotSendV1": true,
    "superBotControlV1": true
  }
}
```

La ausencia de cualquiera de esas capacidades equivale a `false`; no basta
con que Telegram esté conectado ni con que solo el envío sea compatible.

## Envío automático

`POST /inbox/send` recibe, además de los campos ya existentes:

```json
{
  "connectionId": "cuenta-telegram",
  "chatId": "12345",
  "requestId": "ai:<uuid>",
  "type": "TEXT",
  "content": "¿Qué producto buscas?",
  "sender": "BOT",
  "protocol": "super-bot-v1"
}
```

El ACK debe incluir los mismos marcadores:

```json
{
  "messageId": 123,
  "revision": 7,
  "sender": "BOT",
  "protocol": "super-bot-v1"
}
```

Un ACK HTTP correcto que no incluya `sender: "BOT"` y
`protocol: "super-bot-v1"` es una entrega incierta para la aplicación. No se
reintenta automáticamente.

## Control de la conversación

La toma de control de Super Bot es distinta a la pausa para un asesor. Antes
de marcar el chat como propio, la aplicación envía:

```json
{
  "connectionId": "cuenta-telegram",
  "chatId": "12345",
  "botEnabled": false,
  "expectedRevision": 7,
  "sender": "BOT",
  "protocol": "super-bot-v1"
}
```

El bridge debe aplicar ese control mediante compare-and-set sobre
`expectedRevision`; si una toma humana cambió la revisión, devuelve `409` y
no cambia propietario. El ACK de `POST /inbox/control` debe contener
`revision`, `sender: "BOT"` y `protocol: "super-bot-v1"`. El evento de control
que el bridge devuelve a la aplicación debe conservar también esos dos
marcadores. Con ello la bandeja permanece en `AUTOMATICO`, sin asesor
asignado, aunque el bot heredado esté pausado para que Super Bot pueda
responder.

## Reglas del patch remoto

- Validar `sender` como `AGENT` o `BOT`; el flujo actual de `AGENT` no cambia.
- Para `BOT`, exigir `protocol: "super-bot-v1"` y aceptar IDs idempotentes con
  prefijo `ai:`.
- En `control`, tratar `sender: "BOT"` como propiedad de Super Bot: no es una
  toma humana ni una derivación. Aplicar `expectedRevision` atómicamente e
  incluir `sender` y `protocol` en su ACK y en su evento de control.
- Usar `requestId + fingerprint` para la misma idempotencia que un envío
  manual. Mismo ID con contenido diferente debe devolver `409`.
- No ejecutar una toma humana, pausa adicional ni cambio de propietario al
  enviar `BOT`; el chat ya fue tomado por Super Bot mediante el control previo.
- Emitir el eco hacia la aplicación con `sender: "BOT"` y
  `localMessageId: requestId`. Esto actualiza la burbuja local en vez de crear
  una segunda y evita que el eco se interprete como mensaje de asesor.
- Propagar el marcador de remitente solo dentro del bridge; no enviarlo a la
  API pública de Telegram si esa API no lo acepta.

## Pruebas obligatorias del bridge

1. El control y un envío `BOT` conservan el control del chat y no registran
   toma humana ni asignación de asesor.
2. Reintentar el mismo `ai:` devuelve el mismo ACK; contenido distinto devuelve
   `409`.
3. ACK y eco contienen los marcadores v1 y `localMessageId`.
4. Un bridge sin la capacidad no acepta que la aplicación tome ni responda un
   chat automático.
