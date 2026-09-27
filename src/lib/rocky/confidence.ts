import type { RockyPlan, ToolCall, KnowledgeHit } from "./contracts";

export function evaluateConfidence(input: { intent: RockyPlan["intent"]; exact: boolean; products: number; sources: KnowledgeHit[];
  calls: ToolCall[]; requiresHuman: boolean; ambiguous?: boolean; contradiction?: boolean }) {
  const evidence: string[] = [];
  let score = input.intent === "GREETING" ? 0.95 : input.exact ? 0.95 : input.products ? 0.75 : input.sources.length ? 0.7 : 0.35;
  if (input.exact) evidence.push("EXACT_ENTITY_MATCH");
  if (input.calls.some(call => call.ok && call.resultCount)) evidence.push("LIVE_TOOL_EVIDENCE");
  if (input.sources.length) evidence.push("RETRIEVAL_EVIDENCE");
  if (input.ambiguous) { score = Math.min(score, 0.35); evidence.push("AMBIGUOUS_REFERENCE"); }
  if (input.contradiction) { score = 0.1; evidence.push("CONTRADICTORY_FACTS"); }
  if (input.requiresHuman || input.calls.some(call => !call.ok)) { score = Math.min(score, 0.3); evidence.push("HUMAN_REVIEW_REQUIRED"); }
  return { score, evidence, signals: { intentConfidence: input.intent === "UNKNOWN" ? 0.2 : 0.9,
    entityConfidence: input.exact ? 1 : input.products ? 0.65 : 0,
    retrievalScore: input.sources.length ? Math.max(...input.sources.map(hit => hit.score)) : null,
    productMatch: input.exact, toolSuccess: input.calls.every(call => call.ok),
    informationFreshness: input.calls.some(call => call.ok && ["getPrice", "getStock", "getProductByCode", "searchProducts", "getProduct"].includes(call.name)) ? "LIVE_LOOKUP" : "NOT_VERIFIED",
    ambiguity: Boolean(input.ambiguous), contradiction: Boolean(input.contradiction) } };
}
