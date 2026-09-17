# Automatizaciones de atención

El panel `/admin/mensajes/automatizaciones` permite crear borradores desde dos plantillas, configurar sus bloques, probar las respuestas y publicar una versión en n8n. Publicar deja el flujo **pausado**; la activación de WhatsApp es una acción independiente. Se admite un flujo activo por canal.

## Bloques disponibles

- Inicio: todos los mensajes de texto o coincidencia de palabras/frases separadas por comas.
- Respuesta: texto con `{{nombre}}` y `{{mensaje}}`.
- Condición: dos ramas, Sí y No, según palabras/frases del mensaje entrante.
- Productos: búsqueda en el catálogo publicado con precio unitario, precio mayorista, stock y enlace. La búsqueda puede ser fija o tomar `{{mensaje}}`.
- Asesor: respuesta de derivación, estado `REQUIERE_ASESOR` y bot desactivado. Termina el recorrido.

Cada mensaje inicia un recorrido. Esta versión no espera respuestas entre bloques ni mantiene un formulario conversacional; no crea pedidos, pagos ni cotizaciones. No interpreta audio ni imágenes. El simulador existente de BC sigue usando su propio flujo y no pasa por estas automatizaciones.

La pestaña **Probar** ejecuta el borrador actual, incluidos cambios sin guardar, con el mismo evaluador que producción. Puede leer productos reales, pero no crea contactos, pedidos, mensajes ni ejecuciones y no llama a los webhooks de envío. La pestaña **Actividad** muestra las últimas quince ejecuciones reales.

## Configuración del servidor

Aplicar `npx prisma migrate deploy` antes de verificar creación y guardado. La migración `20260917170000_add_automation_version_updated_at` añade el campo `AutomationVersion.updatedAt` que faltaba en las migraciones originales, aunque el modelo Prisma ya lo requería.

Variables necesarias para publicar:

| Variable | Uso |
| --- | --- |
| `N8N_BASE_URL` o `N8N_URL` | Instancia de n8n accesible desde la aplicación. |
| `N8N_WRITE_API_KEY` o `N8N_API_KEY` | Clave con permisos de crear, activar, desactivar y eliminar workflows. |
| `AUTOMATIONS_CALLBACK_URL` | Origen de esta aplicación, accesible desde n8n; por ejemplo `https://tiendavirtualsuper.com`. No usar el host del motor de BC. |
| `AUTOMATIONS_EXECUTION_SECRET` | Secreto aleatorio de al menos 32 caracteres, solo en el servidor web. |

Para activar atención real también se requieren:

- `AUTOMATIONS_WHATSAPP_ENABLED=true`. Si no está habilitada, el panel permanece en modo de pruebas.
- `N8N_OUTBOUND_WEBHOOK_URL` y `N8N_OUTBOUND_API_KEY`: integración de envío existente que confirma aceptación de ManyChat/Meta.
- Bot global habilitado y contacto real con `manychatSubscriberId` válido. Un contacto recibido directamente por Meta sin ese identificador no se envía por otro proveedor: el fallo queda registrado.
- Mantener un único responsable de responder a los mensajes: al habilitar este módulo, los flujos externos existentes no deben responder también a la misma entrada. Las entradas del piloto BC ya tienen la respuesta real aislada, según `docs/n8n/bc-simulator/README.md`.

## Ejecución y versiones

El editor persiste el diagrama completo, incluidas posiciones y conexiones. Guardar comprueba propiedad, estado de borrador y revisión mediante una actualización condicional. Guardar y publicar se serializan con bloqueos transaccionales de PostgreSQL. Una revisión publicada no se vuelve a editar.

Cada publicación crea un webhook de n8n único para esa versión y un nodo HTTP que llama a `/api/internal/automations/execute`. El diagrama se interpreta en la aplicación para compartir validación y comportamiento con la vista previa. Los workflows no incluyen claves de la aplicación, texto de clientes ni expresiones generadas a partir de sus mensajes.

La entrada real se registra antes de responder al webhook; el despacho ocurre mediante `after()`. Cada ejecución se firma por identificador y versión, con una vigencia de cinco minutos. El ejecutor solo puede tomar una vez una ejecución en cola, recupera el contenido de la base de datos y comprueba el bot, el estado del flujo y la conversación antes de cada respuesta. Las llamadas repetidas no reenvían mensajes. La respuesta manual de asesores conserva su comportamiento.

El estado pasa por `QUEUED`, `RUNNING` y `SUCCESS`, `FAILED` o `SKIPPED`. Las fallas no se reintentan automáticamente para evitar duplicar entregas de resultado incierto. Si se cae el proceso durante una ejecución puede quedar en cola/en curso: revisar actividad y n8n antes de intervenir. Este módulo no incorpora un worker de recuperación duradero.

El antiguo callback de estado sin autenticación devuelve `410`. Los nuevos flujos finalizan sus propios registros en el ejecutor firmado. Una publicación fallida conserva el borrador y trata de eliminar el workflow creado parcialmente. Los workflows anteriores se desactivan después de publicar una versión nueva.

## Verificación

`npm run test:automations` cubre el recorrido, sustituciones, validación de grafos, firmas, versiones, conflictos, fallos de publicación y ejecución con adaptadores de base de datos/n8n simulados. No requiere conectarse a clientes ni a la instancia real de n8n.

Para aceptación en un entorno con PostgreSQL/n8n: crear un flujo, editar y guardar, recargar, probar saludo/producto/asesor y publicar. Verificar el webhook registrado y el estado pausado. Activar solo cuando se haya preparado el canal real. La prueba del borrador valida la lógica, pero no sustituye la comprobación de conexión y permisos de n8n en el servidor.

Validación local del 17 de septiembre de 2026: 28 pruebas del módulo y 17 regresiones de mensajería aprobadas; TypeScript y ESLint de los archivos afectados sin errores. Las siete rutas administrativas devolvieron `401` sin sesión en un servidor Next.js real. Revisión del editor a 1280 y 390 píxeles con transporte de prueba: edición/recarga, saludo, producto, asesor, eliminación persistente de conexiones y publicación detenida por error de guardado; sin errores de consola ni desbordamiento horizontal en móvil. La compilación superó código y tipos, pero no completó la generación de `/sitemap.xml` por falta de PostgreSQL local en `127.0.0.1:5432`. No se publicó un workflow en n8n ni se enviaron mensajes a clientes durante estas comprobaciones.

## Despliegue en el VPS — 17 de septiembre de 2026

Código `50e0dde` y migración correctiva `bb99d87` desplegados en `/home/IMPORTADORA`, rama `codex/desarrollo-actualizado`. Compilación completa con PostgreSQL disponible y las 45 pruebas aprobadas. Copias previas de aplicación, entorno y base de datos, junto con los registros de instalación, compilación, pruebas y migración, en `/home/IMPORTADORA-backups/automations-50e0dde/`.

La verificación HTTPS autenticada comprobó creación y lectura del diagrama, guardado real en PostgreSQL, conflicto de revisión, vista previa de saludo/producto/asesor, página del editor y sus trece archivos JavaScript. Los registros temporales se eliminaron al finalizar; no se generaron ejecuciones reales ni mensajes a clientes. Las rutas administrativas rechazan sesiones ausentes y el ejecutor rechaza firmas inválidas. La bandeja, el simulador BC y ambos procesos PM2 siguen disponibles.

Se prepararon la URL de retorno y el secreto de ejecución en el entorno privado del servidor. Se conserva `AUTOMATIONS_WHATSAPP_ENABLED=false`. **Falta configurar una clave de escritura de n8n** (`N8N_WRITE_API_KEY` o `N8N_API_KEY`); mientras tanto, crear/editar/probar está disponible y Publicar informa la configuración pendiente. No se activaron respuestas automáticas de WhatsApp.
