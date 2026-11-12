# Bridge TikTok / ChatbotX

Este puente se instala como servicio independiente, no modifica el worker compilado de ChatbotX y empieza **apagado**. Su único propósito es traducir los mensajes TikTok que llegan a ChatbotX al contrato privado de Super Bot.

## Cuándo activarlo

No lo actives hasta que TikTok apruebe **Business Messaging API**, el conector TikTok esté autorizado dentro de ChatbotX y exista una conversación de prueba consentida. La API de TikTok Accounts no habilita DMs y no debe usarse para este puente.

Mientras `TIKTOK_BRIDGE_ENABLED=false` (valor por defecto), el puente solo observa y guarda una línea base de mensajes: no llama OpenAI, no consulta Super Bot y no envía nada al cliente. Aun en ese modo necesita la URL y el token de lectura de ChatbotX; si faltan, el endpoint `/health` falla en vez de aparentar que existe una línea base.

## Variables de servidor

```dotenv
TIKTOK_BRIDGE_ENABLED=false
TIKTOK_BRIDGE_DB=/data/tiktok-bridge.db
TIKTOK_BRIDGE_HOST=127.0.0.1
TIKTOK_BRIDGE_PORT=13125
TIKTOK_BRIDGE_SECRET=<aleatorio-de-32-o-mas-caracteres>

CHATBOTX_API_URL=https://chatbot.tiendavirtualsuper.com/api
SOCIAL_INBOX_API_TOKEN=<token-privado-del-workspace>
SUPER_BOT_URL=https://tiendavirtualsuper.com/api/internal/super-bot/reply
SUPER_BOT_INTERNAL_API_KEY=<clave-interna-de-super-bot>
```

En el entorno de la tienda agrega exactamente el mismo `TIKTOK_BRIDGE_SECRET` y:

```dotenv
TIKTOK_BRIDGE_URL=http://127.0.0.1:13127
TIKTOK_BRIDGE_SECRET=<mismo-secreto-del-puente>
```

El contenedor publica ese puerto **sólo** en `127.0.0.1`; no uses una URL pública ni expongas el endpoint de control a Internet.

Nunca añadas estas variables al navegador, al repositorio ni a una URL.

## Comportamiento

- Consulta solo conversaciones `channel=tiktok`, deduplica por conversación + `sourceId`/id de mensaje y junta mensajes consecutivos después de tres segundos de silencio.
- Envía al Super Bot el historial breve, el primer contacto, los productos visuales ya mostrados y solo metadatos de adjuntos; no reenvía binarios ni URLs privadas de clientes.
- Envía hasta tres fotos JPEG verificadas de la tienda antes del texto. Con dos o más fotos y sin pregunta técnica cierra únicamente con `¿Cuál de estas opciones te interesa?`.
- Sube imágenes y PDFs a Media Library mediante URLs firmadas de ChatbotX. TikTok solicita al generador un bundle completo de partes de hasta 5 MiB. Si una parte vieja o inválida supera el límite, el puente no entrega un subconjunto: explica el límite y enlaza a la tienda.
- Un asesor que escribe crea un lease local de 8 segundos. No cambia el dueño permanente de la conversación. Un handoff real se hace desde ChatbotX con `disable-bot`.
- Si Super Bot responde `requiresAdvisor: true`, el puente no entrega texto, tarjetas ni fallbacks; desactiva el bot de la conversación y deja el chat en **Pendientes** para atención humana.

## Prueba segura

```bash
python3 -m unittest integrations/chatbotx-tiktok/test_bridge.py
```

Con el contenedor levantado en modo de espera, verifica además que `curl -fsS http://127.0.0.1:13127/health` responda `{"ok":true,"enabled":false}`. El proceso escucha el puerto `13125` dentro del contenedor; `13127` es el puerto de loopback libre del VPS. No cambies `TIKTOK_BRIDGE_ENABLED` a `true` hasta tener la aprobación de Business Messaging, el conector autorizado y una conversación de prueba consentida.

Antes de producción valida: primer contacto, tres mensajes agrupados, repetición del mismo evento, lease de escritura, dos imágenes + cierre, PDF menor de 5 MiB, 202/409/429 y handoff humano.
