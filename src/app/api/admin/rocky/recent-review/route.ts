import { createHash } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { memorySchema } from "@/lib/rocky/contracts";
import { loadRecentRockyReview } from "@/lib/rocky/recent-review";
import { runRocky } from "@/lib/rocky/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  conversationId: z.string().min(1).max(191),
  turnKey: z.string().min(1).max(191),
  reviewId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  since: z.string().datetime(),
});

function reviewExternalId(reviewId: string, conversationId: string) {
  const digest = createHash("sha256").update(`${reviewId}:${conversationId}`).digest("hex").slice(0, 32);
  return `SIMULATOR:ROCKY_REVIEW:${digest}`;
}

export async function POST(request: Request) {
  await requireAdmin();
  try {
    const input = inputSchema.parse(await request.json());
    const since = new Date(input.since);
    const age = Date.now() - since.getTime();
    if (age < 0 || age > 4 * 60 * 60 * 1000) return Response.json({ error: "La ventana de revisión venció. Actualiza la página." }, { status: 409 });
    const source = (await loadRecentRockyReview(since)).find(conversation => conversation.id === input.conversationId);
    const turn = source?.turns.find(candidate => candidate.key === input.turnKey);
    if (!source || !turn) return Response.json({ error: "El turno ya no pertenece a la ventana seleccionada." }, { status: 404 });
    if (!turn.canReplay) return Response.json({ skipped: true, reason: `Requiere reproducir ${turn.mediaTypes.join(", ").toLowerCase()} para evaluarlo con fidelidad.` });

    const externalId = reviewExternalId(input.reviewId, source.id);
    const contact = await prisma.chatContact.upsert({
      where: { channel_externalId: { channel: "WHATSAPP", externalId } },
      create: { channel: "WHATSAPP", externalId, name: `Prueba Rocky · ${source.contactLabel}`, tags: ["simulador", "evaluacion-rocky"] },
      update: { name: `Prueba Rocky · ${source.contactLabel}`, tags: ["simulador", "evaluacion-rocky"] },
    });
    let simulation = await prisma.conversation.findFirst({ where: { contactId: contact.id, status: { not: "CERRADO" } }, orderBy: { createdAt: "desc" } });
    simulation ??= await prisma.conversation.create({ data: { contactId: contact.id, channel: "WHATSAPP", botEnabled: true, status: "AUTOMATICO" } });
    await prisma.$transaction([
      prisma.conversation.update({ where: { id: simulation.id }, data: { botEnabled: true, status: "AUTOMATICO", assignedUserId: null } }),
      prisma.rockySession.upsert({ where: { conversationId: simulation.id }, create: { conversationId: simulation.id, mode: "COPILOT", memory: memorySchema.parse({}) }, update: { mode: "COPILOT" } }),
    ]);
    const externalMessageId = `rocky-review:${input.reviewId.slice(0, 16)}:${turn.key}`.slice(0, 120);
    const trigger = await prisma.chatMessage.upsert({
      where: { externalMessageId },
      create: {
        conversationId: simulation.id, externalMessageId, direction: "INBOUND", senderType: "CUSTOMER", messageType: "TEXT", content: turn.customerText,
        metadata: { source: "rocky-recent-review", simulation: true, sourceConversationId: source.id, sourceMessageIds: turn.sourceMessageIds, reviewId: input.reviewId },
      },
      update: {},
    });
    if (trigger.conversationId !== simulation.id) return Response.json({ error: "La revisión ya pertenece a otra sesión." }, { status: 409 });
    const replay = await runRocky({ conversationId: simulation.id, triggerMessageId: trigger.id, simulate: true });
    await prisma.$transaction([
      prisma.conversation.update({ where: { id: simulation.id }, data: { botEnabled: true, status: "AUTOMATICO", assignedUserId: null } }),
      prisma.rockySession.update({ where: { conversationId: simulation.id }, data: { mode: "COPILOT" } }),
    ]);
    return Response.json({ result: replay.result, actualReply: turn.actualReply }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[rocky-recent-review] failed", error instanceof Error ? error.message : "UnknownError");
    return Response.json({ error: "Rocky no pudo reproducir este turno." }, { status: 500 });
  }
}
