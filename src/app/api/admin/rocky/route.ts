import { DATASET_APPROVAL, datasetExample, datasetReviewSchema, feedbackSchema, learningText, responseDifference } from "@/lib/rocky/learning";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limitedJson, sameOriginMutation } from "@/lib/rocky/http";
import { memorySchema, modeSchema } from "@/lib/rocky/contracts";
import type { RockyResult } from "@/lib/rocky/contracts";
import { aggregateRuns } from "@/lib/rocky/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  if (params.get("export") === "dataset") {
    const runs = await prisma.rockyRun.findMany({ where: { feedback: { some: { status: DATASET_APPROVAL } } },
      orderBy: { createdAt: "desc" }, take: 500, include: { feedback: true } });
    const messages = await prisma.chatMessage.findMany({ where: { id: { in: runs.map(run => run.triggerMessageId) } }, select: { id: true, content: true } });
    const texts = new Map(messages.map(message => [message.id, message.content]));
    const examples = runs.flatMap(run => {
      const result = run.result as unknown as RockyResult;
      const example = datasetExample(result, run.feedback, result.interaction?.customerMessage || texts.get(run.triggerMessageId) || "");
      return example ? [example] : [];
    });
    return new Response(examples.map(example => JSON.stringify(example)).join("\n"), { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "Content-Disposition": "attachment; filename=rocky-reviewed-dataset.jsonl" } });
  }
  const id = params.get("conversationId");
  if (id) return Response.json({ runs: await prisma.rockyRun.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { feedback: true } }), session: await prisma.rockySession.findUnique({ where: { conversationId: id } }) }, { headers: { "Cache-Control": "no-store" } });
  const runs = await prisma.rockyRun.findMany({ orderBy: { createdAt: "desc" }, take: 1000, select: { result: true } });
  return Response.json({ analytics: aggregateRuns(runs.map(r => r.result as unknown as RockyResult)), pendingFeedback: await prisma.rockyFeedback.count({ where: { status: { in: ["AI_FEEDBACK", ...feedbackSchema.options] } } }), synonyms: await prisma.rockySynonym.findMany({ take: 100, orderBy: { frequency: "desc" } }), feedbackCounts: await prisma.rockyFeedback.groupBy({ by: ["status"], _count: true }), outcomes: await prisma.rockyFeedback.groupBy({ by: ["outcome"], _count: true }) }, { headers: { "Cache-Control": "no-store" } });
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), conversationId: z.string().min(1).max(191), mode: modeSchema }),
  z.object({ action: z.literal("feedback"), runId: z.string().min(1).max(191), humanResponse: z.string().min(1).max(4000), outcome: z.string().max(80).optional(), feedback: feedbackSchema.optional() }),
  datasetReviewSchema,
  z.object({ action: z.literal("synonym"), phrase: z.string().trim().min(3).max(120), canonical: z.string().trim().min(3).max(120), approve: z.boolean().default(false) }),
  z.object({ action: z.literal("preferences"), contactId: z.string().min(1).max(191), explicitPreferences: z.array(z.string().min(1).max(120)).max(10) }),
]);
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!sameOriginMutation(request)) return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  try {
    const input = actionSchema.parse(await limitedJson(request));
    if (input.action === "mode") {
      const session = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rocky:${input.conversationId}`}))`;
        const saved = await tx.rockySession.upsert({ where: { conversationId: input.conversationId }, create: { conversationId: input.conversationId, mode: input.mode, memory: memorySchema.parse({}) }, update: { mode: input.mode, revision: { increment: 1 } } });
        await tx.conversation.update({ where: { id: input.conversationId }, data: input.mode === "MANUAL"
          ? { botEnabled: false, status: "ATENDIENDO" }
          : { botEnabled: true, status: "AUTOMATICO", assignedUserId: null } });
        return saved;
      });
      return Response.json({ session });
    }
    if (input.action === "feedback" || input.action === "datasetReview") {
      const run = await prisma.rockyRun.findUniqueOrThrow({ where: { id: input.runId } });
      const original = run.result as unknown as RockyResult;
      const difference = responseDifference(original.reply, input.humanResponse);
      const status = input.action === "datasetReview"
        ? input.approved && input.verifiedKnowledge && input.successfulOutcome ? DATASET_APPROVAL : "DATASET_REJECTED"
        : input.feedback || "AI_FEEDBACK";
      if (input.action === "feedback" && input.feedback === "SENT_AS_IS" && difference.humanEdited) throw new Error("RESPONSE_CHANGED");
      const saved = await prisma.rockyFeedback.create({ data: { runId: input.runId, humanResponse: learningText(input.humanResponse),
        outcome: input.action === "datasetReview" ? status === DATASET_APPROVAL ? "VERIFIED_SUCCESS" : "NOT_APPROVED" : input.outcome,
        status, reviewerId: admin.userId } });
      console.info(JSON.stringify({ event: "rocky.feedback", version: 1, runId: input.runId, feedbackId: saved.id, status, humanEdited: difference.humanEdited, createdAt: saved.createdAt }));
      return Response.json({ ...saved, difference });
    }
    if (input.action === "preferences") return Response.json(await prisma.rockyCustomerPreferences.upsert({ where: { contactId: input.contactId }, create: { contactId: input.contactId, preferences: input.explicitPreferences }, update: { preferences: input.explicitPreferences } }));
    const phrase = input.phrase.toLowerCase(); const canonical = input.canonical.toLowerCase();
    const previous = await prisma.rockySynonym.findUnique({ where: { phrase_canonical: { phrase, canonical } } });
    if (input.approve && (!previous || previous.frequency < 3)) return Response.json({ error: "Se requieren al menos tres evidencias antes de aprobar." }, { status: 409 });
    return Response.json(await prisma.rockySynonym.upsert({ where: { phrase_canonical: { phrase, canonical } }, create: { phrase, canonical }, update: input.approve ? { status: "APPROVED", reviewedBy: admin.userId } : { frequency: { increment: 1 } } }));
  } catch { return Response.json({ error: "No se pudo guardar el cambio de Rocky." }, { status: 400 }); }
}
