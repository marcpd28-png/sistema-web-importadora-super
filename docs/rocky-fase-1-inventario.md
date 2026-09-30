# Rocky — Fase 1: inventario y decisión de arquitectura

Fecha: 2026-09-30, America/Lima. Repositorio y VPS principal: commit `7900f30`.
Alcance: inspección de solo lectura de producción y documentación local. No se
detuvieron procesos, desactivaron workflows, rotaron credenciales ni cambiaron datos.

## Decisión de arquitectura para las siguientes fases

Una sola versión de la aplicación, una base comercial, un motor de conversación
y un único trabajador autorizado de envíos. Webhook y panel producen trabajos para
ese motor. n8n conserva únicamente integraciones y trabajos auxiliares justificados;
cualquier solicitud de respuesta de n8n atraviesa el mismo control de autorización,
estado humano e idempotencia. El modelo interpreta; el catálogo y código validan
producto, precio, stock y condiciones. El simulador usa el mismo motor con transporte
de prueba, sin destinatarios ni credenciales productivos.

La aplicación principal es la base de consolidación, pero no se sustituye la tienda
4031 hasta comparar y migrar sus funciones necesarias. Un proceso antiguo retirado
debe quedar detenido, eliminado del arranque y fuera de Nginx. Las copias de
recuperación se archivan sin ejecutarse.

## 1. Procesos PM2 observados

36 entradas: 5 online y 31 stopped. Todos corresponden al proyecto según nombre/ruta.

| ID | Proceso online | Carpeta en VPS | Función actual | Decisión y condición |
|---|---|---|---|---|
| 40 | importadora | /home/IMPORTADORA | Webhook YCloud, panel, API de conversaciones, medios; 4000 | Conservar y consolidar; separar envío y programación de ERP |
| 2 | importadora-router-v2-staging | /home/IMPORTADORA-router-v2-staging | Router y sales-state publicados en 4001 | Reemplazar; retirar cuando sus consumidores usen el motor único |
| 33 | importadora-roky-real-8dd84af | /home/IMPORTADORA-releases/roky-real-8dd84af | Tienda, asistente web, simulador y APIs históricas; 4031 | Migrar funciones y tráfico antes de retirar |
| 36 | importadora-ycloud-n8n | /home/IMPORTADORA-releases/ycloud-n8n-20260928 | Servicio Next en 4033; publica catálogos y comunicaciones | Reemplazar por almacenamiento común; no es el contenedor n8n |
| 38 | importadora-message-delivery | /home/IMPORTADORA-releases/roky-real-8dd84af | messages:worker: piloto BC, recibos e imágenes | Reemplazar por trabajador único; revisar y resolver cola pendiente antes de apagar |

Entradas detenidas, candidatas a retirar del registro PM2 tras respaldo y revisión
de dependencias estáticas (no hay que arrancarlas):

| IDs | Nombres exactos |
|---|---|
| 1 | catalog-enricher |
| 3–8 | importadora-rocky-web; importadora-rocky-web-v2; importadora-rocky-simulator; importadora-rocky-image-names; importadora-rocky-hidden-audit; importadora-erp-products |
| 9–14 | importadora-rocky-sales; importadora-rocky-store; importadora-store-assistant-ui; importadora-header-gap; importadora-rocky1-quantity; importadora-clarity |
| 15–20 | importadora-rocky2-conversations; importadora-rocky2-learning; importadora-rocky2-precision; importadora-rocky2-communication; importadora-analytics; importadora-analytics-colors |
| 21–26 | importadora-admin-mobile; importadora-admin-mobile-density; importadora-admin-mobile-compact; importadora-messages-mobile; importadora-messages-density; importadora-rocky-camera |
| 27–31 | importadora-rocky-catalog; importadora-rocky-supervised; importadora-rocky-4b; importadora-simulator-scroll; importadora-rocky-review |
| 37 | importadora-ycloud-outbound |

`pm2-root.service` está habilitado. El archivo `/root/.pm2/dump.pm2` difiere del
estado vivo: conserva online los IDs 6, 25, 28, 30 y 37, actualmente stopped.
Riesgo: resurrect/arranque puede restaurarlos. La retirada deberá actualizar y
verificar el dump; no basta con `pm2 stop`.

## 2. Emisores y configuración comercial

- Webhook principal: `src/app/api/webhook/ycloud/route.ts` envía directamente a YCloud.
- Asesor: `src/lib/messages-service.ts` también envía a YCloud.
- Trabajador 38: `scripts/message-delivery-worker.ts` llama a `processBcLivePilot`,
  reconciliación de recibos e imágenes ManyChat.
- `src/lib/bc-live-worker.ts` de la release histórica reclama `bc_queued` y envía
  directamente por YCloud; también invoca `/api/internal/chat/requests` en 4031.
- Configuración revisada para 38: `BC_LIVE_ENABLED=true`, `BC_LIVE_SCOPE=ALL`,
  `BC_LIVE_TEST_MODE=false`, inicio 2026-09-28. Es elegible para contactos reales;
  no se puede describir como un simulador inofensivo. No se verificó entrega real
  por cada camino mediante mensajes a clientes.
- n8n contiene salidas Meta, ManyChat y documentos HTTP. Aunque sin ejecuciones
  recientes registradas, siguen activos y no constituyen una salida centralizada.

La reconstrucción de configuración se hizo con archivos env y PM2, sin publicar
credenciales. Los launchers de 33 y 36 sobrescriben PORT a 4031 y 4033; sus valores
en archivos env no describen el puerto final. Los sockets confirman los puertos.

Las cinco aplicaciones online configuran PostgreSQL `localhost:5432/importadora`,
schema `public`. Diferencias entre URLs completas no demostraban bases distintas:
se compararon host, puerto, base y schema sin usuario ni contraseña.
Esto corrige la hipótesis anterior de bases separadas para tienda y bot.

Ollama está disponible en 127.0.0.1:11434 y su servicio está habilitado. La configuración
revisada activa Ollama en varias releases, incluida la principal; el router 4001 lo
desactiva. La ruta principal de WhatsApp no llama al reescritor Ollama. Corregimos
la afirmación previa de que Ollama estaba globalmente desactivado.

## 3. Tráfico Nginx y archivos

Configuración: `/etc/nginx/sites-enabled/tiendavirtualsuper.com.conf`.

| Destino | Rutas observadas |
|---|---|
| 4000 | /api/webhook/ycloud; /admin/mensajes; /api/admin/messages/; /api/admin/conversations y subrutas; /_next/static/; archivos css/js/fonts; /uploads/products/ |
| 4001 | /api/internal/chat/router-v2; /api/internal/chat/sales-state |
| 4031 | ruta general de tienda; /api/shop-assistant; simulador y su endpoint exacto; /admin/rocky; /admin/rocky/aprendizaje; /api/internal/rocky/; /api/internal/chat/requests; /admin/atencion; revisión y auditoría de catálogo |
| 4033 | /uploads/catalogs/; /uploads/communications/ |
| 5678 | dominio n8n.tiendavirtualsuper.com |

El fallback estático `@rocky_static` lee
`/home/IMPORTADORA-releases/rocky-supervised-20260926` aunque su proceso está detenido.
No borrar esa carpeta antes de migrar los recursos que todavía sirve.

Los directorios de PDFs de /home/IMPORTADORA y de la release 4033 son distintos
(inodos 7090742 y 12320790); no son almacenamiento compartido. Los cinco PDFs
recientes inspeccionados faltaban en la release pública. El enlace
`/uploads/catalogs/catalogo-celulares-d92ea50eb63cc4ab.pdf` respondió 404 durante la
auditoría previa del mismo día. Separar generación y publicación sin almacenamiento
común es una causa comprobada del fallo, independiente de los filtros del catálogo.

4000 y 4001 escuchan en 0.0.0.0; 4031/4033 en loopback. La revisión de firewall y
la necesidad de exposición directa quedan como comprobación previa a consolidar.

## 4. Docker y n8n

| Contenedor | Estado/arranque | Datos | Decisión |
|---|---|---|---|
| n8n | activo; unless-stopped; 127.0.0.1:5678 | PostgreSQL n8n; volumen n8n_n8n_data | Conservar plataforma; depurar workflows |
| n8n-staging | activo; unless-stopped; red host, N8N_PORT=5680 | PostgreSQL n8n_staging; volumen n8n_staging_data | Retirar este entorno heredado tras exportar; sustituir por pruebas aisladas si son necesarias |
| n8n_postgres | activo | Bases n8n y n8n_staging | Conservar; no eliminar al retirar staging |

Workflows de la base productiva: 20 en total, 11 activos, 9 inactivos.
Fechas siguientes en UTC, tal como las devuelve PostgreSQL. Ausencia de ejecución
retenida no prueba ausencia histórica de uso ni imposibilidad de activación externa.

| ID | Nombre | Activo | Última ejecución retenida | Destino propuesto |
|---|---|---|---|---|
| EZaAQCCbY3qWIWY1 | 01 - Incoming Messages | sí | 2026-09-21 | Retirar entrada paralela tras verificar integraciones externas |
| 19jLl9xVWxDslVVL | 03 - Conversation Router V2 - STAGING | sí | 2026-09-17 | Retirar router duplicado |
| KLb2eUqmr2JVRK4R | 04 - Product Search | sí | sin registro | Reemplazar consulta por servicio común |
| JMBAcoKFStcNFfFm | BC - Simulador - Catálogo PDF | sí | 2026-09-17 | Migrar a motor de prueba común |
| HVFMz7fCQXRNXB3U | BC - Simulador - Entrada | sí | 2026-09-27 | Migrar a motor de prueba común |
| YXvIlOEj45LpjONf | BC - Simulador - Motor conversacional | sí | 2026-09-18 | Retirar lógica conversacional duplicada |
| cAtPr0jPdf202609 | Catálogo automático de proyectores | sí | 2026-09-17 | Unificar generador y salida |
| 386c7deddf33dbb8 | ManyChat → Centro de Mensajes (inbound) | sí | sin registro | Retirar cuando se confirme origen único YCloud |
| dCECdX9nMtQEbBUy | Outbound Messaging | sí | sin registro | Retirar envío directo; pasar por cola única |
| fMANAA76DedfoMkQ | STAGING - Outbound Messaging ManyChat v4 | sí | 2026-09-29 | Retirar después de resolver dependencias ManyChat |
| YwSoeCWb8Joo3RAR | STAGING - Outbound Messaging v3 CLEAN | sí | 2026-09-17 | Retirar salida paralela |
| vVmkzPzLvQTU7x9V | 03 - Conversation Router | no | sin registro | Archivar |
| bbYsf3hmNRyoYUPd | 03 - Conversation Router V2 | no | sin registro | Archivar |
| 0CsBu1UDocZJubaM | STAGING - Outbound Messaging v2 | no | sin registro | Archivar |
| XTpZTIZ1NUG2ZbAS | My workflow | no | sin registro | Archivar |
| IkGXxlcgTyaHTdmE | Prueba Centro de Mensajes | no | sin registro | Archivar |
| 890ba76f16b54dee | Temporary ManyChat subscriber lookup (current contact) | no | sin registro | Archivar |
| 0a2162276a6977e8 | Temporary lookup Leon ManyChat | no | sin registro | Archivar |
| cef2ca1a7f5c8253 | Temporary lookup Leon by phone | no | sin registro | Archivar |
| qaCgdSLOCRaIxpHi | Verificación completada - Contacto 1906562052 | no | sin registro | Archivar |

Staging contiene 10 workflows: activos EZaAQCCbY3qWIWY1, 19jLl9xVWxDslVVL,
KLb2eUqmr2JVRK4R, dCECdX9nMtQEbBUy y YwSoeCWb8Joo3RAR; inactivos
vVmkzPzLvQTU7x9V, bbYsf3hmNRyoYUPd, XTpZTIZ1NUG2ZbAS,
IkGXxlcgTyaHTdmE y 0CsBu1UDocZJubaM. Dos ejecuciones retenidas, ambas del
2026-09-17. Exportar para respaldo y retirar las copias operativas heredadas.

Fuera de alcance: gestion-compras, cobranzas, super_portal, ventas_app, procesos_app,
rrhh_app, super_nginx_gateway y portainer; no desactivarlos para limpiar Rocky.

## 5. Arranque y tareas programadas

- `pm2-root.service`: habilitado; verificar dump después de la retirada.
- `ollama.service`: habilitado; conservar hasta evaluar modelos y consumidores.
- Docker n8n y staging: `unless-stopped`; detener no sustituye una retirada documentada.
- `/etc/cron.d/importadora-sync`: STOCK_ONLY cada minuto; STOCK_PRICE cada cinco
  minutos (2-57/5), ambos en /home/IMPORTADORA.
- Crontab root: optimize-images.ts cada diez minutos, límite 100.
- `npm start` principal lanza `sync:facturador-scheduler` mediante start-production.mjs;
  se comprobó el proceso erp-sync-scheduler vivo. Coexiste con cron: elegir un solo
  programador; comprobar locks antes de atribuir ejecuciones duplicadas concretas.
- No aparecieron timers de systemd con nombres Rocky/importadora/n8n/ERP.

Conservar sincronización e imágenes; retirar la programación redundante tras
demostrar que el mecanismo elegido cubre frecuencia, exclusión mutua y recuperación.

## 6. Preparación de credenciales

Hallazgo: fallback literal de API n8n en `src/lib/automations/n8n-provider.ts`.
No se reproduce su valor aquí. También se expusieron secretos en salidas de
diagnóstico anteriores: tratar las credenciales afectadas como candidatas a rotación.

Procedimiento preparado, todavía no ejecutado:

1. Inventariar referencias por nombre de variable/credential ID, sin copiar valores
   a Git: N8N_API_KEY, N8N_INTERNAL_API_KEY, YCLOUD_API_KEY y YCLOUD_WEBHOOK_SECRET.
2. Eliminar el fallback literal y exigir configuración explícita, fallando de forma
   controlada. Escanear historial y archivos rastreados mostrando solo ubicaciones.
3. Emitir reemplazos mediante el proveedor autorizado y actualizar consumidores
   conservados (aplicación, trabajador, n8n y endpoint de firma según corresponda).
4. Verificar autenticación y recepción; revocar claves antiguas. Para el secreto de
   webhook, coordinar ambos extremos para no perder eventos durante la transición.
5. Revocar integraciones retiradas; guardar únicamente referencias y fecha de cambio.

La rotación no se realizó: cambia integraciones productivas y forma parte del
trabajo de consolidación, no del inventario.

## 7. Orden de retirada y evidencias de aceptación

1. Implementar control único de propiedad humana, cancelación y envío (fase 2).
2. Migrar funciones comerciales necesarias de 4031/4001 al motor común, con prueba
   de paridad de tienda, panel y simulador. Resolver trabajos en cola del worker 38.
3. Unificar archivos y validar PDF/medios antes de trasladar rutas de 4033.
4. Redirigir consumidores y Nginx. Conservar fallback estático hasta renovar clientes
   y verificar recursos; después retirar la referencia a la release antigua.
5. Exportar workflows sin secretos en Git; desactivar duplicados, quitar triggers
   externos y retirar staging heredado. Conservar n8n para auxiliares justificados.
6. Retirar procesos PM2 reemplazados y detener las aplicaciones antiguas; actualizar
   dump, restart policies y cron. Archivar código/archivos con recuperación documentada.
7. Verificar procesos, listeners, Nginx, colas y ausencia de envíos por rutas retiradas.
   Probar restauración/arranque en entorno controlado: ninguna release vieja revive.

## 8. Límites y pendientes explícitos

No se validaron mediante llamadas a clientes todas las credenciales de envío, ni
se auditó el panel externo de YCloud/ManyChat para conocer todos sus triggers.
No se decidió borrar datos ni volúmenes. No se exportaron bases completas ni
secretos a la documentación. La comparación funcional entre releases y la
cuantificación de trabajos pendientes se harán antes de retirar sus consumidores.

La fase 1 entrega inventario observado, clasificación, arquitectura objetivo y
procedimiento de transición. No certifica que los defectos del bot estén corregidos.

## 9. Cierre operativo de la fase 2 — 2026-09-30

Este apartado registra cambios posteriores al inventario de solo lectura.
Código aplicado: `4f7bac1`; build productivo `WHzjNyycL7KVE55V9H4N8`.

- Webhook principal: produce trabajos persistentes en `RockyOutboundJob`; ya no
  llama al transporte. El saludo también conserva la espera de diez segundos.
- Trabajador único: PM2 `importadora-rocky-outbox` (41), directorio
  `/home/IMPORTADORA`, Node con `--env-file=/home/IMPORTADORA/.env --import tsx`,
  script `scripts/rocky-outbox-worker.ts`, kill timeout 20 segundos.
  `npm run messages:worker` permite ejecutarlo con la misma configuración.
- Cada trabajo captura revisiones de conversación e interruptor global. Las
  revisiones se comprueban después de la espera, al encolar y antes de enviar.
  Pausar/reactivar no habilita respuestas preparadas en una revisión anterior.
- Cuatro triggers protegen cambios desde versiones antiguas: control de
  conversación, interruptor global, inserción de mensaje humano y rechazo de colas
  retiradas. No existe reactivación automática después de una hora.
- La derivación admite únicamente su aviso, y lo cancela si el asesor interviene.
  Una respuesta incierta no se reintenta automáticamente; deriva el control y
  cancela el resto. Los trabajos caducan a los cinco minutos. El bloqueo del
  trabajador es compartido en PostgreSQL, también entre distintas instancias.
- YCloud recibe el ID local como `externalId` antes del envío. Sus recibos no
  confunden un BOT con un AGENT aunque lleguen antes de la respuesta HTTP. El
  panel distingue en cola, cancelado, aceptado y entrega incierta; actualiza
  estados de mensajes existentes, no solo nuevas burbujas.

Retirada realizada:

- PM2 38 y 37 eliminados del registro y del dump de arranque. Archivos históricos
  conservados como recuperación, sin esos emisores en ejecución.
- 67 mensajes BOT pendientes anteriores cancelados: 66 `bc_queued` del 29 de
  septiembre y uno `queued` del 19. Se conservan contenido, historial y motivo.
- n8n productivo: despublicados EZaAQCCbY3qWIWY1, 19jLl9xVWxDslVVL,
  cAtPr0jPdf202609, 386c7deddf33dbb8, dCECdX9nMtQEbBUy, fMANAA76DedfoMkQ y
  YwSoeCWb8Joo3RAR. Permanecen activos únicamente búsqueda y tres flujos de
  simulación, sin transporte directo.
- n8n staging: despublicados sus cinco workflows activos. Ambos contenedores se
  reiniciaron para aplicar la despublicación; staging queda sin workflows activos.
  No se borraron workflows, credenciales, bases ni volúmenes.
- Nginx: configuración global e ingreso interno apuntan a 4000; las entradas
  históricas `/api/webhook/whatsapp`, `/api/internal/chat/manychat-outgoing` y
  `/api/internal/chat/requests` devuelven 410. Tienda y archivos siguen en sus
  servicios previos. No se adelantó su consolidación funcional.

Verificación y recuperación:

- 29 pruebas de control/transporte y 25 de búsqueda aprobadas. Integración sobre
  PostgreSQL local desechable, incluyendo webhook firmado con espera real de
  diez segundos, intervención concurrente, dos trabajadores, apagado global,
  recibo temprano y recuperación de un envío incierto. Transporte simulado:
  estas pruebas no enviaron mensajes a clientes.
- TypeScript y build productivo aprobados. Migración
  `20260930170000_rocky_outbox` aplicada; cuatro triggers habilitados. Tienda HTTP
  200, webhook sin firma 401, rutas retiradas 410, n8n/staging health 200.
- Respaldo restringido en VPS: `/root/rocky-phase2-backup.TY69gW`, con dump de
  PostgreSQL, workflows exportados, configuración Nginx, estado PM2 y build
  anterior. Se validó el índice del dump; no se ensayó restaurarlo en producción.
  Nunca hacer `pm2 resurrect` del dump antiguo completo: contiene emisores que
  fueron retirados. Recuperar componentes individualmente y mantener cerrada
  la entrada automática mientras se corrige cualquier fallo.

Límites que permanecen para las siguientes fases:

- La cancelación cubre trabajo local pendiente. Un envío ya entregado a YCloud
  puede completarse después de la intervención humana; esta cola no lo revoca.
- La recepción/agrupación todavía espera dentro de la petición HTTP. Persistir
  también ese procesamiento y su recuperación pertenece a la siguiente fase.
- Las aplicaciones de tienda, router, archivos y simulador heredados continúan
  operativos hasta migrar sus funciones; se retiraron sus emisores, no toda la
  infraestructura. La lógica de recuperación comercial no se reescribió aquí.
- El historial productivo incluye once migraciones históricas ausentes en este
  checkout. No se borraron ni se reinició la base: la migración nueva es aditiva.
  La reproducción desde una base vacía necesita consolidar ese historial.
- Se quitó el secreto literal de fallback n8n del código actual. La rotación de
  credenciales ya expuestas y la limpieza del historial siguen pendientes.

## 10. Fase 3 — recepción durable y agrupación, 2026-09-30

Código desplegado: `c00e490`. Build: `ROj8ARDcfomwqfTau5ahT`.

- El webhook autentica y guarda mensaje, contacto, conversación y turno pendiente
  en una sola transacción; ya no duerme diez segundos ni genera respuestas dentro
  de la petición HTTP. Los reintentos del mismo mensaje no duplican la entrada
  ni prolongan su espera.
- Cada fragmento nuevo fija el vencimiento a diez segundos desde su recepción.
  Se conservan todos los IDs del lote, incluso cuando supera los doce mensajes
  del contexto anterior. Saludos aislados se separan de una consulta concreta:
  «Hola» seguido de precio o catálogo procesa la consulta, sin anteponer bienvenida.
- PM2 `importadora-rocky-inbox` (42) procesa dos conversaciones simultáneamente,
  con exclusión por conversación y recuperación de intentos interrumpidos.
  La versión y el token de procesamiento impiden publicar planes obsoletos.
- Respuestas, estado comercial y cierre del turno se guardan juntos. Un fallo
  durante la preparación no publica parte del plan. Los errores de preparación
  tienen tres intentos; después se solicita asesor. Los turnos vencidos tras
  quince minutos pasan a revisión humana sin enviar respuestas atrasadas.
- Se mantienen el emisor único `importadora-rocky-outbox` (41), la intervención
  humana y el interruptor global. Un fragmento nuevo cancela las respuestas aún
  en cola del turno anterior; los cambios de control cancelan también la entrada.
  No se reactivaron emisores ni workflows retirados en la fase 2.

Validación y despliegue:

- 46 pruebas de entrada/control/transporte más 25 de búsqueda aprobadas, TypeScript
  y build productivo correctos. Incluyen duplicados concurrentes, mensajes con
  fechas desordenadas, recuperación, intervención humana, interruptor global,
  publicación atómica, saludo + catálogo/precio y conversaciones simultáneas.
  Pruebas de integración en PostgreSQL local aislado, con transporte simulado.
- Migración aditiva `20260930190000_rocky_durable_inbox` aplicada en producción;
  seis triggers de control habilitados. Procesos 40, 41 y 42 online. Interruptor
  global conservado (`true`, revisión 0); no se reprodujeron mensajes históricos.
- Compilación en carpeta separada, cierre temporal del webhook y drenaje de la
  versión anterior antes del cambio. Tienda HTTP 200, centro de mensajes 307
  hacia autenticación y rutas retiradas 410. No se enviaron pruebas a clientes.
- Respaldo restringido `/root/rocky-phase3-backup.iKfzEi`: dump PostgreSQL con
  índice validado, Nginx, estados PM2, build anterior y workspace de compilación.
  La migración es compatible con el build anterior; una reversión requiere cerrar
  primero el webhook y detener inbox/outbox, sin resucitar emisores históricos.

Límites: la cola garantiza publicación atómica local, no entrega atómica de varios
mensajes en WhatsApp. Un envío ya aceptado por YCloud no se puede cancelar. La
calidad de recuperación de productos, los archivos multimedia y la consolidación
del resto de servicios siguen siendo trabajo de las fases siguientes.

Observación posterior al arranque: hubo entradas reales completadas en un intento
y otras canceladas por estar deshabilitada la automatización. El POST sin firma
respondió 401; PM2 guardó inbox/outbox online y ninguno de los dos emisores retirados.
No hubo reinicios del worker ni errores genéricos de procesamiento durante la
verificación. Sí se registró un error comercial de catálogo sin resultados para
una consulta informal sobre televisores: la normalización de esa búsqueda sigue
pendiente y no debe considerarse resuelta por la nueva cola.

## 11. Fases 4–6 — recuperación, conversación y multimedia, 2026-09-30

Desplegadas sucesivamente: `eb7b276` (fase 4), `67c11c9` (fase 5),
`50dcfaa` (fase 6). Respaldos restringidos, con base, Nginx y build anterior:
`/root/rocky-phase4-backup.wmKl9Q`, `/root/rocky-phase5-backup.HHmRbp`,
`/root/rocky-phase6-backup.9ZEp6d`.

- Respuestas y PDF usan una recuperación común: exige todas las restricciones,
  conserva modelo/tamaño y normaliza saludos, tildes, plurales y variantes conocidas.
  Solo devuelve productos visibles con stock y precio positivo. La descripción
  no determina la identidad; se excluyen accesorios de búsquedas de TV/celulares.
  El ajuste `d08d7ef` excluye también trípodes e intercomunicadores de parlantes.
- Saludos, catálogo, ubicación, horarios y pagos se resuelven antes del estado
  comercial pendiente. Una pregunta no se guarda como dirección. Las cantidades
  vuelven a consultar precio, umbral mayorista y stock; un número de modelo no se
  interpreta como cantidad. Ante ausencia de coincidencia fiable se deriva.
- Las respuestas idénticas de tipo/contenido/archivo no se publican más de dos
  veces por conversación; además se conserva la deduplicación de treinta minutos.
  Esto no equivale a detectar toda paráfrasis semánticamente redundante.
- El envío manual de imágenes normaliza a JPEG RGB compatible. Los formatos
  no compatibles se rechazan con explicación; no se instaló transcodificación
  de MOV/WAV/WebM. Audio saliente ya no incluye el campo caption no admitido.
  Las imágenes de producto se preparan y almacenan antes de enviarse; si falla
  la imagen se mantiene la información textual.
- Los PDF incluyen precio vigente y mayorista del ERP, con aviso de imagen
  referencial, concurrencia de preparación limitada y caché que cuenta las
  imágenes realmente incluidas. Se revisaron visualmente televisores/celulares
  y se corrigieron contaminaciones de accesorios detectadas en catálogos.
- Catálogos, comunicaciones, documentos y carga administrativa ya apuntan a
  4000. Se copiaron 34 archivos faltantes sin sobrescribir existentes. Retirado
  PM2 36 (`importadora-ycloud-n8n`); su directorio original permanece recuperable.
  Ese proceso era un servidor de archivos Next, no el contenedor n8n.
- Descarga real entrante de imagen/audio/video: proveedor respondió 200 con sus
  tipos correctos. No se enviaron mensajes sintéticos a clientes. La ruta local
  de archivos responde 206 a Range; Cloudflare devolvió 200 en una solicitud
  pública de caché fría, por lo que no se certifica todavía búsqueda temporal
  de todos los videos desde todos los navegadores.

Validación: 99 pruebas combinadas de colas, control, búsqueda, conversación,
PDF, formatos multimedia y webhook aprobadas; builds y TypeScript correctos.
Los casos de integración usan PostgreSQL local aislado, no datos de clientes.
La política sigue siendo determinista: no se declara comprensión universal ni
se introdujo un modelo que pueda inventar precios o productos.

## 12. Fase 7 — motor del simulador unificado; consolidación parcial

`c358c84`, `59bc983` y `d08d7ef` desplegados; build `SprRxUmFEigO0uR7t95le`.
Actualización `a47efe0`: saludos compuestos como «Hola buenas tardes» y
«Ola buen día»; build final `Ym-LwD7Z0570ZsBkCprrF`.
Respaldo: `/root/rocky-phase7-backup.UMOlnq`.

- El simulador administrativo ejecuta el mismo planificador de Rocky y guarda
  salidas de prueba, sin crear trabajos de WhatsApp. Solo admite conversaciones
  marcadas SIMULATOR; ignora un teléfono real suministrado por la interfaz.
  Las pruebas comprueban que no se producen envíos y se rechaza un chat real.
  Simula el motor, no la espera/entrega del proveedor de la cola productiva.
- UI y API del simulador ahora apuntan a 4000. Los endpoints internos antiguos
  `/api/internal/chat/simulate` y `/api/internal/chat/outgoing` responden 410.
- Exportados y despublicados tres workflows de simulador n8n:
  `HVFMz7fCQXRNXB3U`, `JMBAcoKFStcNFfFm`, `YXvIlOEj45LpjONf`.
  n8n reiniciado y saludable; solo permanece activo `KLb2eUqmr2JVRK4R`
  (`04 - Product Search`). Los exports restringidos están en el respaldo.

Pendiente antes de cerrar fase 7 y ejecutar la retirada final de fase 8:

- La tienda y pantallas heredadas aún se sirven desde PM2 33; router-v2/sales-state
  todavía desde PM2 2. Analítica, Colecciones, Atención y Evaluación/Aprendizaje
  no están completas en la aplicación principal. Se pidió decidir qué conservar;
  no se apagaron esos servicios ni se eliminaron pantallas silenciosamente.
- Unificar asistente público y búsqueda auxiliar; verificar paridad funcional y
  rutas antes del cambio global. No se afirma que la tienda ya use el motor único.
- Retirar staging y entradas PM2 antiguas solo tras resolver consumidores,
  conservando exportaciones y una recuperación documentada. Rotación de secretos
  históricos e historial de migraciones siguen pendientes (ver sección 9).

## 13. Consolidación y retirada operativa — fases 7–8, 2026-09-30

El usuario autorizó continuar por la vía más rápida y limpia. Se conservaron
funciones comerciales en la aplicación principal, sin reincorporar el motor BC,
el planificador antiguo de Rocky ni sus emisores.

Código: `ef9ea32` (migración de funciones) y `1bbce0e` (puerto privado).
Build: `6W2ldJiRptanoNNt0mmqN`. Respaldo restringido:
`/root/rocky-phase8-backup.f4Q2oh`.

### Funciones conservadas y cambios intencionados

- Tienda, filtros/categorías, carrito, navegación móvil, analítica con consentimiento,
  colecciones/ofertas/preventa, atención a fotos, auditoría de imágenes, edición
  vinculada al ERP y revisión de pedidos migradas desde la release 4031.
- Migración aditiva `20260930210000_consolidate_storefront`: adopta cuatro tablas
  comerciales existentes y `Order.isTest`, sin vaciar ni reiniciar datos.
- Evaluación de conversaciones usa `planRockyResponse` y la salida aislada de
  `runSimulation`. Una pausa o derivación no reactiva automáticamente el chat;
  tampoco se modifica la conversación real. Los turnos de medios requieren
  revisión del archivo original. No se presenta una confianza numérica inventada.
- Correcciones actuales y archivo histórico disponibles en Aprendizaje. Se
  retiró la activación de ejemplos para el planificador antiguo: conservar un
  ejemplo no modifica automáticamente precios, stock ni el motor productivo.
- Asistente público y búsqueda auxiliar usan el servicio compartido de catálogo.
  El asistente web ya no reescribe precios con Ollama ni entrega enlaces filtrados
  no verificados. Si falta una coincidencia ofrece el enlace al asesor, sin afirmar
  que ya asignó un chat de WhatsApp. La web conserva su adaptador de presentación;
  la cola de WhatsApp y el simulador comparten el planificador conversacional.

### Retirada verificada

- Nginx de la tienda apunta únicamente a 4000. APIs históricas de chat, router,
  sales-state, Rocky interno, catálogos antiguos y ManyChat devuelven 410.
- Retiradas 32 entradas antiguas de PM2 (IDs 1–31 y 33), además del candidato
  temporal 43. `dump.pm2` guardado con solo `importadora`, `importadora-rocky-inbox`
  e `importadora-rocky-outbox`. No se borraron las carpetas históricas.
- Estáticos necesarios para navegadores con una versión anterior conservados en
  `/home/IMPORTADORA-static-archive`; no requieren ejecutar una release antigua.
- n8n-staging: 10 workflows exportados, ninguno activo; contenedor detenido y
  retirado, volumen `n8n_staging_data` y base conservados. Inspección de recuperación
  y export en el respaldo. n8n productivo sigue saludable con la búsqueda auxiliar;
  no se tocaron los otros contenedores de la empresa.
- Cron duplicado `/etc/cron.d/importadora-sync` trasladado al respaldo como
  `importadora-sync.disabled`. Se conserva el scheduler ERP de la aplicación,
  con precios cada minuto y completo cada hora, más reconciliación de medianoche.
  No se retiró la tarea independiente de optimización de imágenes.
- Web escucha en 127.0.0.1:4000; Nginx es la entrada pública. No deben quedar
  listeners 4001, 4018, 4031, 4033 ni 5680.

### Evidencia y límites

- 209 pruebas combinadas más 3 de evaluación aprobadas; TypeScript y build
  productivo correctos. Incluyen carrito sin almacenamiento, revisión de pedidos,
  escritura ERP con transporte simulado, consentimiento y clasificación comercial.
- Candidato probado antes del cambio: HTTP 200 en tienda, categoría televisor y
  ocho pantallas administrativas autenticadas. Tras el cambio: tienda 200,
  router retirado 410, webhook sin firma 401. Sin pruebas enviadas a clientes.
- Consultas de lectura productivas: extensor de pantalla devuelve O832/PC402/PC401;
  máquina de hielo devuelve N1434; iPhone 15 sin coincidencia ofrece asesor.
  Las tres respuestas no incluyen enlaces filtrados ni reescritura de modelo.
- La herramienta de navegador falló dos veces por timeout: las comprobaciones
  HTTP no sustituyen una revisión visual/interactiva completa del panel.
- Siguen pendientes la rotación coordinada de credenciales históricas, el historial
  completo de migraciones para restauraciones desde cero y las comprobaciones
  externas del proveedor descritas anteriormente. No se afirma entrega perfecta
  de todos los medios ni comprensión universal del lenguaje.

Recuperación: cerrar webhook, detener inbox/outbox, restaurar build y Nginx de
este respaldo de manera coordinada. No ejecutar `pm2 resurrect` sobre el inventario
antiguo completo ni reactivar emisores/workflows retirados. El respaldo de base
se validó con `pg_restore -l`; no se ensayó una restauración completa en producción.

## 14. Recuperación general de productos (30 de septiembre)

- La corrección ortográfica utiliza vocabulario del catálogo completo: una edición
  inequívoca, sin modificar códigos, números ni marcas conocidas. No se agregan
  excepciones por SKU. Palabras ambiguas siguen siendo restricciones.
- Identidad y elegibilidad comercial se calculan por separado. Solo se ofrecen
  productos visibles, con stock y precio positivo, consultados nuevamente al cotizar.
- Las medidas se normalizan conservando su unidad: 32 pulgadas no equivale a 32 GB.
- Búsqueda compartida por respuestas, simulador, PDFs e integración interna.
- Cuando la respuesta determinista queda vacía, el modelo local puede proponer
  una consulta alternativa. Tiene límite de seis segundos y salida validada.
  Sus resultados solo generan una pregunta de confirmación, sin precio ni pago;
  se mantienen los controles de cancelación por intervención humana y duplicados.
- No hay nuevo proceso, workflow ni migración. Los productos ocultos no se publican
  y los fallos del modelo conservan la derivación segura. Esta mejora no garantiza
  comprensión universal ni habilita coincidencias semánticas directas para PDFs.
- La interpretación de modelo queda DESACTIVADA por defecto hasta superar una
  evaluación de latencia/calidad real (`ROCKY_QUERY_INTERPRETATION_ENABLED=true`
  más `OLLAMA_ENABLED=true` son necesarios). En la VPS el modelo configurado
  agotó seis segundos en cuatro consultas; el modelo pequeño probó una salida
  inadecuada y tardó más de diez segundos. No se habilita solo por estar instalado.
  Sí queda activa la búsqueda léxica general corregida; esto no completa todavía
  la recuperación semántica propuesta.
- Desplegado código `0d983f3`, build `JqBgnE5-u17aj73rIM4mK`; respaldo
  `/root/rocky-search-backup.W2yeLf`. 220 pruebas combinadas aprobadas y 64
  comprobaciones del núcleo repetidas después del interruptor del modelo.
  TypeScript y build correctos. Contra 7.256 productos, búsquedas de identidad
  entre 212 y 437 ms en seis consultas de lectura (no es una prueba de carga).
  Producción: tienda 200, webhook sin firma 401, entrada antigua 410; consultas
  públicas de licuadoras con error ortográfico, ventiladores e hielo correctas.
  Solo tres procesos PM2 activos, interruptor global conservado en true;
  seis trabajos recientes enviados al proveedor, sin fallos en la ventana leída.
  No se enviaron mensajes sintéticos a clientes ni se activó otro workflow.

## 15. Bienvenida universal solicitada por el negocio

La primera respuesta automática de una conversación, después del debounce de
diez segundos desde el último mensaje, ahora es únicamente la bienvenida
proporcionada por el propietario. Aplica aunque el primer mensaje sea producto,
catálogo, multimedia, texto desconocido o petición de asesor. La atención por
intención se retoma en el siguiente turno del cliente; no se agrega una búsqueda
ni una derivación a esa primera bienvenida. No se reinician conversaciones que
ya tuvieron respuesta automática ni conversaciones pausadas por intervención humana.

Incluye el enlace `https://mc.ht/s/rwQ7BMz`, la referencia a 14 PDFs y las preguntas
Lima/provincia y unidad/mayorista. Se utiliza negrita de WhatsApp (un asterisco).
Horario de bienvenida, ubicación y consulta de horario unificado en 8:00 a. m.
a 8:00 p. m. todos los días, incluidos domingos, según indicación del propietario.
62 pruebas de conversación, pausa, outbox y webhook aprobadas; TypeScript correcto.

## 16. Rocky informativo, sin asesoría automática de productos

Por decisión del propietario, se retiran del motor activo la búsqueda de productos,
tarjetas individuales, recomendaciones, confirmación de modelos y cotización por
cantidad. No se llama al intérprete de modelos. Los estados comerciales antiguos
no habilitan estos caminos. Las consultas de productos se derivan a un asesor.

Se conservan bienvenida universal con debounce, catálogos PDF solicitados
explícitamente, enlaces de catálogos/tienda, ubicación, horario, envíos y medios
de pago. La bienvenida ahora atribuye al asesor la ayuda sobre productos. Se
elimina la conversión implícita de cualquier seguimiento en una petición de PDF.
WhatsApp y simulador comparten el motor; el chat público también queda informativo.
El buscador manual de la tienda y los datos necesarios para los PDFs permanecen.

El emisor cancela trabajos antiguos de búsqueda/cotización que sigan en cola
(`product_automation_retired`). No se borran historiales ni estados comerciales.
72 pruebas de motor, controles de envío, catálogos y webhook aprobadas.

## 17. Auditoría y retirada final del buscador n8n

Verificados GitHub y VPS con código `1ef0373` y build
`4Wg9TQV0mk7FGbjCuDURe`. PM2 activo y guardado contiene únicamente
`importadora`, `importadora-rocky-inbox` y `importadora-rocky-outbox`, todos
desde `/home/IMPORTADORA`. Una sola instancia web en 127.0.0.1:4000 y un
scheduler ERP dependiente de la aplicación; sin instancias 4001/4018/4031/4033
ni n8n staging 5680. No se modificaron servicios de otros proyectos.

Se retiró la publicación del último flujo n8n activo, `04 - Product Search`
(`KLb2eUqmr2JVRK4R`), mediante `unpublish:workflow`. No había ejecuciones
en curso. Exportación recuperable en
`/root/rocky-retirement-backup.0AkS32/product-search.json`. Se reinició n8n:
salud HTTP 200 y cero workflows activos después del reinicio. La plataforma
y su base de datos se conservan; Rocky genera sus PDFs desde la aplicación,
sin depender de ese buscador. Los flujos históricos quedan inactivos, no borrados.
