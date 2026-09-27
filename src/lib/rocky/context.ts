import type { KnowledgeHit, LLMMessage, RockyMemory, ProductFact } from "./contracts";
import { exampleQuestion, type ReviewedExample } from "./reviewed-examples";
import { SYSTEM_PROMPT } from "./prompts";
import { learningText } from "./learning";

export type MediaContext = { type: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "LINK"; productCode?: string };
export function scopedKnowledge(hits: KnowledgeHit[], productIds: string[] = []) {
  return hits.filter(hit => hit.sourceType !== "INTERNAL" && (!hit.productId || productIds.includes(hit.productId))).slice(0, 5);
}
/** Detect contradictory explicit field/value specifications; free prose still requires human review. */
export function knowledgeConflicts(hits: KnowledgeHit[]) {
  const values = new Map<string, string>();
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  for (const hit of hits) for (const line of hit.text.split(/[;\n]/)) {
    const match = line.match(/^\s*([\p{L} ]{2,40}):\s*([^:]{1,100})$/u);
    if (!hit.productId || !match) continue;
    const key = `${hit.productId}:${normalize(match[1])}`, value = normalize(match[2]);
    if (values.has(key) && values.get(key) !== value) return true;
    values.set(key, value);
  }
  return false;
}
export function buildRockyContext(input: {
  text: string; memory: RockyMemory; history?: string[]; image?: string;
  media?: MediaContext; reviewedExamples?: ReviewedExample[]; sources?: KnowledgeHit[]; products?: ProductFact[];
}): LLMMessage[] {
  const clean = (value: string) => exampleQuestion(value);
  const data = {
    message: learningText(input.text).slice(0, 1200),
    memory: { productCodes: input.memory.productCodes, query: clean(input.memory.query), quantity: input.memory.quantity,
      needs: input.memory.needs.slice(-5).map(clean),
      summary: input.memory.summary ? { summary: clean(input.memory.summary.summary), pendingQuestions: input.memory.summary.pendingQuestions.map(clean) } : undefined,
      sales: input.memory.sales ? { purchaseStage: input.memory.sales.purchaseStage, purchaseIntent: input.memory.sales.purchaseIntent,
        objections: input.memory.sales.objections.map(clean), recommendedNextAction: input.memory.sales.recommendedNextAction } : undefined },
    history: input.memory.cart ? [] : input.history?.slice(-4).map(clean),
    reviewedExamples: input.reviewedExamples?.slice(0, 3).map(row => ({ question: clean(row.question), intent: row.intent })),
    media: input.media ? { type: input.media.type, productCode: input.media.productCode?.slice(0, 64) } : undefined,
    knowledge: scopedKnowledge(input.sources || [], input.products?.map(p => p.id)).map(hit => ({ id: hit.id, productId: hit.productId, text: clean(hit.text) })),
    // Dynamic facts are deliberately excluded from the planner; the renderer uses live tool results.
    products: input.products?.slice(0, 6).map(p => ({ id: p.id, code: p.code, name: clean(p.name) })),
  };
  return [{ role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(data), ...(input.image ? { images: [input.image] } : {}) }];
}
