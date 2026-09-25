# Precisión de interpretación y ejemplos revisados

El objetivo solicitado es 99,9 %, pero no existe una medición que lo demuestre. Las pruebas automatizadas son regresiones controladas, no una estimación de exactitud sobre todos los clientes. El score de confianza del motor tampoco representa precisión medida.

## Cambios

- Instrucciones de clasificación con prioridad del mensaje actual, referencias inequívocas, conservación de modelos/versiones y tratamiento explícito de fotos, comprobantes y consultas ambiguas.
- Validación del JSON incluso con proveedores alternativos; cantidades y presupuesto siguen bajo extracción determinista. El modelo no puede recuperar por su cuenta un código anterior ni eliminar la versión numérica solicitada.
- Reclamos, devoluciones, solicitudes humanas y seguimiento de pedido no consultan el modelo aunque venga una foto.
- Ejemplos de intención activados por administrador, separados de la aprobación para evaluación. Solo se suministran pregunta e intención; nunca la respuesta corregida ni sus precios o políticas.
- Selección de hasta tres ejemplos relevantes entre los 200 activados más recientes. Los conflictos de anotación con igual similitud se omiten. Una falla de consulta de ejemplos no bloquea el modelo. Retirar un ejemplo impide recuperarlo en solicitudes posteriores; una petición ya en curso puede conservar su contexto.
- No se modifican los pesos de Ollama, no se habilita AUTO y no se inventan políticas.

## Uso

En `/admin/rocky/aprendizaje`, primero revisar la respuesta corregida. Después elegir explícitamente la intención correcta y activar solo preguntas autónomas sin datos personales. Se omiten patrones comunes de teléfono, correo y credenciales, pero esto no garantiza anonimización completa. Los ejemplos con un resultado comercial previo se conservan para evaluación para no sobrescribirlo. El botón de retirar devuelve el ejemplo a evaluación.

## Evaluación separada

Preparar unas 200 consultas representativas y etiquetarlas con un vendedor, separando conversaciones completas entre desarrollo y validación. Incluir errores ortográficos, cambios de producto, consultas sin contexto, solicitudes humanas y casos sin información comercial disponible. No activar esos ejemplos como ayuda del modelo.

Crear un JSON privado con objetos `{ "id": "caso-001", "text": "mi pedido", "expectedIntent": "ORDER_STATUS", "expectedCodes": [] }`. `memory` es opcional para casos con contexto.

Ejecutar desde el servidor:

```sh
node --env-file=.env --import tsx scripts/rocky/evaluate-intents.ts --input=/ruta/privada/casos.json --output=/ruta/privada/informe-nuevo.json --llm
```

El informe cuenta aciertos, fallos, fallos de modelo y latencia por caso sin exportar el mensaje. Esta herramienta solo mide intención y referencias; la exactitud de la respuesta completa necesita revisión adicional contra el catálogo y las políticas vigentes. Una derivación correcta debe medirse separadamente de una respuesta comercial resuelta. Los ejemplos aprobados no forman parte del contexto de esta evaluación para evitar filtración del conjunto de prueba.

## Publicación del 25/09/2026

Versión `rocky2-precision-20260925`, proceso `importadora-rocky2-precision`, puerto 4016. Pruebas: 104 locales y 98 del motor en el VPS, TypeScript y ESLint correctos, compilación de producción correcta. Verificación privada y pública de seis consultas, aprobación/activación/retirada de un ejemplo técnico propio y venta simulada de 12 turnos. Se comprobaron 29 recursos JS/CSS y protección de rutas. Los ejemplos técnicos se descartaron y no se creó ningún pedido real. La versión anterior 4015 se conserva para reversión.
