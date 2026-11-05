import { NextRequest, NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import { getConversation, getConversationMessages, getConversationMessagesSchema } from "@/lib/messages-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMessageCenterSession();
  if (!session || session.role !== "ASESOR") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const conversation = await getConversation(id);
    if (!conversation || conversation.channel !== "WHATSAPP") {
      return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = getConversationMessagesSchema.parse({
      conversationId: id,
      q: searchParams.get("q") || undefined,
      date: searchParams.get("date") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      before: searchParams.get("before") || undefined,
      beforeId: searchParams.get("beforeId") || undefined,
      after: searchParams.get("after") || undefined,
      afterId: searchParams.get("afterId") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    return NextResponse.json(await getConversationMessages(query));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos.", details: error.issues }, { status: 400 });
    }

    console.error("Error cargando mensajes de WhatsApp para asesor:", error);
    return NextResponse.json({ error: "No se pudieron cargar los mensajes." }, { status: 500 });
  }
}
