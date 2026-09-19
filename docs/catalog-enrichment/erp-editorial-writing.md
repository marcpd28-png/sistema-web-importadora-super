# Enviar una ficha al ERP

En Administración → Fichas digitales, abre un producto vinculado al ERP,
edita su descripción y especificaciones y pulsa **Guardar y enviar al ERP**.
El guardado normal sigue disponible sin enviar al ERP.

Se guarda primero la ficha local. El servidor consulta el producto ERP por
su identificador y comprueba el código antes de escribir. Envía el contenido
completo como HTML escapado a `name_long` y un resumen técnico de hasta 250
caracteres a `factory_code`. Conserva el título original (`description`),
la descripción breve original (`name`), los precios e imagen consultados.
No modifica stock ni presentaciones. La API requiere reenviar algunos datos
comerciales; no proporciona actualización condicional para impedir cambios
simultáneos hechos en el ERP durante esos segundos.

Solo administradores pueden enviar. La clave API permanece en el servidor.
`ErpEditorialWrite` conserva el usuario, el registro API previo, el envío
exacto y su resultado. Un identificador único por intento, un bloqueo de
PostgreSQL y un índice parcial evitan envíos simultáneos o repeticiones.
No se reintenta automáticamente un POST. Los errores de conexión o de
servidor que podrían haber ocurrido después del guardado quedan pendientes
de revisión manual. «Ya revisé este envío en el ERP» registra esa revisión;
no certifica técnicamente el contenido ni reenvía nada.

La API actual acepta los detalles pero no los devuelve al consultar.
«Envío aceptado» significa que respondió `success: true`, no que se hayan
releído los campos. Revisa el resultado en el ERP. Mientras el proveedor no
exponga esos campos, la copia local es necesaria y las sincronizaciones
conservan las descripciones existentes en vez de sustituirlas.

Requiere aplicar la migración `20260919090000_add_erp_editorial_writes` y
regenerar Prisma antes de iniciar la versión nueva. Usa la conexión existente
`FACTURADOR_API_URL`, `FACTURADOR_API_TOKEN`, `FACTURADOR_SYNC_SOURCE`.
No necesita acceso directo a la base de datos ni al servidor del ERP.

Validación: `npm run test:catalog-sync`; la prueba de concurrencia real
`scripts/erp-editorial.integration.ts` exige una base PostgreSQL desechable
con nombre `erp_editorial_test_20260919`, esquema e índice de la migración.
