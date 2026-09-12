import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminApi();
    if (auth.error || !auth.session) {
      return NextResponse.json({ ok: false, error: { code: auth.error, message: "No autorizado" } }, { status: auth.status || 401 });
    }

    const { id } = await params;
    const adminId = auth.session.userId;

    // Use transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id },
        select: { assignedUserId: true, status: true }
      });

      if (!conversation) {
        throw new Error("NOT_FOUND");
      }

      // If already assigned to another admin
      if (conversation.assignedUserId && conversation.assignedUserId !== adminId) {
        throw new Error("CONVERSATION_ALREADY_ASSIGNED");
      }

      // If already assigned to me, return success (idempotent)
      if (conversation.assignedUserId === adminId && conversation.status === 'ATENDIENDO') {
        return await tx.conversation.findUnique({ where: { id } });
      }

      return await tx.conversation.update({
        where: { id },
        data: {
          assignedUserId: adminId,
          botEnabled: false,
          status: 'ATENDIENDO'
        }
      });
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }, { status: 404 });
    }
    if (error.message === "CONVERSATION_ALREADY_ASSIGNED") {
      return NextResponse.json({ ok: false, error: { code: "CONVERSATION_ALREADY_ASSIGNED", message: "Esta conversación ya fue tomada por otro asesor." } }, { status: 409 });
    }
    
    console.error("Error taking conversation:", error);
    return NextResponse.json({ ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } }, { status: 500 });
  }
}
