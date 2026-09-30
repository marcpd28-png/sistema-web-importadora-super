import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  await requireAdmin();
  const input = z.object({ action: z.literal("feedback"), runId: z.string().max(191), humanResponse: z.string().trim().min(1).max(4000) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Corrección no válida." }, { status: 400 });
  const result = await prisma.chatMessage.findFirst({ where: { id: input.data.runId, status: "review_result", conversation: { contact: { externalId: { startsWith: "SIMULATOR:" } } } } });
  if (!result) return Response.json({ error: "Evaluación no encontrada." }, { status: 404 });
  await prisma.chatMessage.create({ data: { conversationId: result.conversationId, direction: "OUTBOUND", senderType: "SYSTEM", content: input.data.humanResponse, status: "review_feedback", metadata: { source: "human-evaluation", resultId: result.id } } });
  return Response.json({ ok: true });
}
