import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const data: any = {};
    
    if (body.status) {
      data.status = body.status;
    }
    if (body.note !== undefined) {
      data.note = body.note;
    }

    const updated = await prisma.quote.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, quote: updated });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unauthorized or bad request" }, { status: 400 });
  }
}
