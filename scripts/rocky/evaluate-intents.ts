import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { intents, memorySchema } from "../../src/lib/rocky/contracts";
import { RockyAIOrchestrator } from "../../src/lib/rocky/orchestrator";
import { OllamaLocalProvider } from "../../src/lib/rocky/provider";

// Private, manually labelled holdout. No DB writes, customer messages or commercial actions.
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
async function main() {
  const input = arg("input"), output = arg("output");
  if (!input || !output) throw Error("Usa --input=casos.json --output=informe.json; --llm habilita Ollama local.");
  const cases = z.array(z.object({ id: z.string().min(1), text: z.string().min(1).max(1200), memory: memorySchema.optional(),
    expectedIntent: z.enum(intents), expectedCodes: z.array(z.string()).optional() }).strict()).min(1).max(1000).parse(JSON.parse(await readFile(input, "utf8")));
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw Error("Los identificadores deben ser únicos");
  const llm = process.argv.includes("--llm") ? new OllamaLocalProvider() : undefined;
  if (llm && !(await llm.health()).ready) throw Error("El modelo local no está listo");
  const engine = new RockyAIOrchestrator({ search: async () => [], product: async () => null, knowledge: async () => [] }, llm);
  const results = [];
  for (const item of cases) {
    const answer = await engine.chat({ text: item.text, memory: item.memory });
    const codesMatch = item.expectedCodes === undefined || JSON.stringify([...answer.memory.productCodes].sort()) === JSON.stringify([...item.expectedCodes].sort());
    results.push({ id: item.id, expectedIntent: item.expectedIntent, actualIntent: answer.intent,
      pass: item.expectedIntent === answer.intent && codesMatch && answer.reasonCode !== "MODEL_UNAVAILABLE_OR_INVALID",
      codesMatch, model: answer.model, latencyMs: answer.latencyMs, modelFailure: answer.reasonCode === "MODEL_UNAVAILABLE_OR_INVALID" });
  }
  const passed = results.filter(r => r.pass).length;
  const report = { measuredAt: new Date().toISOString(), scope: "intent-and-reference-only", requestedModel: llm?.model || "rules-only",
    note: "No mide exactitud de respuestas comerciales. No incluye ejemplos activos; mantener estos casos fuera del desarrollo y de la revisión de ejemplos.",
    total: results.length, passed, failed: results.length - passed, observedPercent: passed / results.length * 100,
    modelFailures: results.filter(r => r.modelFailure).length, results };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ total: report.total, passed, failed: report.failed, observedPercent: report.observedPercent, output }));
  if (report.failed) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falló la evaluación"); process.exitCode = 1; });
