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
    if (auth.error) {
      return NextResponse.json({ ok: false, error: { code: auth.error, message: "No autorizado" } }, { status: auth.status });
    }

    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id }
    });

    if (!conversation) {
      return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }, { status: 404 });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { unreadCount: 0 }
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("Error marking conversation read:", error);
    return NextResponse.json({ ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } }, { status: 500 });
  }
}
