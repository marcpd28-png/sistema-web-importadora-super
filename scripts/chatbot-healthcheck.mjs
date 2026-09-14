#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const ROUTER_ID = "19jLl9xVWxDslVVL";
const OUTBOUND_V3_ID = "YwSoeCWb8Joo3RAR";
const PRODUCT_SEARCH_ID = "KLb2eUqmr2JVRK4R";
const OUTBOUND_CREDENTIAL_ID = "outbound-v2-internal-api";

const checks = [];
let temporaryDirectory;

function pass(label, detail) {
  checks.push({ status: "PASS", label, detail });
}

function warn(label, detail) {
  checks.push({ status: "WARN", label, detail });
}

function fail(label, detail) {
  checks.push({ status: "FAIL", label, detail });
}

function expect(condition, label, successDetail, failureDetail, failureStatus = "FAIL") {
  if (condition) {
    pass(label, successDetail);
  } else if (failureStatus === "WARN") {
    warn(label, failureDetail);
  } else {
    fail(label, failureDetail);
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error || result.status !== 0) {
    throw new Error(`${label} no se pudo completar.`);
  }

  return result.stdout;
}

function credentialId(node, type) {
  return node?.credentials?.[type]?.id ?? null;
}

function hasHardcodedInternalHeader(node) {
  const headers = node?.parameters?.headerParameters?.parameters;
  if (!Array.isArray(headers)) return false;

  return headers.some((header) =>
    String(header?.name ?? "").toLowerCase() === "x-internal-api-key" &&
    typeof header?.value === "string" &&
    header.value.trim() &&
    !header.value.includes("{{"),
  );
}

function readsExecuteWorkflow(node) {
  const value = node?.parameters?.workflowId ?? node?.parameters?.workflow?.value;
  return typeof value === "string" ? value : null;
}

function exportWorkflows(container) {
  const suffix = `${Date.now()}-${process.pid}`;
  const remoteFile = `/tmp/chatbot-health-${suffix}.json`;
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-health-"));
  const localFile = path.join(temporaryDirectory, "workflows.json");

  try {
    run("docker", [
      "exec", "-u", "node", container, "n8n", "export:workflow", "--all",
      `--output=${remoteFile}`,
    ], "Exportar workflows de n8n");
    run("docker", ["cp", `${container}:${remoteFile}`, localFile], "Copiar exportación de n8n");
    const raw = JSON.parse(fs.readFileSync(localFile, "utf8"));
    return Array.isArray(raw) ? raw : [raw];
  } finally {
    try {
      run("docker", [
        "exec", "-u", "node", container, "node", "-e",
        "require('node:fs').rmSync(process.argv[1],{force:true})", remoteFile,
      ], "Limpiar exportación temporal");
    } catch {
      // The local temporary directory is still removed below. This does not expose data.
    }
  }
}

function checkWorkflowTopology(workflows) {
  const incoming = workflows.find((workflow) => workflow.name === "01 - Incoming Messages");
  const router = workflows.find((workflow) => workflow.id === ROUTER_ID);
  const outbound = workflows.find((workflow) => workflow.id === OUTBOUND_V3_ID);
  const productSearch = workflows.find((workflow) => workflow.id === PRODUCT_SEARCH_ID);

  if (!incoming?.active) {
    fail("Incoming Messages publicado", "No se encontró publicado el workflow de entrada.");
  } else {
    const callsRouter = incoming.nodes.some((node) =>
      node.type === "n8n-nodes-base.executeWorkflow" && readsExecuteWorkflow(node) === ROUTER_ID,
    );
    expect(callsRouter, "Incoming → Router V2", "La entrada llama al Router V2.", "La entrada no llama al Router V2 configurado.");
  }

  if (!router?.active) {
    fail("Router V2 publicado", "El Router V2 no está publicado.");
  } else {
    const dispatch = router.nodes.find((node) => node.name === "Dispatch via Outbound V2");
    const prepare = router.nodes.find((node) => node.name === "Prepare Ordered Outbound");
    const retryIsOff = dispatch?.retryOnFail !== true;
    expect(retryIsOff, "Sin reintentos duplicados", "Dispatch no reintenta el mismo requestId automáticamente.", "Dispatch aún tiene Retry On Fail activado.");
    expect(credentialId(dispatch, "httpHeaderAuth") === OUTBOUND_CREDENTIAL_ID, "Credencial Router → Outbound", "La credencial interna de salida coincide.", "La credencial de Dispatch no coincide.");
    expect(String(prepare?.parameters?.jsCode ?? "").includes("toLowerCase()"), "Contrato outbound tipo text", "Router normaliza el tipo de mensaje para Outbound V3.", "Router no normaliza el tipo de mensaje.");
  }

  if (!outbound?.active) {
    fail("Outbound V3 publicado", "El workflow Outbound V3 no está publicado.");
  } else {
    const webhook = outbound.nodes.find((node) => node.type === "n8n-nodes-base.webhook");
    const valid = outbound.nodes.find((node) => node.name === "Validate Request");
    const typeRule = valid?.parameters?.conditions?.conditions?.find((condition) =>
      String(condition?.leftValue ?? "").includes("$json.type"),
    );

    expect(webhook?.parameters?.path === "chat-outbound-staging-v3", "Webhook Outbound V3", "Ruta de salida correcta.", "La ruta webhook no coincide.");
    expect(credentialId(webhook, "httpHeaderAuth") === OUTBOUND_CREDENTIAL_ID, "Credencial Outbound V3", "Webhook protegido con la credencial correcta.", "Webhook no usa la credencial interna esperada.");
    expect(typeRule?.rightValue === "text", "Validación outbound", "Outbound V3 exige el contrato text correcto.", "La validación del tipo text no coincide.");
  }

  if (!productSearch) {
    warn("Workflow 04 - Product Search", "No se encontró; Router V2 usa la búsqueda interna directa.");
  } else {
    const http = productSearch.nodes.find((node) => node.name === "Search Products API");
    const isUnusedByRouter = !router?.nodes.some((node) =>
      node.type === "n8n-nodes-base.executeWorkflow" && readsExecuteWorkflow(node) === PRODUCT_SEARCH_ID,
    );
    expect(isUnusedByRouter, "Product Search aislado", "Router V2 no duplica la consulta de catálogo.", "Router V2 también llama al workflow 04; revisar duplicación.", "WARN");
    expect(!hasHardcodedInternalHeader(http), "Product Search sin clave fija", "No detecté una clave interna escrita en el nodo.", "Hay una clave fija antigua: no se usa en Router y debe retirarse antes de reutilizar este workflow.", "WARN");
  }
}

async function checkStore(baseUrl) {
  const health = await fetch(new URL("/", baseUrl), { signal: AbortSignal.timeout(15_000) });
  expect(health.ok, "Tienda disponible", `HTTP ${health.status}.`, `HTTP ${health.status}.`);

  const key = process.env.N8N_INTERNAL_API_KEY;
  if (!key) {
    fail("Búsqueda interna", "Falta N8N_INTERNAL_API_KEY en el entorno.");
    return;
  }

  const response = await fetch(new URL("/api/internal/products/search", baseUrl), {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      "x-internal-api-key": key,
    },
    body: JSON.stringify({ query: "taladro", limit: 3 }),
  });
  const data = await response.json().catch(() => null);
  if (response.ok && data?.ok === true && Array.isArray(data.products)) {
    pass("Búsqueda real de catálogo", `HTTP ${response.status}; ${data.products.length} resultados de prueba.`);
  } else {
    fail("Búsqueda real de catálogo", `HTTP ${response.status}; la API no devolvió un contrato válido.`);
  }
}

function checkTests() {
  const result = spawnSync("npm", ["run", "test:chatbot"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.status === 0, "Pruebas del chatbot", "La suite test:chatbot aprobó.", "La suite test:chatbot falló.");
}

function printReport() {
  console.log("\nCHATBOT HEALTH-CHECK\n");
  for (const check of checks) console.log(`${check.status.padEnd(4)} ${check.label} — ${check.detail}`);
  const failures = checks.filter((check) => check.status === "FAIL").length;
  const warnings = checks.filter((check) => check.status === "WARN").length;
  console.log(`\nResultado: ${failures} error(es), ${warnings} advertencia(s).`);
  process.exitCode = failures ? 1 : 0;
}

try {
  const { values } = parseArgs({ options: {
    container: { type: "string", default: "n8n" },
    "base-url": { type: "string", default: "http://127.0.0.1:4000" },
    "skip-tests": { type: "boolean", default: false },
  } });
  const baseUrl = new URL(values["base-url"]);
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("base-url debe usar http o https.");

  checkWorkflowTopology(exportWorkflows(values.container));
  await checkStore(baseUrl);
  if (!values["skip-tests"]) checkTests();
} catch (error) {
  fail("Ejecución del health-check", error instanceof Error ? error.message : "Error inesperado.");
} finally {
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  printReport();
}
