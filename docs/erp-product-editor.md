# Editor de productos ERP

Implementado en Productos → abrir producto → **Editar producto en el ERP**.
El formulario habitual sigue guardando solo en la web y ahora lo indica en su botón.

## Uso

1. Cargar los datos actuales del ERP. El panel usa el ID externo del producto,
   no una búsqueda aproximada por nombre o código.
2. Editar los campos y pulsar **Revisar cambios del producto**.
3. Revisar los valores anteriores y nuevos y pulsar **Guardar cambios en el ERP**.
4. Consultar el historial. Aceptado no siempre significa verificado: los campos
   que la API no devuelve se indican como pendientes de comprobación en el ERP.

El stock tiene un formulario independiente de entradas/salidas por almacén.
La cantidad es un movimiento, no el stock final. Se registra una sola operación
por envío, sin encadenarla a cambios de código o precio. Después de cambiar un
código se deben cargar otra vez los datos antes de registrar un movimiento.

## Contrato utilizado

Fuente: colección del propietario consultada el 21/09/2026:
[Postman APIsPERU](https://documenter.getpostman.com/view/13401528/2s8ZDYWgFH).

- `GET /api/items/record/{id}`: lectura por ID.
- `GET /api/items/tables`: listas relacionadas; si no están disponibles, el
  administrador puede introducir el ID del registro ERP.
- `POST /api/items/update`: código interno, nombre, descripción breve, nombre
  secundario, código SUNAT y de barras, unidad, moneda, precios de compra/venta,
  categoría, marca, afectaciones IGV, ISC, percepción, ganancia y cálculo de cantidad.
- `name_long` y `factory_code`: descripción detallada como texto escapado y
  especificaciones. Su escritura se validó previamente; la API de lectura no
  siempre devuelve esos campos. Solo se envían cuando se editan.
- `POST /api/inventory/transaction`: `input`/`03` para entradas y `output`/`01`
  para salidas, con `item_code`, `quantity` y `warehouse_id`, según los ejemplos
  de Postman. El ERP confirma el movimiento; no se inventa un stock local final.

## Imágenes y límites

Se admite cambiar la referencia a una foto **ya alojada en el mismo ERP**, bajo
`/storage/uploads/items/`. Se conserva la referencia original cuando no se edita.
Antes de cambiarla se comprueba por HEAD que existe y tiene un tipo de imagen
admitido, sin seguir redirecciones ni enviar el token a la URL de la foto.
No hay una ruta de carga de archivos documentada en la colección. El formulario
público de JavaScript del ERP usa `/items/upload` con sesión web, lo que no
demuestra que exista `/api/items/upload` con Bearer. No se implementó una subida
inventada ni una dependencia de las cookies del navegador.

La carga de fotos nuevas desde un archivo sigue pendiente de un contrato API
autorizado. Tampoco se habilita eliminación remota ni campos exclusivos de la
ruta móvil (lotes, presentaciones, vencimientos): no se mezclan contratos distintos.
Los precios por caja/mayorista del formulario local no se envían como precio base.

## Persistencia y verificación

Solo administradores con sesión válida y sin cambio de contraseña pendiente.
Las escrituras exigen origen coincidente; las credenciales permanecen en servidor.
Se rechazan campos desconocidos, cantidades inválidas y cambios de ID externo.

Se reutiliza `ErpEditorialWrite`, el bloqueo PostgreSQL y el índice único parcial
de la migración `20260919090000_add_erp_editorial_writes`. No se necesita una
migración adicional. El historial es compartido con Fichas digitales.

Cada intento tiene un UUID y una huella de su operación. Antes del POST se guarda
la lectura original y el cuerpo exacto. Repetir el mismo intento no reenvía;
reutilizar su UUID con otro contenido se rechaza. Un timeout, respuesta ambigua o
error posterior a la escritura bloquea nuevos envíos hasta revisión manual.

Se relee el producto antes de enviar y se compara con la versión abierta.
Después de actualizar se comprueban tanto cambios solicitados como valores
reenviados para conservarlos, incluyendo la imagen y los precios. La API no tiene
escritura condicional: sigue existiendo una ventana entre lectura y escritura para
cambios concurrentes realizados directamente en el ERP.

Los cambios confirmados de código/nombre/descripción breve se reflejan en la web
solo si el producto local no cambió durante el envío. Se conserva el ID externo.
Los demás datos se importan con la sincronización existente; no se incrementa ni
decrementa el stock local mediante una estimación. La actualización completa
importa marca/categoría; una sincronización solo de stock no importa esos campos.

## Validación local

`npm run test:erp-products`: 19 pruebas aprobadas.

También pasaron `npm run test:catalog-sync` (34 pruebas, incluidas las 8 del editor
de fichas), TypeScript, ESLint de los archivos modificados y `npm run build`.
La compilación conserva un aviso de trazado de archivos en `catalog-pdf.ts` /
`next.config.ts`, ajeno al editor ERP.

Pruebas simuladas de preservación de datos, cambios de código, contrato de stock,
validación, repetición de intentos, conflictos, errores de conexión, discrepancias
de lectura y campos no verificables. La copia local no tiene configurado
`FACTURADOR_API_TOKEN`: no se hicieron escrituras reales ni se desplegó esta versión.
La integración de inventario y las nuevas referencias de imagen requieren una
prueba en el entorno conectado antes de declararlas validadas en producción.
