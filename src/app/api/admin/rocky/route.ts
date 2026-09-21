import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limitedJson } from "@/lib/rocky/http";
import { memorySchema, modeSchema } from "@/lib/rocky/contracts";
import type { RockyResult } from "@/lib/rocky/contracts";
import { aggregateRuns } from "@/lib/rocky/analytics";
import { redactSensitiveText } from "@/lib/rocky/guardrails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  await requireAdmin();
  const id = new URL(request.url).searchParams.get("conversationId");
  if (id) return Response.json({ runs: await prisma.rockyRun.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { feedback: true } }), session: await prisma.rockySession.findUnique({ where: { conversationId: id } }) }, { headers: { "Cache-Control": "no-store" } });
  const runs = await prisma.rockyRun.findMany({ orderBy: { createdAt: "desc" }, take: 1000, select: { result: true } });
  return Response.json({ analytics: aggregateRuns(runs.map(r => r.result as unknown as RockyResult)), pendingFeedback: await prisma.rockyFeedback.count({ where: { status: "AI_FEEDBACK" } }), synonyms: await prisma.rockySynonym.findMany({ take: 100, orderBy: { frequency: "desc" } }), outcomes: await prisma.rockyFeedback.groupBy({ by: ["outcome"], _count: true }) }, { headers: { "Cache-Control": "no-store" } });
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), conversationId: z.string().min(1).max(191), mode: modeSchema }),
  z.object({ action: z.literal("feedback"), runId: z.string().min(1).max(191), humanResponse: z.string().min(1).max(4000), outcome: z.string().max(80).optional() }),
  z.object({ action: z.literal("synonym"), phrase: z.string().trim().min(3).max(120), canonical: z.string().trim().min(3).max(120), approve: z.boolean().default(false) }),
  z.object({ action: z.literal("preferences"), contactId: z.string().min(1).max(191), explicitPreferences: z.array(z.string().min(1).max(120)).max(10) }),
]);
export async function POST(request: Request) {
  const admin = await requireAdmin();
  try {
    const input = actionSchema.parse(await limitedJson(request));
    if (input.action === "mode") {
      const session = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rocky:${input.conversationId}`}))`;
        const saved = await tx.rockySession.upsert({ where: { conversationId: input.conversationId }, create: { conversationId: input.conversationId, mode: input.mode, memory: memorySchema.parse({}) }, update: { mode: input.mode, revision: { increment: 1 } } });
        if (input.mode === "MANUAL") await tx.conversation.update({ where: { id: input.conversationId }, data: { botEnabled: false, status: "ATENDIENDO" } });
        return saved;
      });
      return Response.json({ session });
    }
    if (input.action === "feedback") return Response.json(await prisma.rockyFeedback.create({ data: { runId: input.runId, humanResponse: redactSensitiveText(input.humanResponse), outcome: input.outcome, reviewerId: admin.userId } }));
    if (input.action === "preferences") return Response.json(await prisma.rockyCustomerPreferences.upsert({ where: { contactId: input.contactId }, create: { contactId: input.contactId, preferences: input.explicitPreferences }, update: { preferences: input.explicitPreferences } }));
    const phrase = input.phrase.toLowerCase(); const canonical = input.canonical.toLowerCase();
    const previous = await prisma.rockySynonym.findUnique({ where: { phrase_canonical: { phrase, canonical } } });
    if (input.approve && (!previous || previous.frequency < 3)) return Response.json({ error: "Se requieren al menos tres evidencias antes de aprobar." }, { status: 409 });
    return Response.json(await prisma.rockySynonym.upsert({ where: { phrase_canonical: { phrase, canonical } }, create: { phrase, canonical }, update: input.approve ? { status: "APPROVED", reviewedBy: admin.userId } : { frequency: { increment: 1 } } }));
  } catch { return Response.json({ error: "No se pudo guardar el cambio de Rocky." }, { status: 400 }); }
}
