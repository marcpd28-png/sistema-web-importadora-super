import { NextRequest, NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import { getConversations, getConversationsSchema } from "@/lib/messages-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getMessageCenterSession();
  if (!session || session.role !== "ASESOR") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = getConversationsSchema.parse({
      search: searchParams.get("search") || undefined,
      q: searchParams.get("q") || undefined,
      phone: searchParams.get("phone") || undefined,
      date: searchParams.get("date") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      status: searchParams.get("status") || undefined,
      channel: "WHATSAPP",
      unreadOnly: searchParams.get("unreadOnly") || undefined,
      botEnabled: searchParams.get("botEnabled") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    return NextResponse.json(await getConversations(query));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Parámetros inválidos.", details: error.issues }, { status: 400 });
    }

    console.error("Error cargando conversaciones de WhatsApp para asesor:", error);
    return NextResponse.json({ error: "No se pudieron cargar las conversaciones." }, { status: 500 });
  }
}
