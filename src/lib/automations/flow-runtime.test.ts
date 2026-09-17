import assert from "node:assert/strict";
import { test } from "node:test";
import { createFlowTemplate, flowSchema, matchesKeywords, renderFlowText, validateFlow } from "./flow-definition";
import { runFlow } from "./flow-runtime";
import { FlowCompiler, workflowPath } from "./FlowCompiler";
import { signExecution, verifyExecution } from "./execution-auth";

test("las plantillas se pueden publicar y conservar sin cambios visuales implícitos", () => {
  for (const template of ["welcome", "sales"] as const) {
    const flow = flowSchema.parse(createFlowTemplate(template));
    assert.deepEqual(validateFlow(flow), []);
    assert.deepEqual(flowSchema.parse(flow), flow);
  }
});

test("un saludo recorre solo la bienvenida y sustituye el nombre", async () => {
  const result = await runFlow(createFlowTemplate("sales"), { name: "María", message: "¡HOLA!" }, {
    searchCatalog: async () => { throw new Error("El saludo no debe consultar el catálogo"); },
  });
  assert.deepEqual(result.visited, ["start", "advisor", "greeting", "welcome"]);
  assert.match(result.replies[0].content, /María/);
  assert.equal(result.replies.length, 1);
  assert.equal(result.handoff, false);
});

test("la solicitud de asesor termina el flujo sin buscar productos", async () => {
  const delivered: string[] = [];
  const result = await runFlow(createFlowTemplate("sales"), { name: "Ana", message: "Quiero un asesor" }, {
    searchCatalog: async () => { throw new Error("No se debe buscar"); },
    deliver: async (reply) => { delivered.push(reply.nodeId); },
  });
  assert.equal(result.handoff, true);
  assert.deepEqual(delivered, ["handoff"]);
});

test("la búsqueda utiliza el texto entrante, el límite configurado y la respuesta del catálogo", async () => {
  const result = await runFlow(createFlowTemplate("sales"), { name: "Luis", message: "parlante JBL" }, {
    searchCatalog: async (query, limit) => { assert.equal(query, "parlante JBL"); assert.equal(limit, 3); return "JBL GO: S/ 120.00 · Stock 7"; },
  });
  assert.equal(result.replies[0].content, "JBL GO: S/ 120.00 · Stock 7");
});

test("inicio por palabras clave puede omitir un mensaje sin ejecutar acciones", async () => {
  const flow = createFlowTemplate(); flow.nodes[0].data = { matchMode: "keyword", keywords: "precio, catálogo" };
  const result = await runFlow(flow, { name: "Ana", message: "Hola" }, { searchCatalog: async () => "" });
  assert.equal(result.matched, false); assert.deepEqual(result.replies, []);
});

test("palabras clave ignoran acentos pero respetan palabras completas", () => {
  assert.equal(matchesKeywords("Necesito CATÁLOGO", "catalogo"), true);
  assert.equal(matchesKeywords("ola", "hola"), false);
  assert.equal(matchesKeywords("consola", "sol"), false);
  assert.equal(matchesKeywords("buenos días", "buenos dias"), true);
  assert.equal(matchesKeywords("Hola", ",,"), false);
});

test("variables del cliente se sustituyen como texto sin interpretar código ni recursión", () => {
  assert.equal(renderFlowText("Hola {{ nombre }}: {{mensaje}}", { name: "{{mensaje}}", message: "={{ process.env.SECRET }}" }), "Hola {{mensaje}}: ={{ process.env.SECRET }}");
});

test("no permite publicar ciclos, bloques desconectados, IDs repetidos ni ramas incompletas", async () => {
  const cycle = createFlowTemplate(); cycle.edges.push({ id: "cycle", source: "welcome", target: "welcome" });
  assert.ok(validateFlow(cycle).some((error) => error.includes("ciclo")));
  await assert.rejects(runFlow(cycle, { name: "X", message: "Hola" }, { searchCatalog: async () => "" }), /ciclo/);
  const disconnected = createFlowTemplate(); disconnected.edges = [];
  assert.ok(validateFlow(disconnected).some((error) => error.includes("desconectados")));
  const repeated = createFlowTemplate(); repeated.nodes.push(repeated.nodes[1]);
  assert.ok(validateFlow(repeated).some((error) => error.includes("identificadores repetidos")));
  const branch = createFlowTemplate("sales"); branch.edges = branch.edges.filter((e) => e.id !== "advisor-no");
  assert.ok(validateFlow(branch).some((error) => error.includes("Sí y No")));
});

test("bloque vacío y variables desconocidas son errores antes de enviar", () => {
  const flow = createFlowTemplate(); flow.nodes[1].data.messageContent = " ";
  assert.ok(validateFlow(flow).some((error) => error.includes("escribe una respuesta")));
  flow.nodes[1].data.messageContent = "{{secret}}";
  assert.ok(validateFlow(flow).some((error) => error.includes("no está disponible")));
});

test("una falla de entrega interrumpe las siguientes acciones", async () => {
  const flow = createFlowTemplate();
  flow.nodes.push({ ...flow.nodes[1], id: "second" }); flow.edges.push({ id: "second", source: "welcome", target: "second" });
  let calls = 0;
  await assert.rejects(runFlow(flow, { name: "A", message: "Hola" }, { searchCatalog: async () => "", deliver: async () => { calls++; throw new Error("Entrega rechazada"); } }), /Entrega rechazada/);
  assert.equal(calls, 1);
});

test("n8n recibe un webhook único por versión y un ejecutor real sin claves", () => {
  const compiled = FlowCompiler.compile("Atención", createFlowTemplate(), "version-123", "https://app.example.test");
  assert.deepEqual(compiled.nodes.map((n) => n.type), ["n8n-nodes-base.webhook", "n8n-nodes-base.httpRequest"]);
  assert.equal(compiled.nodes[0].parameters.path, workflowPath("version-123"));
  assert.equal(compiled.nodes[0].parameters.httpMethod, "POST");
  assert.match(String(compiled.nodes[1].parameters.url), /\/api\/internal\/automations\/execute$/);
  assert.match(String(compiled.nodes[1].parameters.jsonBody), /version-123/);
  assert.equal("active" in compiled, false);
  assert.throws(() => workflowPath("../other"));
  assert.notEqual(workflowPath("a"), workflowPath("b"));
});

test("las firmas expiran, requieren clave y no permiten cambiar la versión ni la ejecución", (t) => {
  const previous = process.env.AUTOMATIONS_EXECUTION_SECRET;
  t.after(() => { if (previous === undefined) delete process.env.AUTOMATIONS_EXECUTION_SECRET; else process.env.AUTOMATIONS_EXECUTION_SECRET = previous; });
  process.env.AUTOMATIONS_EXECUTION_SECRET = "test-key-with-at-least-32-characters";
  const signed = signExecution("execution", "version");
  assert.equal(verifyExecution(signed), true);
  assert.equal(verifyExecution({ ...signed, versionId: "another" }), false);
  assert.equal(verifyExecution({ ...signed, executionId: "another" }), false);
  assert.equal(verifyExecution({ ...signed, signature: "0".repeat(64) }), false);
  assert.equal(verifyExecution(signExecution("execution", "version", Date.now() - 1)), false);
  delete process.env.AUTOMATIONS_EXECUTION_SECRET;
  assert.equal(verifyExecution(signed), false);
  assert.throws(() => signExecution("execution", "version"), /Configura/);
});
