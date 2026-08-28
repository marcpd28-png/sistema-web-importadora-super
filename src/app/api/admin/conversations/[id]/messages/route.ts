import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getConversationMessages, sendInternalMessage } from "@/lib/messages-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    
    const searchParams = request.nextUrl.searchParams;
    const page = searchParams.has("page") ? parseInt(searchParams.get("page")!) : 1;
    const limit = searchParams.has("limit") ? parseInt(searchParams.get("limit")!) : 50;
    
    const messages = await getConversationMessages(id, page, limit);

    return NextResponse.json(messages);
  } catch (error) {
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
    console.error("Error sending message:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message }, 
      { status: message === "Conversation not found" ? 404 : 500 }
    );
  }
}
