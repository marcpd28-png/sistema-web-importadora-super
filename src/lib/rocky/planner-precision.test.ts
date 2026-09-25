import test from "node:test";
import assert from "node:assert/strict";
import { RockyAIOrchestrator } from "./orchestrator";
import { memorySchema, type LLMMessage, type LLMProvider, type RockyPlan } from "./contracts";
import { exampleQuestion, PLANNING_APPROVAL, selectReviewedExamples } from "./reviewed-examples";

const emptyBackend = { search: async () => [], product: async () => null, knowledge: async () => [] };
const proposed: RockyPlan = { intent: "PRODUCT_SEARCH", query: "cable Samsung", codes: [], budget: 1, quantity: 900, needs: ["inventado"] };
function provider(plan = proposed, capture?: (messages: LLMMessage[]) => void): LLMProvider {
  return { model: "controlled-planner", plan: async messages => { capture?.(messages); return { plan, tokens: { input: 1, output: 1 } }; }, embed: async () => [], health: async () => ({ ready: true, models: [] }) };
}
test("a model cannot remove the requested phone model or inject quantity and budget", async () => {
  const result = await new RockyAIOrchestrator(emptyBackend, provider()).chat({ text: "Samsung S24 Ultra", image: "test" });
  assert.match(result.memory.query, /S24/i);
  assert.equal(result.memory.quantity, 1);
  assert.equal(result.memory.budget, null);
  assert.deepEqual(result.memory.needs, ["Samsung"]);
});
test("unknown request retains a numeric version when model proposes a different product", async () => {
  let searched = "";
  await new RockyAIOrchestrator({ ...emptyBackend, search: async query => { searched = query; return []; } }, provider()).chat({ text: "smartphone 24 ultra" });
  assert.match(searched, /24/);
  assert.doesNotMatch(searched, /cable/);
});
test("new product cannot inherit a code invented from previous memory", async () => {
  const result = await new RockyAIOrchestrator(emptyBackend, provider({ ...proposed, codes: ["OLD99"] })).chat({ text: "lámpara lunar", memory: memorySchema.parse({ productCodes: ["OLD99"] }) });
  assert.deepEqual(result.memory.productCodes, []);
});
for (const text of ["mi pedido", "quiero hablar con asesor", "reclamo por pago", "quiero devolver"]) {
  test(`sensitive request bypasses model despite image: ${text}`, async () => {
    let called = false;
    const result = await new RockyAIOrchestrator(emptyBackend, provider(proposed, () => { called = true; })).chat({ text, image: "test" });
    assert.equal(called, false);
    assert.equal(result.requiresHuman, true);
    assert.equal(result.finalAction, "HANDOFF");
  });
}
test("invalid model plan falls back without executing its query", async () => {
  const result = await new RockyAIOrchestrator(emptyBackend, provider({ ...proposed, intent: "EXECUTE_SQL" } as unknown as RockyPlan)).chat({ text: "algo diferente" });
  assert.equal(result.reasonCode, "MODEL_UNAVAILABLE_OR_INVALID");
  assert.deepEqual(result.toolsRequested, []);
});
test("only separately approved, relevant intent examples are eligible", () => {
  const question = "lámpara lunar recargable";
  const rows = ["AI_FEEDBACK", "REJECTED", "APPROVED_FOR_EVALUATION", PLANNING_APPROVAL].map(status => ({ status, outcome: "PLANNER:PRODUCT_SEARCH", question }));
  assert.deepEqual(selectReviewedExamples(question, rows), [{ question, intent: "PRODUCT_SEARCH" }]);
  assert.deepEqual(selectReviewedExamples("garantía de arrancador", rows), []);
  assert.deepEqual(selectReviewedExamples(question, [{ ...rows[3], outcome: "PLANNER:EXECUTE_SQL" }]), []);
});
test("conflicting reviewed intents do not silently pick a winner", () => {
  assert.deepEqual(selectReviewedExamples("lámpara lunar", ["PRODUCT_SEARCH", "WARRANTY_QUERY"].map(intent => ({ question: "lámpara lunar", status: PLANNING_APPROVAL, outcome: `PLANNER:${intent}` }))), []);
});
test("reviewed examples omit common contact and credential patterns", () => {
  assert.doesNotMatch(exampleQuestion("lámpara para a@empresa.com +51 999 888 777 token=secreto"), /empresa|999|secreto/);
});
test("example retrieval failure does not take down inference", async () => {
  const result = await new RockyAIOrchestrator({ ...emptyBackend, reviewedExamples: async () => { throw Error("db unavailable"); } }, provider()).chat({ text: "lámpara lunar" });
  assert.equal(result.model, "controlled-planner");
  assert.equal(result.reasonCode, null);
});
test("reviewed examples reach classifier as user data, never system instructions", async () => {
  let messages: LLMMessage[] = [];
  await new RockyAIOrchestrator({ ...emptyBackend, reviewedExamples: async () => [{ question: "lámpara lunar", intent: "PRODUCT_SEARCH" }] }, provider(proposed, m => { messages = m; })).chat({ text: "lámpara lunar" });
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.deepEqual(JSON.parse(messages[1].content).reviewedExamples, [{ question: "lámpara lunar", intent: "PRODUCT_SEARCH" }]);
  assert.doesNotMatch(messages[0].content, /lámpara lunar/);
});
