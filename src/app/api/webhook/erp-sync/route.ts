import { after, NextResponse } from "next/server";
import { enqueueSyncEvent, processSyncQueue, type ErpSyncEventPayload } from "@/lib/facturador/sync-processor";

export async function POST(request: Request) {
  try {
    // 1. Validar Clave de API de Seguridad
    const apiKey = request.headers.get("x-api-key") || request.headers.get("x-erp-key");
    const expectedKey = process.env.ERP_SYNC_WEBHOOK_KEY || "erp-sync-secret-2026";

    if (!apiKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    // 2. Extraer Payload del Evento
    const body = await request.json();
    const { sku, eventType, payload } = body as {
      sku?: string;
      eventType?: string;
      payload?: ErpSyncEventPayload;
    };

    if (!sku || !eventType || !payload || !payload.updated_at) {
      return NextResponse.json(
        { error: "Campos requeridos faltantes (sku, eventType, payload.updated_at)." },
        { status: 400 },
      );
    }

    // 3. Encolar Evento en Base de Datos
    const event = await enqueueSyncEvent(sku, eventType, payload);

    // 4. Procesar la Cola en Background usando after() de Next.js
    after(async () => {
      try {
        console.log(`[ERP webhook] Iniciando proceso asíncrono para evento encolado: ${event.id} (${eventType} - ${sku})`);
        const result = await processSyncQueue();
        console.log(`[ERP webhook] Proceso asíncrono terminado. Completados=${result.completed} Fallidos=${result.failed}`);
      } catch (error) {
        console.error("[ERP webhook] Error al procesar cola de sincronización tras webhook:", error);
      }
    });

    return NextResponse.json({
      success: true,
      message: "Evento recibido y encolado para procesamiento en segundo plano.",
      eventId: event.id,
    });

  } catch (error) {
    console.error("[ERP webhook] Error en webhook handler:", error);
    return NextResponse.json(
      { error: "Error interno del servidor al recibir el webhook." },
      { status: 500 },
    );
  }
}
