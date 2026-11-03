import { NextRequest, NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import {
  getConversationMessages,
  getConversationMessagesSchema,
  isAdvisorConversationAccessible,
  sendInternalMessage,
} from "@/lib/messages-service";
import { YCloudOutboundError } from "@/lib/ycloud-outbound";
import { z } from "zod";
import { TelegramBridgeError } from "@/lib/telegram-bridge";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getMessageCenterSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  try {
    const { id } = await params;
    if (session.role === "ASESOR" && !(await isAdvisorConversationAccessible(id))) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });

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

    const messages = await getConversationMessages(query);

    return NextResponse.json(messages);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request parameters", details: error.issues }, { status: 400 });
    }

    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getMessageCenterSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  try {
    const { id } = await params;
    if (session.role === "ASESOR" && !(await isAdvisorConversationAccessible(id))) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
    
    const body = await request.json();
    
    // We pass the session user ID to associate the action with the agent
    const message = await sendInternalMessage(id, body, session.userId);

    return NextResponse.json(message);
  } catch (error: unknown) {
    if (error instanceof TelegramBridgeError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }

    if (error instanceof YCloudOutboundError) {
      return NextResponse.json(
        {
          code: error.code,
          error: error.message,
          messageId: error.messageId,
          requestId: error.requestId,
        },
        { status: error.statusCode },
      );
    }

    console.error("Error sending message:", error);
    const message = error instanceof Error && error.message === "Conversation not found"
      ? error.message
      : "No se pudo procesar el envío.";
    return NextResponse.json(
      { error: message }, 
      { status: message === "Conversation not found" ? 404 : 500 }
    );
  }
}
