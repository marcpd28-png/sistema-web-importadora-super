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
    if (auth.error) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

    const { id } = await params;
    const adminId = auth.session!.userId;

    const result = await prisma.conversation.updateMany({
      where: {
        id,
        OR: [
          { assignedUserId: null },
          { assignedUserId: adminId }
        ],
        status: { not: "CERRADO" }
      },
      data: {
        assignedUserId: adminId,
        botEnabled: false,
        status: "ATENDIENDO"
      }
    });

    if (result.count === 0) {
      const existing = await prisma.conversation.findUnique({ where: { id } });
      if (!existing) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      if (existing.status === "CERRADO") return NextResponse.json({ error: "Conversation is closed" }, { status: 400 });
      
      return NextResponse.json({ error: "CONVERSATION_ALREADY_ASSIGNED" }, { status: 409 });
    }

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    return NextResponse.json(conversation);
  } catch (error) {
    console.error("Error taking conversation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
