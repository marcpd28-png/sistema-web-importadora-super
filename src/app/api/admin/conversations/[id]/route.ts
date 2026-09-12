import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { getConversation, updateConversation } from "@/lib/messages-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi();
    if (auth.error) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
    
    const { id } = await params;

    const conversation = await getConversation(id);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi();
    if (auth.error) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
    
    const { id } = await params;
    
    const body = await request.json();

    const updated = await updateConversation(id, body);

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating conversation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
