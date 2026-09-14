# Router V2: importación, pruebas y cutover seguro

Este runbook termina la preparación técnica sin desconectar ManyChat ni publicar workflows de producción antes de tiempo.

## Artefacto listo para importar

- `n8n/workflows/03-conversation-router-v2.json`
- Nombre al importar: `03 - Conversation Router V2 - STAGING`
- Estado incluido: inactivo
- No contiene tokens, claves ni IDs reales de credenciales.
- El JSON no contiene un ID de workflow. El importador asigna un ID aleatorio nuevo en una copia privada y comprueba que no figure entre los workflows existentes.

## 1. Validar el repositorio

Desde la raíz del proyecto:

```bash
npm ci
npx prisma generate
npm run test:chatbot
npx tsc --noEmit
npm run build
```

Antes de probar contra la base de datos de staging:

```bash
npx prisma migrate deploy
```

La migración agrega `ChatMessage.requestId` como clave idempotente única. Debe aplicarse antes de usar el nuevo envío manual.

## 2. Importar el workflow sin publicarlo

Para el VPS con el contenedor `n8n` en versión `2.38.6`, usar el importador comprobado:

```bash
node scripts/import-router-v2-staging.mjs --container n8n
```

El comando verifica la huella del JSON de la versión `4fbd981`, guarda exportaciones privadas de los borradores y de las versiones publicadas, e importa únicamente un workflow nuevo con `--activeState=false`. Asigna un ID aleatorio nuevo, comprueba que no exista y guarda la copia preparada en el respaldo. Esto corrige el fallo observado en n8n 2.38.6/PostgreSQL al importar el JSON sin ID: `null value in column "id" of relation "workflow_entity" violates not-null constraint`. Después comprueba que se creó exactamente ese ID, sus 43 nodos, su definición y que los workflows anteriores conservan su definición y publicación. Si ya existe un borrador idéntico e inactivo, lo conserva sin duplicarlo. No ejecuta workflows ni reinicia servicios.

Si el script se ejecuta fuera del repositorio, indicar `--workflow /ruta/al/03-conversation-router-v2.json`. Los respaldos se guardan en `importadora-n8n-backup-*` dentro del directorio personal del usuario. Son exportaciones de workflows, no un respaldo completo de la base de n8n ni de sus credenciales. Los detalles de los comandos quedan en un log privado; no se imprimen configuraciones en la terminal.

Ante una importación cuyo resultado no se pudo verificar, el comando conserva el bloqueo local para impedir una repetición automática. Revisar el respaldo y el workflow antes de retirar ese bloqueo o volver a importar. Las pruebas del importador se ejecutan con `node --test scripts/import-router-v2-staging.test.mjs`, utilizando Docker simulado, sin conectar con producción.

Para recuperar exclusivamente un intento anterior que falló por ese ID ausente:

```bash
node scripts/import-router-v2-staging.mjs --container n8n \
  --recover-from /root/importadora-n8n-backup-PebiZ4
```

El modo de recuperación exige el error exacto en el registro, un respaldo válido, el bloqueo vacío anterior y ausencia de otro importador activo. Consulta de nuevo n8n y compara todos los workflows con ese respaldo antes de continuar. Mantiene el bloqueo durante la revisión e importación y conserva el respaldo anterior. Si hay cambios o un resultado incierto, se detiene sin sobrescribir workflows ni retirar el bloqueo pendiente. Si el bloqueo ya fue retirado tras una recuperación exitosa, una repetición comprueba el borrador existente y no lo duplica. No ejecutar la importación directa del JSON sin ID como alternativa en esta versión.

Para el caso revisado de `STAGING - Outbound Messaging v3 CLEAN` (`YwSoeCWb8Joo3RAR`), se puede conservar la exportación reciente como referencia:

```bash
node scripts/import-router-v2-staging.mjs --container n8n \
  --recover-from /root/importadora-n8n-backup-PebiZ4 \
  --reviewed-before /root/importadora-n8n-backup-v1iZIJ/before.json
```

Esta opción admite exclusivamente las diferencias observadas en ese workflow: `versionId`, las posiciones de los nodos 6, 7, 17 y 18 y `nodes.17.disabled`. El cambio de `disabled` afecta al comportamiento; conservarlo no significa haber validado su ejecución. Se rechazan cambios en otros campos, otros workflows o en el conjunto de IDs. La exportación actual de n8n debe coincidir con la referencia revisada antes de importar. El respaldo nuevo registra la referencia y los campos revisados en `recovery.json`. La comprobación posterior sigue exigiendo que todos los workflows existentes conserven su estado previo a esta nueva importación.

No ejecute `publish:workflow` durante esta fase.

## 3. Asignar credenciales en el borrador

El workflow importado muestra tres credenciales pendientes. Asígnelas manualmente, sin pegar secretos dentro de nodos de código:

| Credencial n8n | Tipo | Configuración |
| --- | --- | --- |
| `Router V2 Internal API` | Header Auth | Nombre `x-internal-api-key`; valor idéntico a `N8N_INTERNAL_API_KEY` del backend |
| `Meta WhatsApp Bearer` | Header Auth | Nombre `Authorization`; valor `Bearer <token permanente>` |
| `Outbound V2 Internal API` | Header Auth | Nombre y valor exigidos por el webhook `STAGING - Outbound Messaging v2` |

Crear además esta variable de n8n:

| Variable | Valor |
| --- | --- |
| `ROUTER_V2_BACKEND_BASE_URL` | URL HTTPS del backend desplegado en staging, sin `/` final; nunca usar producción durante estas pruebas |
| `ROUTER_V2_OUTBOUND_WEBHOOK_URL` | URL de prueba del workflow `STAGING - Outbound Messaging v2` |

El backend necesita, como mínimo:

- `DATABASE_URL`
- `N8N_INTERNAL_API_KEY`
- `N8N_OUTBOUND_WEBHOOK_URL`
- `N8N_OUTBOUND_API_KEY`
- `OPENAI_API_KEY` para audio, visión y redacción opcional
- `ROUTER_V2_ENABLE_AI_DRAFTS=true` únicamente cuando la redacción opcional haya sido aprobada en staging; el valor seguro inicial es `false`
- `ROUTER_V2_WHOLESALE_CATALOG_URL`
- `ROUTER_V2_PAYMENT_METHODS`
- `ROUTER_V2_DELIVERY_METHODS`

`WHATSAPP_APP_SECRET` o `META_APP_SECRET` es obligatorio para recibir mensajes directamente en `POST /api/webhook/whatsapp`. Su ausencia devuelve `503` en esa ruta. La conexión n8n → `POST /api/internal/chat/incoming` se autentica con `N8N_INTERNAL_API_KEY` y no utiliza el App Secret del backend. Se puede preparar el borrador sin acceso a Meta; antes de cambiar el servicio o el tráfico entrante, confirmar cuál es el webhook que recibe los mensajes y conservar su verificación de origen. No desactivar la validación de firmas para omitir el secreto.

## 4. Conectar `01 - Incoming Messages` sin activación pública

En una copia de staging de `01 - Incoming Messages`, agregar un nodo **IF** después de `POST /api/internal/chat/incoming`. Llamar al nodo **Execute Sub-workflow** únicamente cuando `duplicate = false` (mensaje nuevo, normalmente HTTP `201`). Si `duplicate = true` (reentrega, normalmente HTTP `200`), finalizar sin volver a ejecutar el Router.

El borrador de Router V2 también descarta defensivamente la entrada cuando recibe `duplicate = true`.

Mapear exactamente:

| Entrada Router V2 | Salida de `/api/internal/chat/incoming` |
| --- | --- |
| `conversationId` | `conversationId` |
| `triggerMessageId` | `messageId` |
| `duplicate` | `duplicate` |
| `content` | contenido normalizado recibido |
| `messageType` | tipo normalizado recibido |
| `mediaUrl` | URL HTTPS temporal de Meta; si se usa Data URL, mantenerla dentro del límite aceptado por el inbound |
| `recipient` | teléfono WhatsApp normalizado, si ya está disponible |

Configurar el nodo para esperar el resultado del sub-workflow. Mantener tanto la copia de inbound como Router V2 sin publicar mientras se ejecutan pruebas manuales.

## 5. Matriz mínima de pruebas

Usar un número de prueba y productos reales de staging.

| Caso | Resultado obligatorio |
| --- | --- |
| Dos textos enviados con menos de 2.5 s | Una sola respuesta que use ambos fragmentos |
| Reentrega del mismo `externalMessageId` | Un mensaje inbound, un solo incremento de no leídos y ninguna segunda ejecución del Router |
| Mismo `requestId` outbound repetido | Un solo envío de Meta; la repetición devuelve el resultado previo |
| Chat con `botEnabled=false` | `nextAction=NO_AUTOMATION`, sin persistencia y sin outbound |
| Chat asignado a un asesor | Cero respuesta automática |
| Solicitud explícita de asesor | Estado `REQUIERE_ASESOR`, bot apagado y sin respuesta comercial adicional |
| Audio válido | Transcripción en español y continuación del mismo estado de venta |
| Audio ilegible o fallo de transcripción | Handoff humano; no se inventa contenido |
| Foto de producto | Vision extrae pistas y PostgreSQL confirma el producto |
| Foto durante `AWAITING_PAYMENT_CONFIRMATION` | No se ejecuta Vision; se guarda como evidencia no verificada |
| Producto ambiguo | Pregunta por variante; no elige SKU al azar |
| Stock cero | No invita a comprar ese producto |
| Precio y cantidad | Se recalculan desde PostgreSQL/ERP |
| Confirmación final repetida | No crea dos pedidos |
| Fallo de Router | Handoff, bot apagado y motivo interno registrado para diagnóstico |
| Salida con varias imágenes y texto | Se respeta el orden y cada elemento usa request ID distinto y estable |

## 6. Criterios de aprobación

No proceder al cutover hasta comprobar todo lo siguiente:

1. Build, TypeScript y `test:chatbot` en verde.
2. Migración aplicada en staging y respaldo reciente de PostgreSQL.
3. Credenciales seleccionadas en todos los nodos, sin secretos escritos en expresiones o notas.
4. `STAGING - Outbound Messaging v2` devuelve `ok=true`, `provider` y `messageId` reales con un número de prueba.
5. Las pruebas de takeover humano, duplicados, audio, imagen y voucher están aprobadas.
6. Existe una captura/exportación de los workflows publicados actuales para rollback.
7. Se definió una ventana corta de corte y una persona observando las primeras conversaciones.

## 7. Cutover controlado

En la ventana acordada:

1. Detener nuevas automatizaciones comerciales de ManyChat, sin eliminar la cuenta ni sus activos.
2. Publicar primero Outbound V2.
3. Publicar Router V2.
4. Publicar la versión de inbound que llama Router V2.
5. Enviar un mensaje real de prueba y confirmar inbound, estado, respuesta y persistencia.
6. Observar errores, latencia, duplicados y handoffs durante las primeras conversaciones.

No desconectar ManyChat del WABA como primera acción. La desconexión definitiva solo se evalúa después de verificar que Meta entrega inbound al nuevo webhook y que Outbound V2 envía correctamente.

## 8. Rollback

Si aparece duplicidad, silencio, error de credencial, `403` de Meta o respuesta automática durante atención humana:

1. Despublicar la versión nueva de inbound.
2. Despublicar Router V2.
3. Restaurar/publicar la versión anterior de inbound.
4. Reactivar la automatización anterior de ManyChat si se había pausado.
5. Mantener Outbound V2 sin tráfico o despublicarlo.
6. No borrar mensajes, estados de venta ni ejecuciones fallidas; se usan para diagnóstico.

El rollback no requiere revertir la migración `requestId`: la columna es nullable y compatible con mensajes previos.

## Prompt seguro para Antigravity

Si Antigravity tiene acceso a la terminal donde vive n8n, se le puede entregar este encargo literal:

```text
Trabaja únicamente en STAGING. Desde la raíz de este repositorio ejecuta npm run test:chatbot, npx tsc --noEmit y npm run build. Si todo pasa, importa n8n/workflows/03-conversation-router-v2.json como workflow NUEVO e INACTIVO usando n8n import:workflow --activeState=false. No publiques workflows, no modifiques los workflows actuales por ID, no desconectes ManyChat, no cambies webhooks de Meta, no envíes mensajes reales y no muestres secretos. Después valida que los 43 nodos estén presentes y reporta el nuevo workflow ID, las credenciales pendientes y cualquier error. Detente antes de publicar.
```
