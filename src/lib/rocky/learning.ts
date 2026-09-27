import { z } from "zod";
import type { RockyResult } from "./contracts";
import { redactSensitiveText } from "./guardrails";

export const feedbackSchema = z.enum(["THUMBS_UP", "THUMBS_DOWN", "EDITED", "SENT_AS_IS", "HUMAN_OVERRIDE"]);
export const DATASET_APPROVAL = "APPROVED_FOR_DATASET";
export const datasetReviewSchema = z.object({ action: z.literal("datasetReview"), runId: z.string().min(1).max(191),
  humanResponse: z.string().min(1).max(4000), approved: z.boolean(), verifiedKnowledge: z.boolean(), successfulOutcome: z.boolean() }).strict();
export function learningText(text: string) {
  return redactSensitiveText(text).replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[correo]")
    .replace(/(?:\+?\d[\s().-]*){7,}/g, "[número]").slice(0, 4000);
}
export function responseDifference(original: string, final: string) {
  const before = learningText(original), after = learningText(final);
  return { original: before, final: after, humanEdited: original !== final };
}
export type FeedbackRow = { status: string; outcome: string | null; humanResponse: string; reviewerId: string; createdAt: Date };
/** Approval is explicit and separate from a thumbs-up. Latest feedback can revoke eligibility. */
export function datasetExample(result: RockyResult, feedback: FeedbackRow[], customerMessage: string) {
  const latest = [...feedback].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest || latest.status !== DATASET_APPROVAL || latest.outcome !== "VERIFIED_SUCCESS" || !latest.reviewerId) return null;
  // Millisecond ties have no trustworthy order; conflicting reviews fail closed.
  if (feedback.some(row => row.createdAt.getTime() === latest.createdAt.getTime() &&
    (row.status !== latest.status || row.outcome !== latest.outcome || row.humanResponse !== latest.humanResponse))) return null;
  if (result.toolCalls.some(call => !call.ok) || result.intent === "UNKNOWN" || result.confidenceSignals?.contradiction) return null;
  const difference = responseDifference(learningText(result.reply), latest.humanResponse);
  return { version: 1, runId: result.rockyRequestId, intent: result.classification?.intent || result.intent,
    model: result.model, approved: true, humanCorrected: difference.humanEdited, successfulOutcome: true, verifiedKnowledge: true,
    // This export is a review/evaluation artifact, never a knowledge ingestion source.
    messages: [{ role: "user", content: learningText(customerMessage) }, { role: "assistant", content: difference.final }],
    originalResponse: difference.original, sources: result.sources.map(source => source.id),
    tools: result.toolCalls.map(call => ({ name: call.name, ok: call.ok })), reviewedAt: latest.createdAt.toISOString() };
}
