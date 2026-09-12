import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const schema = z.object({
  conversationId: z.string().trim().min(1).max(191),
  reason: z.string().trim().max(500).nullable().optional(),
});

function authorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;
  return Boolean(
    expected && request.headers.get("x-internal-api-key") === expected,
  );
}

export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const input = schema.parse(await request.json());

    const existing = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: {
        id: true,
        status: true,
        botEnabled: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    const conversation = await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        status: "REQUIERE_ASESOR",
        botEnabled: false,
      },
      select: {
        id: true,
        status: true,
        botEnabled: true,
        assignedUserId: true,
      },
    });

    if (input.reason) {
      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          senderType: "SYSTEM",
          messageType: "TEXT",
          content: `Router V2 handoff: ${input.reason.slice(0, 450)}`,
          status: "INTERNAL",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      alreadyHandoff:
        existing.status === "REQUIERE_ASESOR" &&
        existing.botEnabled === false,
      conversation,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request payload",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    console.error("[router-v2-handoff] error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
