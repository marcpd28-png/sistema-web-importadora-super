# Conservación de descripciones al sincronizar el ERP

La descripción es contenido editorial de la tienda desde que se crea el producto.
El ERP puede aportar la descripción inicial de un producto nuevo, pero sus
actualizaciones no escriben `Product.description`, aunque envíen otro texto,
una cadena vacía o `null`. La edición y la publicación desde las fichas siguen
disponibles. Las especificaciones y el perfil digital tampoco forman parte de
las actualizaciones ERP.

La protección cubre la escritura SQL masiva, su alternativa Prisma, la
actualización por identidad externa, la cola de eventos y el script individual.
No se lee y vuelve a guardar una descripción anterior: se omite su escritura,
para conservar también ediciones realizadas durante una sincronización.

Una descripción ya vacía en un producto existente se conserva vacía hasta que
se edite o se publique una ficha. Este cambio no restaura descripciones perdidas
ni activa investigaciones automáticas.

Validación: `npm run test:catalog-sync`. Las pruebas ejecutan las funciones de
escritura con una base simulada y verifican el SQL generado; no se conectan al
ERP ni ejecutan sincronizaciones en producción.

Para activar la protección en producción se debe desplegar la versión corregida
y reiniciar los procesos web y de sincronización que ejecuten el código anterior.
