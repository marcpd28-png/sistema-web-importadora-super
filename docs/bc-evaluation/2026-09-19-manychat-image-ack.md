# Confirmación de procesamiento del flujo de imagen

Código: `4fb4c2a`. Receptor `POST /api/webhook/manychat/image-ack`.

El receptor registra que el flujo llegó a su acción final. No envía mensajes, no inicia BC, no confirma entrega y no cambia el estado del mensaje. La confirmación se almacena en `metadata.manychatImageFlowAck`, mediante una combinación JSON atómica que conserva los metadatos existentes y la primera fecha de confirmación.

La firma por solicitud vincula `requestId` y `subscriberId`, con HMAC-SHA256 y un contexto específico. La clave interna nunca se envía a ManyChat. El futuro despachador generará el valor del campo `crm_imagen_ack_token` para cada solicitud. El receptor requiere exactamente un mensaje saliente de imagen de asesor vinculado a ese contacto y requestId. Rechaza firmas incorrectas, solicitudes desconocidas y resultados ambiguos.

Campos personalizados confirmados por API:

| Campo | ID |
| --- | --- |
| crm_imagen_request_id | 14982291 |
| crm_imagen_ack_token | 14982292 |

## Configuración en ManyChat

- Método POST.
- URL de producción: `https://tiendavirtualsuper.com/api/webhook/manychat/image-ack` (utilizar tras verificar el despliegue).
- Encabezado `Content-Type: application/json`.
- Cuerpo JSON: `requestId` desde el campo personalizado `crm_imagen_request_id`; `subscriberId` desde el campo del sistema ID de contacto; `token` desde `crm_imagen_ack_token`. Insertar los valores con el selector de variables del editor. Los tres valores deben ser cadenas JSON.
- Acción inmediatamente después del mensaje con imagen.

## Pendiente

Desplegar el despachador que rellene los campos, ejecute el flujo y coordine la cola por contacto con esta confirmación. El receptor por sí solo no cambia la ruta actual de imágenes ni soluciona su entrega. Resolver también las escrituras de metadatos del despachador para conservar una confirmación que llegue antes de la respuesta de `sendFlow`. No hacer reintentos ciegos ante respuestas ambiguas.

Desplegado el 19/09/2026 con respaldo: 111 pruebas pasadas, compilación aislada y HTTP 200 tras reinicio. La URL pública respondió 400 al cuerpo vacío, 401 a firma inválida y 409 a solicitud firmada inexistente. Se verificó el SQL en PostgreSQL contra un identificador inexistente: cero filas modificadas. TypeScript local también pasó. No se han enviado mensajes de prueba a clientes; el despachador sigue pendiente.
