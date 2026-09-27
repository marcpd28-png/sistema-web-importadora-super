import { memorySchema, type RockyMemory, type RockyPlan } from "./contracts";
import { exampleQuestion } from "./reviewed-examples";

/** A structured, deterministic summary of validated state; never promote model prose to facts. */
export function summarizeMemory(memory: RockyMemory, intent: RockyPlan["intent"], text: string) {
  const objections = intent.endsWith("OBJECTION") ? [...(memory.sales?.objections || []), exampleQuestion(text)] : memory.sales?.objections || [];
  return memorySchema.parse({ ...memory,
    summary: { summary: `Etapa: ${memory.stage}. Intención: ${intent}. Productos: ${memory.productCodes.join(", ") || "sin selección"}.`,
      activeProducts: memory.productCodes, pendingQuestions: memory.asked, customerNeeds: memory.needs.map(exampleQuestion),
      relevantFacts: memory.budget === null ? [] : [`Presupuesto indicado: ${memory.budget}`] },
    sales: { purchaseStage: memory.stage, purchaseIntent: Boolean(memory.cart) || /\bcomprar(?:lo|la)?\b|me lo llevo/i.test(text),
      objections: [...new Set(objections)].slice(-5), productsConsidered: memory.shownCodes,
      recommendedNextAction: memory.stage === "HANDOFF" ? "HUMAN_REVIEW" : memory.cart ? "CONTINUE_VALIDATED_CHECKOUT" : memory.productCodes.length ? "RESOLVE_CUSTOMER_QUESTION" : "CLARIFY_PRODUCT" },
  });
}
