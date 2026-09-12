# Arquitectura: Centro de Mensajes V1 Estabilizado

## Objetivo
La Fase 0 (Estabilización) del Centro de Mensajes establece un sistema robusto, idempotente y seguro, utilizando PostgreSQL como única fuente de verdad y n8n como motor de integración.

## Componentes Principales
1. **Frontend (Next.js)**: Interfaz del asesor. Implementa Optimistic UI con UUIDs (clientRequestId) para evitar mensajes duplicados y manejar reintentos.
2. **Backend API (Next.js)**: Controla reglas de negocio, persistencia en BD y proxy seguro de multimedia.
3. **n8n**: Plataforma de orquestación externa. Escucha webhooks de Meta y envía los datos al backend (incoming). También recibe peticiones del backend para enviar mensajes a Meta (outgoing).
4. **PostgreSQL / Prisma**: Fuente de la verdad de las conversaciones y estados.

## Flujos Críticos
### Mensaje Entrante (Cliente -> Meta -> n8n -> Backend)
1. Meta envía webhook a n8n.
2. n8n enruta a `POST /api/internal/chat/incoming`.
3. Backend verifica `x-internal-api-key`, procesa mensaje, lo guarda en BD e incrementa `unreadCount`.

### Estado Entrante de Meta (Cliente -> Meta -> Backend)
1. Meta envía webhook (Sent, Delivered, Read).
2. `POST /api/webhook/whatsapp` (o n8n) extrae `statuses`.
3. Backend procesa jerárquicamente: actualiza el estado de `ChatMessage` (solo mejora el estado: Sent -> Delivered -> Read).

### Mensaje Saliente Manual (Asesor -> Backend -> n8n -> Meta)
1. Frontend genera `clientRequestId` (UUID) y manda `POST /api/admin/conversations/[id]/messages`.
2. Backend inserta el mensaje en BD con `status="sending"`.
3. Backend llama al webhook Outbound de n8n con timeout de 12s.
4. Si n8n devuelve 200, Backend actualiza mensaje a `status="sent"` con el `messageId` de Meta.
5. Si timeout/error, Backend actualiza mensaje a `status="unknown"` o `failed`. 
6. El UI permite reintentar el envío usando el mismo `clientRequestId`.

### Mensaje Saliente de Bot (n8n IA -> Backend)
1. El Bot en n8n decide responder automáticamente.
2. n8n envía `POST /api/internal/chat/outgoing` con el texto.
3. Backend inserta en BD como `BOT` y marca estado como `sent` (no afecta contador de no leídos de los asesores).

### Multimedia Entrante
1. Meta provee un `mediaId` (ej. imagen).
2. Frontend solicita renderizar `/api/admin/conversations/[id]/messages/[msgId]/media`.
3. Backend pide URL a Graph API con `WHATSAPP_ACCESS_TOKEN`, luego descarga el Buffer y lo hace stream al Frontend. El Frontend NUNCA recibe el Token.

## Estados de Mensajes
- `sending`: En proceso de entrega a n8n.
- `sent`: n8n y Meta confirmaron recepción.
- `delivered`: Entregado al dispositivo del usuario.
- `read`: Leído por el usuario.
- `failed`: Rechazado o error técnico.
- `unknown`: Timeout, no se sabe si llegó a Meta. (Requiere verificación visual/reintento).

## Optimistic UI & Reintentos
- `MessageWorkspace.tsx` actualiza el estado de las conversaciones antes de que el API responda.
- Si el API falla (HTTP != 2xx), el estado del frontend se revierte (Rollback).
- `MessageBubble.tsx` renderiza un botón "Reintentar" si detecta error/timeout.
