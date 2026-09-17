import { NextResponse } from "next/server";
import { MessageType } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const outgoingMessageSchema = z.object({
  agentId: z.string().trim().min(1).max(120).default("router-v2-bot"),
  content: z.string().trim().min(1).max(4000),
  conversationId: z.string().trim().min(1).max(191),
  externalMessageId: z.string().trim().min(1).max(120).optional(),
  mediaUrl: z.string().trim().url().nullable().optional(),
  requestId: z.string().trim().min(1).max(120).optional(),
  type: z.nativeEnum(MessageType).default("TEXT"),
});

function isAuthorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;
  return Boolean(expected && request.headers.get("x-internal-api-key") === expected);
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const input = outgoingMessageSchema.parse(await request.json());
    const externalMessageId = input.externalMessageId ?? input.requestId ?? null;
    const existing = externalMessageId
      ? await prisma.chatMessage.findUnique({ where: { externalMessageId } })
      : null;

    if (existing) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        messageId: existing.id,
        provider: "internal-simulator",
      });
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: input.conversationId,
          content: input.content,
          direction: "OUTBOUND",
          externalMessageId,
          mediaUrl: input.mediaUrl ?? null,
          messageType: input.type,
          metadata: {
            agentId: input.agentId,
            provider: "internal-simulator",
            requestId: input.requestId ?? null,
          },
          senderType: "BOT",
          status: "sent",
        },
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          lastMessageAt: created.createdAt,
          unreadCount: { increment: 1 },
        },
      });

      return created;
    });

    return NextResponse.json({
      ok: true,
      duplicate: false,
      messageId: message.id,
      provider: "internal-simulator",
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid request payload", details: error.issues },
        { status: 400 },
      );
    }

    console.error("[internal-chat-outgoing] error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
