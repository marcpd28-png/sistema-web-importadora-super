import { NextRequest, NextResponse } from "next/server";
import { canManageMessaging, getMessageCenterSession } from "@/lib/auth";
import {
  claimConversation,
  transferConversation,
} from "@/lib/messages-service";
import { ConversationAssignmentError } from "@/lib/conversation-assignment";
import { TelegramBridgeError } from "@/lib/telegram-bridge";
import { z } from "zod";

export const dynamic = "force-dynamic";

const assignmentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("transfer"), advisorId: z.string().trim().min(1).max(191) }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMessageCenterSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== request.headers.get("host")?.toLowerCase()) throw new Error();
  } catch {
    return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const input = assignmentSchema.parse(await request.json());
    const isMessagingOwner = canManageMessaging(session);
    const conversation = input.action === "claim"
      ? await claimConversation(id, session.userId, { canReassign: isMessagingOwner })
      : await transferConversation(id, input.advisorId, {
        id: session.userId,
        isMessagingOwner,
      });
    return NextResponse.json(conversation, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConversationAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof TelegramBridgeError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Revisa la asignación seleccionada." }, { status: 400 });
    }
    console.error("conversation_assignment_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "No se pudo actualizar la asignación." }, { status: 500 });
  }
}
