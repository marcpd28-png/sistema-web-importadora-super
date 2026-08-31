import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getConversationMessages,
  getConversationMessagesSchema,
  sendInternalMessage,
} from "@/lib/messages-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;

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
  try {
    const session = await requireAdmin();
    const { id } = await params;
    
    const body = await request.json();
    
    // We pass the session user ID to associate the action with the agent
    const message = await sendInternalMessage(id, body, session.userId);

    return NextResponse.json(message);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }

    console.error("Error sending message:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message }, 
      { status: message === "Conversation not found" ? 404 : 500 }
    );
  }
}
