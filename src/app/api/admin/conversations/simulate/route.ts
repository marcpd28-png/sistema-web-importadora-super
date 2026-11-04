import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMessagingOwnerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processIncomingMessage } from "@/lib/messages-service";
import {
  generateSuperBotSimulatorReply,
  isSuperBotSimulatorAIEnabled,
  type SuperBotSimulatorResult,
} from "@/lib/super-bot-simulator-ai";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  content: z.string().trim().min(1).max(1200),
  name: z.string().trim().min(1).max(180).default("Cliente Simulador"),
  sessionKey: z.string().trim().min(1).max(80).default("default"),
});

async function createSimulationReply(
  conversationId: string,
  customerMessageId: string,
  content: string,
): Promise<{ result: SuperBotSimulatorResult | null; error: string | null }> {
  const [settings, conversation, previousMessages] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { id: 1 } }),
    prisma.conversation.findUnique({ where: { id: conversationId } }),
    prisma.chatMessage.findMany({
      where: {
        conversationId,
        id: { not: customerMessageId },
        senderType: { in: ["CUSTOMER", "BOT"] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
    }),
  ]);

  if (!settings?.botMasterSwitch || !conversation?.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") {
    return {
      result: null,
      error: "Super Bot está pausado en esta conversación o globalmente. Inicia una sesión nueva para volver a probar.",
    };
  }

  const result = await generateSuperBotSimulatorReply({
    message: content,
    recentMessages: previousMessages.reverse().map((message) => ({
      role: message.senderType === "CUSTOMER" ? "user" : "assistant",
      text: message.content,
    })),
  });

  await prisma.$transaction(async (tx) => {
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    if (!current.botEnabled || current.assignedUserId || current.status !== "AUTOMATICO") return;
    const copies = await tx.chatMessage.count({
      where: {
        conversationId,
        senderType: "BOT",
        content: result.text,
        status: "simulated",
      },
    });
    if (copies >= 2) return;
    await tx.chatMessage.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        senderType: "BOT",
        messageType: result.document ? "DOCUMENT" : "TEXT",
        content: result.text,
        mediaUrl: result.document?.url,
        status: "simulated",
        metadata: {
          provider: "super_bot",
          simulation: true,
          model: result.model,
          fallbackReason: result.fallbackReason,
          document: result.document
            ? {
              deliveryKey: result.document.deliveryKey,
              filename: result.document.filename,
              mimeType: result.document.mimeType,
              sizeBytes: result.document.sizeBytes,
            }
            : null,
        },
      },
    });
  });

  return { result, error: null };
}

export async function POST(request: Request) {
  try {
    const session = await getMessagingOwnerSession();
    if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const input = inputSchema.parse(await request.json());
    const incoming = await processIncomingMessage({
      channel: "WEB",
      content: input.content,
      externalContactId: `SIMULATOR:${input.sessionKey}`,
      externalMessageId: `SIM-CUSTOMER-${randomUUID()}`,
      name: input.name,
      type: "TEXT",
      timestamp: new Date().toISOString(),
      metadata: { simulation: true, provider: "super_bot" },
    });
    const simulation = await createSimulationReply(incoming.conversationId, incoming.messageId, input.content);
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: incoming.conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    const aiEnabled = isSuperBotSimulatorAIEnabled();

    return NextResponse.json({
      messages,
      conversationId: incoming.conversationId,
      customerMessageId: incoming.messageId,
      automationError: simulation.error,
      automationTriggered: Boolean(simulation.result),
      automationName: simulation.result?.provider === "openai"
        ? `Super Bot IA de prueba — ${simulation.result.model}`
        : "Super Bot — catálogo y políticas verificados, sin envíos reales",
      aiSimulation: {
        enabled: aiEnabled,
        provider: simulation.result?.provider ?? null,
        model: simulation.result?.model ?? null,
        fallbackReason: simulation.result?.fallbackReason ?? null,
      },
      pendingSince: null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Revisa el mensaje y la sesión de prueba." }, { status: 400 });
    return NextResponse.json({ error: "No se pudo simular la conversación." }, { status: 500 });
  }
}
