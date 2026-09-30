import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadRecentRockyReview } from "@/lib/rocky/recent-review";
import { processIncomingMessage } from "@/lib/messages-service";
import { planRockyResponse } from "@/lib/rocky-engine";
import { rockyOutbox, AutomationCancelledError } from "@/lib/rocky-outbox";

const schema = z.object({ conversationId: z.string().min(1).max(191), turnKey: z.string().min(1).max(191), reviewId: z.string().uuid(), since: z.string().datetime() });
export async function POST(request: Request) {
  await requireAdmin();
  try {
    const input = schema.parse(await request.json());
    const since = new Date(input.since);
    if (since.getTime() > Date.now() || Date.now() - since.getTime() > 4 * 3600000) return Response.json({ error: "Actualiza la ventana de revisión." }, { status: 409 });
    const source = (await loadRecentRockyReview(since)).find(row => row.id === input.conversationId);
    const turn = source?.turns.find(row => row.key === input.turnKey);
    if (!source || !turn) return Response.json({ error: "Turno no disponible." }, { status: 404 });
    if (!turn.canReplay) return Response.json({ skipped: true, reason: "Requiere revisar el archivo multimedia original." });
    const externalId = "SIMULATOR:REVIEW:" + createHash("sha256").update(input.reviewId + source.id).digest("hex").slice(0, 40);
    const incoming = await processIncomingMessage({ channel: "WHATSAPP", externalContactId: externalId, externalMessageId: "REVIEW-" + randomUUID(), phone: "+15005550006", name: "Evaluación aislada", content: turn.customerText, type: "TEXT", timestamp: new Date().toISOString(), metadata: { simulation: true } });
    // Only a SIMULATOR conversation can enter the isolated sink. Never resume the source chat.
    const before = await prisma.chatMessage.findMany({ where: { conversationId: incoming.conversationId, senderType: "BOT" }, select: { id: true } });
    await rockyOutbox.runSimulation(incoming.conversationId, incoming.messageId, () => planRockyResponse(incoming.conversationId, incoming.messageId));
    const [replies, conversation, sales] = await Promise.all([
      prisma.chatMessage.findMany({ where: { conversationId: incoming.conversationId, senderType: "BOT", id: { notIn: before.map(row => row.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.conversation.findUniqueOrThrow({ where: { id: incoming.conversationId } }),
      prisma.conversationSalesState.findUnique({ where: { conversationId: incoming.conversationId } }),
    ]);
    const id = randomUUID();
    const result = { rockyRequestId: id, reply: replies.map(row => [row.content, row.mediaUrl].filter(Boolean).join("\n")).join("\n\n") || "Sin respuesta nueva: control de repetición.", intent: "Motor único", requiresHuman: conversation.status === "REQUIERE_ASESOR", products: sales?.selectedProductCode ? [{ code: sales.selectedProductCode }] : [] };
    await prisma.chatMessage.create({ data: { id, conversationId: incoming.conversationId, direction: "OUTBOUND", senderType: "SYSTEM", content: "Evaluación guardada", status: "review_result", metadata: { source: "rocky-review-result", sourceConversationId: source.id, sourceMessageIds: turn.sourceMessageIds, result } } });
    return Response.json({ result, actualReply: turn.actualReply });
  } catch (error) {
    if (error instanceof AutomationCancelledError) return Response.json({ skipped: true, reason: "Rocky está pausado; no se ha reactivado automáticamente." });
    return Response.json({ error: "No se pudo evaluar este turno." }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
