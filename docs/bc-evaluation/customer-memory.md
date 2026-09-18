# Memoria comercial por cliente

La memoria está vinculada al `ChatContact`, no al teléfono declarado en el mensaje ni al nombre del perfil. Permanece entre conversaciones del mismo contacto y se elimina al borrar ese contacto.

## Qué aprende

- Una expresión que el cliente resuelve eligiendo un código previamente mostrado o un ordinal inequívoco. Si la expresión era desconocida, acepta la corrección explícita `me refiero a CODIGO` sobre el tema pendiente.
- Cada asociación conserva fecha, número de confirmaciones, conversación y mensajes que justifican la selección.
- Cuenta tipos de preguntas y atributos técnicos consultados. Tras dos consultas sobre un atributo, puede incluirlo al mostrar un producto, únicamente si existe en su ficha publicada actual. La respuesta proactiva no aumenta el contador.

Las asociaciones son específicas de ese cliente, tienen vigencia de 180 días y no sustituyen consultas que el catálogo ya resuelve. Los conflictos entre códigos requieren aclaración. Tampoco eliminan nuevos calificadores, restauran productos ocultos ni convierten precios, stock o características históricas en datos actuales.

## Persistencia y concurrencia

`CustomerConversationMemory` guarda un documento versionado y acotado (100 asociaciones, 50 tipos de pregunta). La escritura comparte transacción con agenda y respuesta. Los reintentos, lotes obsoletos, cambios de inventario y conversaciones atendidas por un humano no generan aprendizaje. Un bloqueo por contacto evita perder cambios entre sesiones simultáneas. La revisión de memoria se comprueba antes de publicar; si cambió, la agenda vuelve a calcular la respuesta una vez.

## Activación

1. Aplicar `20260918040000_add_customer_conversation_memory` a la base del entorno.
2. Generar Prisma y compilar/publicar la web.
3. Configurar `BC_CUSTOMER_MEMORY_ENABLED=true`. Ausente o `false`, la función no lee ni escribe memoria.

Esta iteración se ha probado localmente; no está desplegada. La memoria todavía no cubre preferencias de redacción, datos de checkout ni aprendizaje global revisado de vocabulario.

## Pruebas

```powershell
node --import tsx --test src/lib/bc-customer-memory.test.ts src/app/api/internal/chat/simulator-batch/agenda.test.ts
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/bc_goal_20260918?schema=public'
node --import tsx scripts/bc-evaluation/customer-memory.integration.ts --execute-local
```

La prueba integrada requiere una base **local aislada** cuyo nombre empiece por `bc_goal_`, con el esquema actual y la migración de memoria. Rechaza otros destinos. Crea productos/contactos ficticios y elimina solo sus propios registros al finalizar. Invoca los handlers reales de agenda y persistencia usando PostgreSQL; no sustituye la validación HTTP/n8n ni una venta completa.

Se comprobó aprendizaje por corrección, recuperación en otra conversación, precio actualizado, aislamiento entre clientes, exclusión de SKU ocultos, respuesta proactiva con especificación actual, ausencia de retroalimentación y borrado en cascada.

Las migraciones históricas no pudieron reconstruir una base vacía: `20260706120000_add_product_image_fingerprints` falla porque `Product` no existe. Para esta validación se preparó únicamente la base aislada con el esquema previo a memoria mediante `db push` y se ejecutó el SQL nuevo, que pasó. No se alteraron las migraciones históricas ni la base habitual.
