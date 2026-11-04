import { NextRequest, NextResponse } from "next/server";
import { canManageMessaging, getMessageCenterSession } from "@/lib/auth";
import { getConversation, isAdvisorConversationAccessible } from "@/lib/messages-service";
import { TelegramBridgeError, telegramCommand } from "@/lib/telegram-bridge";
import { z } from "zod";

export const dynamic = "force-dynamic";

const typingSchema = z.object({
  typing: z.boolean(),
}).strict();

function hasSameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    return ["http:", "https:"].includes(origin.protocol) &&
      origin.host === request.headers.get("host")?.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * A typing lease is deliberately separate from `botEnabled`: it only gives a
 * human a few seconds to finish a draft. The bridge expires it by itself, so
 * a closed tab or dropped request can never leave a customer silent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMessageCenterSession();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });

  try {
    const { id } = await params;
    const { typing } = typingSchema.parse(await request.json());
    const ownsMessaging = canManageMessaging(session);

    if (!ownsMessaging && !(await isAdvisorConversationAccessible(id, session.userId))) {
      return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
    }

    const conversation = await getConversation(id);
    if (
      !conversation ||
      conversation.contact.externalId?.startsWith("SIMULATOR:") ||
      conversation.channel !== "TELEGRAM" ||
      !conversation.telegramConnectionId ||
      !conversation.telegramChatId
    ) {
      return NextResponse.json({ error: "La conversación no admite indicador de escritura." }, { status: 409 });
    }

    // Never start a new temporary hold after a human has actually taken over.
    // Clearing an old lease remains safe and lets a just-sent message clean up.
    if (typing && (!conversation.botEnabled || conversation.status !== "AUTOMATICO")) {
      return NextResponse.json({ typing: false, ignored: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const result = await telegramCommand<{ typingUntil?: number | null }>("typing", {
      connectionId: conversation.telegramConnectionId,
      chatId: conversation.telegramChatId,
      typing,
      leaseSeconds: 8,
      sender: "AGENT",
    });

    return NextResponse.json(
      { typing, typingUntil: result.typingUntil ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TelegramBridgeError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Indicador de escritura inválido." }, { status: 400 });
    }
    console.error("telegram_typing_lease_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "No se pudo actualizar el indicador de escritura." }, { status: 500 });
  }
}
