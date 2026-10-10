# Control manual de Messenger

Este servicio privado coordina el protocolo de control de Messenger con el
bot de Meta Business Agent. Escucha solamente en `127.0.0.1:19120`; la
aplicación web es el único cliente autorizado mediante `MESSENGER_CONTROL_TOKEN`.

Una respuesta desde el centro de mensajes toma el control para la tienda,
desactiva el bot de la tienda y programa el regreso de la IA de Meta. El plazo
por defecto es de 15 minutos y puede cambiarse con
`MESSENGER_META_AI_RESUME_MINUTES` o desde el selector de la conversación.

## Despliegue

1. Instalar `service.py` en `/opt/importadora-messenger-control/service.py`.
2. Mantener el archivo privado de configuración fuera del repositorio en
   `/etc/importadora-messenger-control.json` (tokens y ruta SQLite).
3. Instalar la unidad de systemd incluida y ejecutar
   `systemctl restart importadora-messenger-control`.

El servicio usa la respuesta confirmada de `take_thread_control` o
`pass_thread_control` como resultado de la operación. Si Facebook rechaza la
consulta opcional de `thread_owner` con código 100, la operación no se bloquea;
la interfaz indicará que muestra el último estado confirmado por la tienda.
