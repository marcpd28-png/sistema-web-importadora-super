# Audios y stickers en la bandeja

La bandeja muestra los mensajes `AUDIO` con un reproductor y los mensajes
`STICKER` como imágenes WebP, incluidas las animadas. Si el archivo no está
disponible, conserva el mensaje con un aviso y permite reintentar una carga fallida.

## Recepción desde n8n

`POST /api/internal/chat/incoming` conserva la autenticación con
`x-internal-api-key`. Además de los campos habituales, admite:

- `type`: `AUDIO` o `STICKER` (también se acepta minúscula).
- `mediaUrl`: URL HTTP(S) del archivo accesible por el navegador.
- `mediaId`: identificador del archivo en Meta, cuando no hay URL pública.
- `content`: descripción opcional; puede omitirse para audio o sticker.
- `metadata.phoneNumberId`: número empresarial que recibió el archivo en Meta.

Ejemplo del cuerpo, sin credenciales:

```json
{
  "channel": "WHATSAPP",
  "externalContactId": "51999999999",
  "name": "Cliente",
  "externalMessageId": "wamid.ejemplo",
  "type": "AUDIO",
  "mediaId": "123456789",
  "timestamp": "2026-09-17T12:00:00Z",
  "metadata": { "phoneNumberId": "987654321" }
}
```

También se reconocen los datos originales de Meta en `metadata.message`
o directamente en `metadata`, como `audio.id` y `sticker.id`. El webhook de
WhatsApp ya guarda esta información. Esto permite mostrar mensajes antiguos
que todavía conserven el archivo o su identificador, incluso stickers que
antes se clasificaban como `UNKNOWN`.

El servidor recupera los archivos de Meta mediante una ruta autenticada de
administración, resuelve un enlace actualizado y mantiene el token fuera del
navegador. Utiliza la integración activa del número receptor o sus credenciales
de entorno correspondientes. No recupera archivos que Meta haya eliminado, ni
archivos cuyos datos n8n nunca haya enviado a la aplicación.

Cuando existe un `mediaId`, el reproductor y la imagen siempre utilizan la ruta
autenticada del servidor, aunque Meta también haya incluido una URL en el
webhook. Esas URLs requieren autorización y caducan; abrirlas directamente desde
el navegador produce errores 401. Esto también se aplica a mensajes ya guardados.

El flujo `01 - Incoming Messages` también debe conservar `type`, `mediaId`
y `metadata` al normalizar el webhook y enviarlos como JSON al endpoint interno.
`scripts/n8n/enable-inbox-media.mjs` aplica ese cambio sin alterar conexiones,
credenciales, búsqueda de ManyChat ni aislamiento del simulador. Guardar primero
el flujo anterior y publicar la versión modificada en n8n.

Si un registro antiguo de integración no tiene un token descifrable, se permite
usar el token del entorno únicamente cuando pertenece al mismo `phoneNumberId`.
Una integración válida mantiene prioridad. Los mensajes guardados previamente
sin identificador ni enlace de archivo necesitan reenviarse para recuperarlos.

Referencia: [descarga de medios de Meta](https://www.postman.com/meta/whatsapp-business-platform/request/zsq66eh/download-media).

## Base de datos

Aplicar las migraciones antes de iniciar la versión nueva:

```sh
npx prisma migrate deploy
npx prisma generate
```

La migración `20260917120000_add_sticker_message_type` añade `STICKER` al enum
existente sin modificar mensajes anteriores. El arranque de producción del
proyecto ya ejecuta `prisma migrate deploy`.

## Verificación

```sh
node --import tsx --test src/lib/message-media.test.tsx src/lib/messages-incoming-media.test.ts src/lib/whatsapp-message-media.test.ts
```

Estas pruebas usan archivos y servicios simulados; no envían mensajes a clientes.
