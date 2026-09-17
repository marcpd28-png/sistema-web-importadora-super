import { createHash } from "node:crypto";
import { flowSchema, validateFlow, type FlowDefinition } from "./flow-definition";

export interface N8nWorkflow {
  name: string;
  nodes: Array<{
    id: string; name: string; type: string; typeVersion: number; position: [number, number];
    parameters: Record<string, unknown>; webhookId?: string;
  }>;
  connections: Record<string, { main: Array<Array<{ node: string; type: "main"; index: number }>> }>;
  settings: { executionOrder: "v1"; executionTimeout: number; saveDataSuccessExecution: "none"; saveDataErrorExecution: "none" };
}

export function workflowPath(versionId: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(versionId)) throw new Error("Identificador de versión inválido.");
  return `importadora-flow-${versionId}`;
}

export class FlowCompiler {
  // The app interprets the immutable graph, sharing its evaluator with preview.
  // n8n orchestrates a signed execution, without holding any application secrets.
  static compile(name: string, flow: FlowDefinition, versionId: string, callbackBaseUrl: string): N8nWorkflow {
    const parsed = flowSchema.parse(flow);
    const errors = validateFlow(parsed);
    if (errors.length) throw new Error(errors.join(" "));
    const callback = new URL("/api/internal/automations/execute", callbackBaseUrl);
    if (!["https:", "http:"].includes(callback.protocol)) throw new Error("URL de retorno inválida.");
    return {
      name: `[Importadora] ${name} · ${versionId}`,
      nodes: [
        { id: "entry", name: "Mensaje autorizado", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: versionId,
          parameters: { httpMethod: "POST", path: workflowPath(versionId), responseMode: "lastNode", responseData: "firstEntryJson", options: {} } },
        { id: "execute", name: "Ejecutar flujo publicado", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [280, 0],
          parameters: { method: "POST", url: callback.toString(), sendBody: true, specifyBody: "json",
            jsonBody: `={{ { executionId: $json.body.executionId, expiresAt: $json.body.expiresAt, signature: $json.body.signature, versionId: ${JSON.stringify(versionId)}, providerExecutionId: $execution.id } }}`,
            options: { timeout: 120000 } } },
      ],
      connections: { "Mensaje autorizado": { main: [[{ node: "Ejecutar flujo publicado", type: "main", index: 0 }]] } },
      settings: { executionOrder: "v1", executionTimeout: 120, saveDataSuccessExecution: "none", saveDataErrorExecution: "none" },
    };
  }

  static generateDriftHash(workflow: N8nWorkflow) {
    return createHash("sha256").update(JSON.stringify({
      nodes: workflow.nodes.map((node) => ({ id: node.id, name: node.name, type: node.type, parameters: node.parameters })), connections: workflow.connections,
    })).digest("hex");
  }
}
