import type { N8nWorkflow } from "./FlowCompiler";

export class N8nAutomationProvider {
  static get configuration() {
    return {
      baseUrl: (process.env.N8N_BASE_URL?.trim() || process.env.N8N_URL?.trim() || "").replace(/\/$/, ""),
      apiKey: process.env.N8N_WRITE_API_KEY?.trim() || process.env.N8N_API_KEY?.trim(),
    };
  }

  private static async api(path: string, method: string, body?: unknown) {
    const { baseUrl, apiKey } = this.configuration;
    if (!baseUrl || !apiKey) throw new Error("Configura la URL y la clave de escritura de n8n para publicar.");
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method, headers: { "Content-Type": "application/json", "X-N8N-API-KEY": apiKey },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`n8n rechazó la operación (${response.status}). Revisa la conexión y los permisos de la clave.`);
    if (response.status === 204) return null;
    return response.json();
  }

  static async deployWorkflow(workflow: N8nWorkflow): Promise<string> {
    const result = await this.api("/workflows", "POST", workflow);
    if (typeof result?.id !== "string") throw new Error("n8n no devolvió el identificador del flujo.");
    return result.id;
  }

  static async toggleWorkflow(id: string, active: boolean) {
    await this.api(`/workflows/${encodeURIComponent(id)}/${active ? "activate" : "deactivate"}`, "POST");
  }

  static async deleteWorkflow(id: string) {
    await this.api(`/workflows/${encodeURIComponent(id)}`, "DELETE");
  }

  static async triggerWebhook(path: string, payload: unknown) {
    const { baseUrl } = this.configuration;
    if (!baseUrl) throw new Error("La conexión con n8n no está configurada.");
    const response = await fetch(`${baseUrl}/webhook/${encodeURIComponent(path)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(125_000),
    });
    if (!response.ok) throw new Error(`El flujo de n8n falló (${response.status}).`);
    const result = await response.json();
    if (result?.ok !== true) throw new Error("n8n no confirmó la ejecución del flujo.");
  }
}
