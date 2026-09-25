# Visitas y mapas de calor con Microsoft Clarity

Acceso desde **Ventas y Marketing → Visitas y mapas de calor** (`/admin/analitica`).
El panel local muestra medición propia de sesiones, productos, búsquedas, cotizaciones verificadas, contactos y dispositivos. Los mapas y grabaciones se abren en Clarity. No hay cifras simuladas.

## Activación

1. Crea un proyecto en https://clarity.microsoft.com/ con el dominio público de la tienda.
2. Copia el ID desde Configuración → Instalación y establece `CLARITY_PROJECT_ID` en el entorno de producción. Es un identificador público, no una clave secreta.
3. En Clarity, requiere consentimiento de cookies y conserva el enmascaramiento.
4. Compila y despliega de nuevo. Un ID vacío o inválido desactiva Clarity; la medición propia continúa disponible con consentimiento.
5. Abre la tienda, acepta la analítica y navega. Comprueba la recepción de sesiones en Clarity; la configuración del ID por sí sola no confirma que haya datos.

## Cobertura

- Inicio, categorías, productos y fichas `/p/[slug]`.
- Clics y desplazamiento mediante Clarity; eventos `view_item`, `add_to_cart`, `begin_checkout` y `search` desde la instrumentación existente.
- No se envían a Clarity el término buscado, nombres de clientes ni datos de pedidos como eventos personalizados. `purchase` solo se enviará cuando un flujo invoque realmente `trackPurchase`; actualmente no hay llamadas a esa función.
- Se detiene el tracker al salir de las rutas admitidas y se reanuda al volver. El contenido textual de todo el documento está enmascarado, incluidos datos de cuenta, carrito y conversaciones. Esta decisión también oculta nombres de productos en grabaciones.
- La preferencia se conserva en este navegador; se puede cambiar con «Privacidad y cookies». Sin aceptación no se descarga Clarity. La publicidad se mantiene denegada.
- El enmascaramiento del DOM no elimina las URL que recoge el proveedor: no incluir datos personales en URL ni parámetros de enlaces.
- Usuarios/sesiones son estimaciones del proveedor y solo incluyen tráfico medido: no equivalen a todas las personas ni a conexiones simultáneas exactas. No hay datos anteriores a la activación.

## Comprobación en navegador después de configurar el ID

1. Sin aceptar, y tras rechazar: no debe haber descarga de `clarity.ms/tag`.
2. Tras aceptar: una única descarga del tag; comprobar solicitudes `collect` y sesiones en Clarity.
3. Cambiar filtros, abrir productos y añadir al carrito; comprobar mapas y eventos después del procesamiento.
4. Entrar en cuenta o administración: el tracker debe detenerse. Volver al catálogo y verificar que se reanuda.
5. Rechazar desde preferencias después de aceptar: verificar que cesa la captura y que al recargar no se descarga el tag.
6. Revisar que las grabaciones ocultan textos de clientes y conversaciones, tanto en móvil como en escritorio.

Referencias: [instalación](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup), [Consent V2](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2), [enmascaramiento](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking).

## Despliegue del 24 de septiembre de 2026

- Proyecto confirmado en la cuenta del propietario: **Pagina Importaciones Super**, ID `ynhpnooylq`.
- ID configurado en `.env` local y en el entorno privado del nuevo release.
- Release: `/home/IMPORTADORA-releases/clarity-20260924`, basado en el release público `rocky1-quantity-3668168`, aplicando exclusivamente los cambios de analítica.
- PM2: `importadora-clarity`, puerto `4013`, guardado para reinicios. Nginx dirige `@reverse_proxy` a este puerto; conserva los destinos específicos de asistente, ERP y mensajería.
- Respaldo para reversión: `/home/IMPORTADORA-backups/clarity-20260924/nginx.conf`. El proceso anterior del puerto `4012` permanece disponible. Antes de restaurar la configuración, comprobar si existen cambios posteriores de otras tareas.
- Compilación Next.js con webpack y TypeScript correcta; 3 pruebas aprobadas en Linux. Se limitó la compilación del release a un worker por memoria disponible.
- Verificación pública: inicio con el ID correcto, 18 recursos estáticos accesibles, política actualizada y administración redirigiendo al login sin sesión.
- Verificación en navegador: ningún script de Clarity antes de aceptar ni después de rechazar; al aceptar aparece una única etiqueta `https://www.clarity.ms/tag/ynhpnooylq`. Navegación a producto correcta, sin errores de consola observados.
- En Clarity se desactivó el permiso automático de cookies; la tienda comunica la aceptación mediante Consent V2. La detección de bots permanece activada.
- Recepción de sesiones todavía pendiente al terminar la instalación. El código oficial coincide con el ID instalado; su pantalla indica hasta 2 horas para los primeros datos. La consulta directa del tag devolvió HTTP 204 sin contenido durante la comprobación. No se han confirmado todavía mapas de calor ni grabaciones en el panel.

## Panel de comportamiento del 25 de septiembre de 2026

- Períodos móviles de 24 horas, 7 y 30 días; hora de Lima. Conteos de acciones por sesión independientes, no un embudo secuencial ni personas únicas.
- Tabla `StoreAnalyticsEvent` mediante migración aditiva. Endpoint con consentimiento explícito, origen coincidente, límites de frecuencia/tamaño, campos permitidos e identificadores idempotentes. No se copian mensajes ni formularios. Se filtran patrones sensibles en búsquedas, sin garantizar detectar cualquier dato personal escrito en texto libre.
- Sesión por pestaña con 30 minutos de inactividad; canal de origen y tamaño de pantalla. Retención aproximada de 90 días con limpieza cada seis horas al recibir eventos. Sin consentimiento no hay captura propia.
- Carritos sin cotización: sesiones con añadidos, sin confirmación observada, inactivas al menos 30 minutos. No demuestra pérdida de venta: puede haber cierre fuera de la web.
- Cotizaciones: se verifica `ERP_REGISTERED` y antigüedad menor de una hora antes de aceptar el evento. ID único evita duplicados. El endpoint es analítica pública, no un registro contable ni una medida antifraude.
- Pedidos pagados: creados en el período y estado actual PAID, excluyendo isTest y cargos sim_. Se muestran separados; no se atribuyen a sesiones.
- Productos: número de acciones, no cantidades. Búsquedas: resultados renderizados; excluye redirecciones directas y términos filtrados.
- La medición nueva no reconstruye el historial. Un bloqueo de red, rechazo de consentimiento o cierre de pestaña puede reducir cobertura.

### Publicación y verificación

- Release `/home/IMPORTADORA-releases/analytics-20260925`, basado en `clarity-20260924` con los archivos de esta funcionalidad. PM2 `importadora-analytics`, puerto 4018.
- Nginx: solo se cambió el destino de `@reverse_proxy` de 4013 a 4018. Rocky 1 conserva 4012 y Rocky 2 conserva 4017. Respaldo `/home/IMPORTADORA-backups/analytics-20260925/nginx.conf`.
- Migración aplicada en transacción y registrada mediante `prisma migrate resolve`; no se ejecutaron otras migraciones pendientes. El nuevo proceso usa `connection_limit=2` y `pool_timeout=15` para respetar el límite del servidor.
- TypeScript, ESLint y compilación Next.js con webpack aprobados. Ocho pruebas locales de consentimiento, rutas privadas, duplicados de vista, metadatos y filtros sensibles.
- Doce comprobaciones contra el proceso privado y otras doce contra el dominio público: autenticación, origen, JSON inválido, consentimiento, campos no permitidos, idempotencia, rechazo de cotizaciones inexistentes, limpieza de búsquedas sensibles y tres períodos del panel.
- Vista del HTML generado comprobada en navegador en pantalla estrecha. Búsqueda pública real de prueba: un evento de visita y uno de resultados vacíos recibidos después de aceptar. Datos temporales eliminados por sus identificadores de sesión; ningún pedido, cotización o mensaje real creado.
- Inicio público HTTP 200; panel protegido y consultando la base de datos. Las grabaciones/mapas continúan dependiendo de la recepción de datos en Clarity.
