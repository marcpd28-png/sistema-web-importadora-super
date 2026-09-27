import type { RockyResult } from "./contracts";

/** Console events contain metadata only. Message text remains in the access-controlled run record. */
export function completedEvent(result: RockyResult, conversationId: string) {
  return { event: "rocky.completed", version: 1, rockyRequestId: result.rockyRequestId, conversationId,
    intent: result.intent, intentConfidence: result.classification?.confidence ?? null, confidence: result.confidence,
    latencyMs: result.latencyMs, model: result.model, tools: result.toolCalls, retrievedIds: result.sources.map(s => s.id),
    ragHit: result.sources.length > 0, handoff: result.requiresHuman, reason: result.reasonCode,
    autonomy: result.autonomy, finalAction: result.finalAction, automaticResponse: result.finalAction === "QUEUE" };
}
