# Entorno de pruebas de Super Bot

## Propósito

El simulador de `/admin/mensajes/simulador` valida el núcleo real de Super Bot contra el catálogo publicado, pero usa conversaciones marcadas como simulación y no llama a ningún adaptador de proveedor. No activa Messenger/Meta, Telegram ni respuestas automáticas a clientes.

## Habilitar y usar

1. Un propietario abre **Centro de mensajes → Configuración**.
2. En **Entorno de pruebas**, activa el interruptor.
3. Abre **Simulador** y escribe un caso; por ejemplo, una búsqueda de producto, `catálogo completo` o `me interesa` después de una tarjeta.
4. Confirma que las imágenes aparecen antes del texto breve, que una selección muestra los métodos de pago y el aviso de asesor, y que las solicitudes generales de catálogo llevan a la tienda virtual.

El interruptor de pruebas es independiente de `botMasterSwitch`. Mantener la automatización general pausada no bloquea el laboratorio y habilitar el laboratorio no habilita respuestas de un canal.

## Deshabilitar

Vuelve a **Configuración** y apaga **Entorno de pruebas**. El servidor rechaza nuevas solicitudes incluso si una pestaña del simulador continúa abierta; no se crea el mensaje de entrada ni se invoca el motor.

## Política de catálogo

Para una solicitud general (`hola catálogo`, `catálogo completo` y variantes), la respuesta canónica es el enlace a la tienda virtual. Con más de 2,000 productos y cambios de precio/stock, un PDF general queda obsoleto y es menos útil en móvil. Los catálogos PDF se mantienen para búsquedas específicas, donde una colección delimitada puede verificarse y enviarse completa. No se adjunta un video de compra hasta que operaciones entregue una URL aprobada y estable para ese material.

## Reconocimiento de imágenes

El simulador mantiene una huella visual de cada foto real del catálogo, sin
limitar la búsqueda a los productos visibles o con stock. Una captura se
compara primero contra ese índice completo y solo usa IA como verificación
cuando no existe una coincidencia visual clara.

Después de incorporar imágenes históricas o restaurar el directorio
`public/uploads/products`, ejecuta:

```bash
npm run images:index
```

Las sincronizaciones posteriores del ERP actualizan la huella de los
productos cuya imagen cambie. Los registros que usan la imagen genérica
“sin foto” del ERP no pueden reconocerse visualmente hasta que reciban una
foto real.
