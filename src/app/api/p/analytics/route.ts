import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { productId, eventType } = await request.json();

    if (!productId || !eventType) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    await prisma.qrAnalyticsLog.create({
      data: {
        productId,
        eventType,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
