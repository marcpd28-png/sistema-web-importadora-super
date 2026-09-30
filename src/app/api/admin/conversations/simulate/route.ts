import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processIncomingMessage } from "@/lib/messages-service";
import { planRockyResponse } from "@/lib/rocky-engine";
import { rockyOutbox, AutomationCancelledError } from "@/lib/rocky-outbox";

export const dynamic = "force-dynamic";
const inputSchema = z.object({
  content: z.string().trim().min(1).max(1200),
  name: z.string().trim().min(1).max(180).default("Cliente Simulador"),
  sessionKey: z.string().trim().min(1).max(80).default("default"),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = inputSchema.parse(await request.json());
    const incoming = await processIncomingMessage({
      channel: "WHATSAPP", content: input.content, externalContactId: "SIMULATOR:" + input.sessionKey,
      externalMessageId: "SIM-CUSTOMER-" + randomUUID(), name: input.name,
      phone: "+15005550006", type: "TEXT", timestamp: new Date().toISOString(), metadata: { simulation: true },
    });
    let automationError: string | null = null;
    try {
      await rockyOutbox.runSimulation(incoming.conversationId, incoming.messageId,
        () => planRockyResponse(incoming.conversationId, incoming.messageId));
    } catch (error) {
      if (!(error instanceof AutomationCancelledError)) throw error;
      automationError = "Rocky está pausado en esta conversación o globalmente. Inicia una sesión nueva para volver a probar.";
    }
    const messages = await prisma.chatMessage.findMany({ where: { conversationId: incoming.conversationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
    return NextResponse.json({ messages, conversationId: incoming.conversationId, customerMessageId: incoming.messageId,
      automationError, automationTriggered: false, automationName: "Rocky — motor único, sin envíos reales", pendingSince: null });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Revisa el mensaje y la sesión de prueba." }, { status: 400 });
    return NextResponse.json({ error: "No se pudo simular la conversación." }, { status: 500 });
  }
}
