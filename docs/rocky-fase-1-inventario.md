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
