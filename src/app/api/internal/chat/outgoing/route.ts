import { NextResponse } from "next/server";
import { MessageType } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { templateSnapshotSchema } from "@/lib/message-templates";

const outgoingMessageSchema = z.object({
  agentId: z.string().trim().min(1).max(120).default("router-v2-bot"),
  content: z.string().trim().min(1).max(4000),
  conversationId: z.string().trim().min(1).max(191),
  externalMessageId: z.string().trim().min(1).max(120).optional(),
  provider: z.enum(["manychat", "meta-cloud"]).default("manychat"),
  mediaUrl: z.string().trim().url().nullable().optional(),
  requestId: z.string().trim().min(1).max(120).optional(),
  type: z.nativeEnum(MessageType).default("TEXT"),
  status: z.enum(["sent", "failed"]).default("sent"),
  template: templateSnapshotSchema.optional(),
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
    if (input.agentId.endsWith("-simulator")) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { contact: { select: { externalId: true } } },
      });
      if (!conversation?.contact.externalId?.startsWith("SIMULATOR:")) {
        return NextResponse.json({ ok: false, error: "Simulator conversation required" }, { status: 403 });
      }
    }
    const externalMessageId = input.externalMessageId ?? input.requestId ?? null;
    const existing = externalMessageId
      ? await prisma.chatMessage.findUnique({ where: { externalMessageId } })
      : null;

    if (existing) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        messageId: existing.id,
        provider: input.provider,
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
            provider: input.provider,
            requestId: input.requestId ?? null,
            ...(input.template ? { template: input.template } : {}),
            ...(input.status === "failed" ? {
              error: input.template
                ? "No se pudo enviar la respuesta guardada. Revisa la ejecución del flujo en n8n."
                : "No se pudo enviar el PDF por WhatsApp. Revisa los permisos de envío de la integración y la ventana de conversación.",
              errorCode: input.template ? "SAVED_REPLY_SEND_FAILED" : "WHATSAPP_DOCUMENT_SEND_FAILED",
            } : {}),
          },
          senderType: "BOT",
          status: input.status,
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

    triggerPusherEvent(`chat-${input.conversationId}`, "new-message", message);

    return NextResponse.json({
      ok: true,
      duplicate: false,
      messageId: message.id,
      provider: input.provider,
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
