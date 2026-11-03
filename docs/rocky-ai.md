# Super Bot

Panel: `/admin/mensajes/ia`. El proveedor de OpenAI está implementado, pero la clave se configura exclusivamente en el entorno privado del servidor como `OPENAI_API_KEY`. Nunca se introduce en el navegador ni se guarda en la base de datos. Sin clave no se hacen solicitudes de inferencia.

## Operación

- **Apagado:** no genera respuestas.
- **Copiloto:** propone un borrador; un administrador puede editarlo, aprobarlo o descartarlo.
- **Híbrido:** responde automáticamente saludos, información comercial autorizada (excepto pagos/devoluciones) y cotizaciones de una unidad. Lo demás requiere revisión.
- **Automático:** también cotiza varias unidades y alternativas verificadas. Reclamos, negociación, pagos realizados, archivos y solicitudes de asesor se derivan a una persona.

El módulo se instala desactivado y los canales comienzan en Apagado. Activar y seleccionar los modos es una decisión operativa desde el panel. Las conversaciones existentes se configuran individualmente desde su bandeja; los valores predeterminados solo incorporan conversaciones creadas después de guardar la configuración.

El simulador de `/admin/mensajes/simulador` permite a un administrador probar Super Bot con OpenAI y el catálogo actual sin activar el módulo, tomar control de una conversación ni enviar a ningún canal. Conserva como máximo 12 turnos de texto en el navegador y no crea mensajes, borradores ni trabajos de entrega. Cada administrador tiene una cuota de prueba independiente de hasta 30 solicitudes o 50 000 tokens diarios (o el menor límite configurado). Una respuesta que consulta el proveedor verifica en ese momento la clave, el modelo, la conexión y la respuesta estructurada de OpenAI; una derivación directa a asesor aplica la regla de seguridad pero no confirma la clave. Que el panel diga “clave detectada” sólo confirma que la variable existe.

Al aplicar un modo se pausa el bot anterior y se comprueba el control del canal. En Messenger también se requiere que el servicio de control entregue la conversación a la tienda, sin retorno automático pendiente a Meta. Los permisos y aprobaciones de WhatsApp, Telegram, Meta y TikTok siguen siendo requisitos de sus respectivas cuentas; este módulo no los concede ni confirma el estado de revisión de una aplicación.

Los adaptadores utilizan las conexiones existentes a YCloud, Telegram y ChatbotX. Instagram tiene su propia bandeja y selección de inbox. No se habilitan los antiguos workers de Super Bot.

### Despliegue aislado de Messenger

Messenger se mantiene apagado por defecto, incluso si el módulo general está activo. No activar el `autoReply` ni el agente predeterminado de ChatbotX: esos controles son globales para ese espacio y podrían afectar el mismo bot de Telegram. La ruta aislada usa únicamente la API de lectura/envío de la bandeja social y el controlador local de traspaso de Meta.

1. Aplicar la migración y el nuevo release con `MESSENGER_SUPER_BOT_COMPATIBLE="false"`; conservar `botMasterSwitch=false` para que WhatsApp, Instagram y TikTok sigan apagados.
2. Verificar en el servidor privado `SOCIAL_INBOX_API_TOKEN`, `MESSENGER_CONTROL_TOKEN` y la respuesta del controlador de Messenger. Después, establecer `MESSENGER_SUPER_BOT_COMPATIBLE="true"` y reiniciar el worker. El flag no concede permisos ni enciende ChatbotX.
3. En `/admin/mensajes/ia`, guardar el modo de Messenger después del despliegue (por ejemplo, **Automático**). Ese guardado registra la cerca de activación del canal; no basta con el interruptor global. Sólo se consideran inbounds posteriores a esa cerca, de menos de 24 horas, con ChatbotX aún habilitado y con el controlador confirmando que Meta es dueño.
4. El camino automático de Messenger usa siempre `gpt-6-sol`, aunque el campo de modelo histórico de Rocky tenga otro valor. La respuesta se envía con una clave de idempotencia durable por borrador; una entrega incierta se deja para revisión humana y no se reintenta automáticamente.

Si un asesor responde desde la bandeja local, la conversación queda en control humano antes del envío. El polling también rechaza cualquier conversación que ya tenga ChatbotX deshabilitado, un dueño distinto de Meta, una reanudación pendiente o una confirmación de propiedad no verificable. Para detener sólo Messenger, guardar su modo en Apagado o establecer el flag en `false` y reiniciar el worker; no hace falta ni se debe encender WhatsApp. La migración es aditiva: conservar la columna al volver al release previo es seguro, pero apagar el flag y el modo antes de cualquier reversión operativa.

Cuando ChatbotX expone un identificador de asesor asignado, el worker también rechaza esa conversación. La API actual de lectura/envío no garantiza ese campo ni ofrece una operación de asignación/transferencia por asesor; por ello este release no puede imponer la privacidad de bandeja ni reasignar entre los seis asesores dentro de ChatbotX. Para completar esa parte se necesita una API de asignaciones de ChatbotX o una bandeja local que persista las asignaciones. El control de propiedad actual sí evita que Super Bot responda a chats ya tomados por una persona.

## Respuestas y límites

OpenAI clasifica la consulta mediante Responses y una herramienta de consulta de catálogo de solo lectura. El servidor compone precios, cantidades e importes con información verificada; el stock se valida internamente, pero su cantidad nunca se comunica al cliente. El modelo no puede escribir en inventario ni confirmar pedidos/pagos. Sólo se informa al modelo qué categorías de políticas están disponibles: el texto aprobado —incluidos datos de pago— permanece en el servidor y se compone después de validar la decisión. Antes de enviar historial al proveedor, cualquier respuesta que contenga la política de pago se sustituye por un marcador y también se ocultan correos, teléfonos, documentos y números de cuenta. Los cambios de configuración registran sólo que la política de pago está configurada, no sus datos. Las políticas vacías requieren asesor.

La regla comercial predeterminada es precio publicado por unidad o por mayor según la cantidad configurada en el producto; no hay descuentos ni negociación de precios. El precio por cajón se considera únicamente si el cliente lo solicita de forma explícita y el catálogo confirma precio, unidades por cajón y disponibilidad suficientes. La cantidad de inventario no se revela en ninguno de estos casos.

### Imágenes, capturas y catálogo

La base visual inicial está separada de las respuestas automáticas. `RockyAiVisualEvidence` conserva sólo el hash, el MIME validado, el estado y los candidatos del catálogo; nunca conserva la URL privada del proveedor, los bytes de la imagen, ni el texto libre que devuelva el modelo. En una conversación local, un administrador puede usar **Analizar última imagen** (acción `analyze_visual` de la API administrativa). Mientras se define la política comercial de respuestas, una imagen sigue siendo una sugerencia o revisión humana, no una respuesta automática.

El descargador acepta únicamente imágenes recibidas por WhatsApp/YCloud y Telegram mediante los endpoints privados ya autorizados. Comprueba host, ausencia de redirecciones, tamaño máximo de 5 MB, firma real JPEG/PNG/WebP y un límite de píxeles. Los adjuntos de Messenger, Instagram y TikTok se rechazan hasta que cada proveedor tenga su propio descargador autenticado; una URL HTTPS de un mensaje no se considera una fuente segura por sí sola.

Primero se compara el SHA-256 con una foto fuente única de un producto publicado y vendible. Esa es la única coincidencia visual que puede llegar a ser una identificación afirmativa sin revisión. Si no hay coincidencia exacta, y `ROCKY_AI_VISION_ENABLED=true`, OpenAI recibe temporalmente la imagen como data URL con `store:false` y devuelve sólo evidencia observable (texto, marca, modelo, categoría, color y legibilidad). El servidor busca como máximo tres candidatos exclusivamente en el catálogo propio. Una captura, un recorte, una foto recomprimida, varios productos o una similitud visual nunca identifican por sí solos un SKU, precio o stock.

El interruptor de visión se instala en `false`. Antes de encenderlo se debe aprobar la política de retención, los mensajes de aclaración y el flujo de revisión. La lectura por visión requiere que Super Bot esté activado globalmente, además de `ROCKY_AI_VISION_ENABLED=true`. Cada lectura usa la misma cuota diaria y se reclama con una reserva idempotente por mensaje; dos administradores no pagan dos análisis del mismo adjunto. La evidencia vence a los 30 días y el worker la elimina. El análisis no navega ni descarga vídeos públicos de TikTok. Para reconocer capturas de contenido propio será necesaria una fase posterior: registrar cada publicación autorizada, extraer fotogramas privados y etiquetar explícitamente el producto y la escena antes de usarla como referencia.

El contexto se limita a 12 mensajes, se ocultan correos y números largos —incluidos CCI y cuentas— y se usa `store:false`. El contenido sigue saliendo al proveedor cuando se conecta la clave. El panel contabiliza solicitudes y tokens; no presenta una estimación monetaria como facturación real. Las cuotas se reservan antes de cada solicitud y se calculan por día de Lima.

Cada borrador vence a los cinco minutos. Antes del envío se revisan de nuevo catálogo, conversación, control, configuración y ventana de atención. Los cambios invalidan borradores pendientes. Un envío ya iniciado puede completarse después de una parada; una entrega incierta no se reintenta automáticamente.

La cola persiste en PostgreSQL. El worker usa bloqueos para evitar envíos duplicados y recupera envíos interrumpidos como inciertos. Los disparadores de base de datos invalidan borradores ante mensajes nuevos y respetan la parada global del bot. La intervención humana pausa la automatización.

## Instalación y arranque

1. Respaldar la base de datos y la versión actual.
2. Aplicar las migraciones mediante `prisma migrate deploy`, incluyendo `20261020000100_rocky_ai_modes` y `20261102090000_super_bot_visual_evidence`.
3. Generar Prisma y compilar la aplicación.
4. `npm start` inicia el sitio y `messages:ai` bajo el supervisor existente. No ejecutar otra copia sin necesidad; el bloqueo de PostgreSQL protege ejecuciones concurrentes.
5. Verificar que el panel indica conexión pendiente y que el procesador registra señal.
6. Cuando se decida conectar OpenAI, agregar `OPENAI_API_KEY` al entorno privado, reiniciar el servicio y seleccionar la activación/modos en el panel. Para Messenger aislado, seguir además los pasos de la sección anterior; no usar el agente predeterminado/autoReply de ChatbotX.
7. Mantener `ROCKY_AI_VISION_ENABLED=false` hasta completar las pruebas de imágenes. Al activarlo, probar primero con una conversación de Copiloto y una foto de catálogo conocida; no habilita por sí solo respuestas automáticas a adjuntos.

La migración es aditiva. Para volver al código anterior, detener el servicio, restaurar los archivos modificados, el cliente Prisma y la compilación respaldados y reiniciar. Conservar las tablas nuevas y los mensajes posteriores; no restaurar un respaldo completo de la base de datos sobre conversaciones más recientes.

## Verificación

`npm run test:rocky-ai` verifica reglas, descarga segura de imágenes, coincidencia de evidencia y el contrato de los proveedores con transporte simulado. Las pruebas no llaman a OpenAI ni a los canales.

Las pruebas de integración en `src/lib/rocky-ai/service.integration.ts` requieren una base **desechable** llamada `rocky_ai_test` en `127.0.0.1`, con migraciones y disparadores instalados. Establecer `DATABASE_URL` y `ROCKY_AI_TEST_DATABASE_URL` al mismo valor y ejecutar:

```sh
node --import tsx --test src/lib/rocky-ai/service.integration.ts
```

Estas pruebas eliminan sus datos de prueba. Cubren aprobaciones concurrentes, mensajes nuevos durante inferencia, control humano, parada global, recuperación de procesos, cambios de precio, límites de uso y entregas inciertas. La clave real y la calidad de respuestas del modelo solo pueden verificarse después de conectar OpenAI.
