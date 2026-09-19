# Campos editoriales reales del ERP

Investigación del 19 de septiembre de 2026 sobre `original.negocioserp.com`,
versión visible `11.919.0007`. Producto inspeccionado: O186, ID ERP 3744.
Se consultó la API desde el servidor de la web y se abrió el formulario del ERP
con la sesión iniciada por el propietario. La investigación inicial fue de solo
lectura; posteriormente se realizó el piloto de escritura autorizado que se
describe al final de este informe.

## Correspondencia verificada

| Etiqueta del formulario | Campo usado por el formulario | Uso |
| --- | --- | --- |
| Nombre | `description` | Título del producto; conservar al publicar detalles. |
| Nombre secundario | `second_name` | Nombre alternativo; no utilizar como ficha técnica. |
| Descripción | `name` | Texto descriptivo breve, separado del título. |
| Descripción detallada | `name_long` | Editor enriquecido para detalle largo y tablas. |
| Especificaciones | `factory_code` | Dato técnico breve que puede participar en búsquedas. |

La ayuda del campo Especificaciones confirma que guarda un dato técnico y que
su etiqueta puede cambiar a Principio activo o Complementos según el rubro.
No equivale a una colección estructurada de atributos técnicos.

Para una ficha completa, la propuesta es guardar el resumen en `name`, la
descripción y la tabla técnica en `name_long`, y un resumen técnico breve en
`factory_code`. El título `description` conserva su valor original.

## Evidencia técnica y límite de la API

Los enlaces públicos de JavaScript observados en el formulario permiten
verificar las asignaciones anteriores sin modificar el ERP:

- [Formulario](https://original.negocioserp.com/build/assets/js/resources/js/views/tenant/items/form-4899705a.js).
- [Lógica del formulario](https://original.negocioserp.com/build/assets/js/form-e7ad4f04.js).
- [Documentación API proporcionada](https://documenter.getpostman.com/view/13401528/2s8ZDYWgFH).

El formulario web lee `GET /items/record/{id}` y guarda con `POST /items` mediante
sesión web. Son rutas diferentes de la API con Bearer que usa la tienda.

La API documenta `GET /api/items/record/{id}` y `POST /api/items/update`, pero el
ejemplo de actualización no incluye `name_long` ni `factory_code`. La respuesta
real consultada para O186 tampoco los devuelve. `full_description` contiene un
texto compuesto por código, nombre, categoría y marca; no es el editor largo.

Inicialmente la escritura quedó detenida en la lectura previa por
`HTTP 500: Too Many Attempts`. La validación posterior de este informe confirmó
que el POST sí guarda ambos campos, aunque el GET de la API no los devuelve.

## Sincronización pendiente

El mapeador actual usa `description` (el título ERP) también como descripción de
la tienda; no importa `name_long` ni `factory_code`. Por eso almacenar el texto
en el ERP no basta para recuperarlo automáticamente en la web.

Una integración completa requiere habilitar la lectura de esos campos por API,
mapear por separado el título y el contenido editorial, sanear el HTML del
editor y acordar precedencia para cambios concurrentes. Un valor ausente o
vacío del ERP no debe borrar contenido investigado de la web. La protección
local existente debe mantenerse hasta validar y desplegar ese flujo.

Las instantáneas privadas de lectura se conservan en el servidor de la web en
`/home/IMPORTADORA-backups/erp-description-pilot-20260919/`.

## Validación posterior autorizada

Se envió un piloto real desde el servidor de la web para O186 (ID 3744).
`POST /api/items/update` rechazó el envío parcial con HTTP 422: exige unidad,
moneda, precios de compra/venta y afectaciones de IGV. Completando esos campos
con sus valores originales, respondió HTTP 200 y `success: true`.

La lectura posterior mediante la sesión web confirmó la persistencia de:

- `name_long`: `<p>Cargador Xiaomi GaN de 120 W, modelo MY-14-ED.</p><ul><li>Marca: Xiaomi</li><li>Modelo: MY-14-ED</li><li>Potencia: 120 W</li></ul>`.
- `factory_code`: `Xiaomi | MY-14-ED | 120 W | GaN`.

El registro web también expone `technical_specifications`, que estaba vacío.
No se escribió ese campo ni se validó su soporte por API en este piloto.

**Efecto lateral comprobado:** omitir la imagen en la actualización cambió su
referencia a `imagen-no-disponible.jpg`. Se restauró inmediatamente mediante
otro envío que incluyó `image`, `image_url` originales y `temp_path: null`.
Se verificaron el nombre de archivo y la URL restaurados, respuesta HTTP 200
de la imagen original, y conservación de la foto local de la web. No hubo
carga ni eliminación intencional de archivos de imagen.

La verificación final de sesión web conservó título, descripción breve,
stock de 60 unidades, precio de venta 145, precio de compra 124, marca 40,
categoría 4 y precios de las tres presentaciones (155, 145 y 135).
El piloto dejó los dos campos editoriales publicados en el ERP. No habilitó
una integración automática ni cambió el mapeador de sincronización.

Evidencia privada: `/home/IMPORTADORA-backups/erp-fields-validation-20260919/`.
La respuesta del POST no incluye los dos campos nuevos: el éxito de guardado
se comprobó consultando el registro web, no solo por el mensaje del POST.

La comprobación final de `GET /api/items/record/3744` respondió HTTP 200:
`name_long` y `factory_code` siguen ausentes pese a estar guardados. Todos los
campos devueltos por ese endpoint coinciden exactamente con la instantánea
previa (`changedFields: []`). Por tanto, con ese endpoint la web **puede enviar**
el detalle, pero **no puede recuperarlo automáticamente**. El proveedor debe
incluir los campos en su respuesta API o indicar otra ruta Bearer que los
devuelva; la lectura mediante sesión web no sustituye ese contrato.
