import test from "node:test";
import assert from "node:assert/strict";
import { ToolExecutor, type ToolBackend } from "./tools";
import { RockyAIOrchestrator } from "./orchestrator";
import { DATASET_APPROVAL, datasetExample, responseDifference } from "./learning";
import type { ProductFact } from "./contracts";
import { autonomyDecision } from "./autonomy";

const product: ProductFact = { id: "p1", code: "HY300", name: "Proyector HY300", unitPrice: 180, wholesalePrice: null,
  wholesaleMinQty: 3, stockUnits: 7, brand: null, category: "Proyectores", description: null, technicalSpecs: "Bluetooth: sí" };
const backend: ToolBackend = { product: async () => ({ ...product }), search: async () => [product], knowledge: async () => [] };

test("las validaciones fallidas quedan registradas como tools fallidas", async () => {
  const tools = new ToolExecutor(backend, ["getStock"]);
  await assert.rejects(tools.execute("getStock", { code: "HY300", sql: "forbidden" }));
  assert.equal(tools.calls.length, 1);
  assert.equal(tools.calls[0].ok, false);
  assert.equal(tools.calls[0].reasonCode, "INVALID_TOOL_INPUT");
});
test("el límite de tools cuenta llamadas concurrentes antes de completarse", async () => {
  let executed = 0;
  const tools = new ToolExecutor({ ...backend, product: async () => { executed++; await new Promise(resolve => setTimeout(resolve, 5)); return product; } }, ["getStock"]);
  const results = await Promise.allSettled(Array.from({ length: 13 }, () => tools.execute("getStock", { code: "HY300" })));
  assert.equal(executed, 12); assert.equal(results.filter(r => r.status === "rejected").length, 1);
});
test("humanEdited detecta cambios aunque la redacción produzca el mismo texto", () => {
  const difference = responseDifference("contacto persona1@example.com", "contacto persona2@example.com");
  assert.equal(difference.humanEdited, true);
  assert.equal(difference.original, difference.final);
});
test("una revocación con igual timestamp no se exporta por orden accidental", async () => {
  const result = await new RockyAIOrchestrator(backend).chat({ text: "precio HY300" });
  const approved = { status: DATASET_APPROVAL, outcome: "VERIFIED_SUCCESS", humanResponse: "Revisado", reviewerId: "reviewer", createdAt: new Date(1) };
  assert.equal(datasetExample(result, [approved, { ...approved, status: "THUMBS_DOWN" }], "precio HY300"), null);
});
test("las preguntas compuestas conservan el mensaje y respuesta completos para auditoría", async () => {
  const text = "precio del HY300 y qué garantía tiene?";
  const result = await new RockyAIOrchestrator({ ...backend, knowledge: async () => { throw Error("offline"); } }).chat({ text });
  assert.equal(result.requiresHuman, true);
  assert.equal(result.confidenceSignals?.toolSuccess, false);
  assert.equal(result.interaction?.customerMessage, text);
  assert.equal(result.interaction?.finalResponse, result.reply);
});
test("timeout real del ejecutor reduce confianza sin inventar stock", async () => {
  const previous = process.env.ROCKY_TOOL_TIMEOUT_MS;
  process.env.ROCKY_TOOL_TIMEOUT_MS = "100";
  try {
    const result = await new RockyAIOrchestrator({ ...backend, product: () => new Promise(() => {}) }).chat({ text: "stock HY300" });
    assert.equal(result.confidenceSignals?.toolSuccess, false);
    assert.equal(autonomyDecision(result).handoff, true);
    assert.ok(result.latencyMs >= 90 && result.latencyMs < 3000);
    assert.doesNotMatch(result.reply, /7 unidades/);
  } finally {
    if (previous === undefined) delete process.env.ROCKY_TOOL_TIMEOUT_MS;
    else process.env.ROCKY_TOOL_TIMEOUT_MS = previous;
  }
});
test("confianza alta, media y baja gobiernan autonomía con evidencia controlada", async () => {
  const high = await new RockyAIOrchestrator(backend).chat({ text: "precio HY300" });
  const medium = await new RockyAIOrchestrator(backend).chat({ text: "busco proyector" });
  const low = await new RockyAIOrchestrator({ ...backend, product: async () => { throw Error("offline"); } }).chat({ text: "stock HY300" });
  assert.equal(autonomyDecision(high).decision, "AUTO");
  assert.equal(autonomyDecision(medium).decision, "ASSISTED");
  assert.equal(autonomyDecision(low).decision, "HANDOFF");
});
