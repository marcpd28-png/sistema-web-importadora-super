import { NextRequest, NextResponse } from "next/server";
import { getMessageCenterSession } from "@/lib/auth";
import {
  getConversation,
  isAdvisorConversationAccessible,
  updateConversation,
} from "@/lib/messages-service";
import { z } from "zod";
import { TelegramBridgeError } from "@/lib/telegram-bridge";

export const dynamic = "force-dynamic";

const advisorConversationUpdateSchema = z
  .object({
    status: z.enum(["ATENDIENDO", "CERRADO"]).optional(),
    botEnabled: z.literal(false).optional(),
    markAsRead: z.literal(true).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No se recibió ningún cambio." });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getMessageCenterSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (session.role === "ASESOR" && !(await isAdvisorConversationAccessible(id, session.userId))) {
      return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
    }
    
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
  const session = await getMessageCenterSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (session.role === "ASESOR" && !(await isAdvisorConversationAccessible(id, session.userId))) {
      return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
    }
    
    const body = await request.json();
    const advisorUpdate = session.role === "ASESOR" ? advisorConversationUpdateSchema.parse(body) : body;
    const conversation = await updateConversation(
      id,
      session.role === "ASESOR" && advisorUpdate.status === "ATENDIENDO"
        ? { ...advisorUpdate, assignedUserId: session.userId, botEnabled: false }
        : advisorUpdate,
    );

    return NextResponse.json(conversation);
  } catch (error) {
    if (error instanceof TelegramBridgeError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }

    console.error("Error updating conversation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
