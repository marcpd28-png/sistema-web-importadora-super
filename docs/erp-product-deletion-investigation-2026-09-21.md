# Eliminación de productos desde la tienda: investigación

Fecha: 21/09/2026. Investigación de solo lectura. No se ejecutaron acciones de
eliminación, inhabilitación ni habilitación, ni se modificaron productos.

## Resultado

La aplicación web del ERP instalado sí ofrece eliminación e inhabilitación.
No se ha confirmado una ruta equivalente que acepte el token Bearer de la tienda.
La existencia de una acción web no demuestra que añadir `/api` a su URL funcione.

## Evidencia del ERP instalado

Se descargaron recursos públicos de JavaScript, sin sesión ni credenciales:

- [Registro de componentes](https://original.negocioserp.com/build/assets/js/app-9bed83ca.js).
- [Listado de productos](https://original.negocioserp.com/build/assets/js/resources/js/views/tenant/items/index-b3164a27.js).
- [Acciones compartidas](https://original.negocioserp.com/build/assets/js/deletable-4ef16421.js).

El listado declara `resource: "items"`. Las funciones observadas son:

| Acción | Método y ruta usados por la interfaz |
| --- | --- |
| Eliminar | `DELETE /items/{id}` |
| Eliminar definitivamente | `GET /items/erase/{id}` |
| Inhabilitar | `GET /items/disable/{id}` |
| Habilitar | `GET /items/enable/{id}` |

**Las tres últimas rutas modifican datos aunque usen GET. No deben abrirse para
investigar ni comprobar conectividad.** Ninguna se ejecutó durante esta revisión.

El botón de eliminación ordinaria está condicionado por `can_edit_product`.
El borrado definitivo depende de `erase_item_indivual` y del rol administrador,
o del rol superadministrador. Son condiciones de la interfaz; falta verificar
las validaciones y autorizaciones del servidor. No se deduce de este código si
el borrado ordinario es físico o lógico ni qué relaciones impiden ejecutarlo.

La confirmación del borrado definitivo advierte de problemas con reportes,
visualización de comprobantes y operaciones posteriores sobre documentos
asociados. No corresponde convertirlo en alternativa automática cuando falla
la eliminación ordinaria.

## Documentación revisada

1. [Postman compartido por el propietario](https://documenter.getpostman.com/view/13401528/2s8ZDYWgFH),
   consultado mediante su JSON público de colección. Incluye lectura, creación,
   actualización de productos y movimientos de inventario; no se encontró
   eliminación o inhabilitación de productos.
2. [Manual oficial de Factura Perú](https://facturaperu.com.pe/manual_smart/).
   Su página carga el [catálogo JSON de endpoints](https://facturaperu.com.pe/wp-content/plugins/fs-api-docs/data/endpoints.json).
   Se inspeccionaron sus 121 entradas: no se encontró eliminación/inhabilitación
   de productos. La única entrada DELETE corresponde a reclamos, no productos.
3. El [manual de usuario del proveedor](https://facturaperu.com.pe/wp-content/plugins/fs-api-docs/data/user_manual_smart.json)
   describe eliminación e inhabilitación en el menú de productos, pero no
   documenta un contrato Bearer para esas acciones.

La documentación general del proveedor es evidencia complementaria; el código
JavaScript de `original.negocioserp.com` es la evidencia de la interfaz instalada.

## Qué falta para conectar el botón de la tienda

- Confirmar con el proveedor una ruta autorizada por Bearer, sus parámetros,
  restricciones por movimientos/documentos y cómo verificar el resultado.
- Si esa ruta no existe, el proveedor o el responsable del servidor ERP tendría
  que exponer una operación autenticada que utilice sus reglas de eliminación.
- No se ha validado usar el token API en rutas web. Tampoco se propone depender
  de una sesión personal del navegador para un servicio permanente de la tienda.
- Esta copia local no tiene `FACTURADOR_API_TOKEN` configurado. No se hizo una
  prueba autenticada contra el ERP ni se inspeccionó su código de servidor.

Una integración futura debe enviar la eliminación por ID ERP estable, guardar
el intento y confirmar el resultado antes de retirar el producto local. Si el
ERP rechaza la operación, debe conservar la fila local e informar el motivo.
Los resultados inciertos necesitan revisión; nunca un reintento automático del
borrado definitivo. La sincronización debe respetar la baja para que el producto
no reaparezca por datos antiguos o una sincronización en curso.
