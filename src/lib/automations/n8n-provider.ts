import { N8nWorkflow } from "./FlowCompiler";

export class N8nAutomationProvider {
  private static get baseUrl() {
    return process.env.N8N_URL || "http://187.127.248.226:5678";
  }

  private static get apiKey() {
    const key = process.env.N8N_API_KEY?.trim();
    if (!key) throw new Error("N8N_API_KEY is required");
    return key;
  }

  private static get isDev() {
    return process.env.NODE_ENV === "development";
  }

  /**
   * Despliega un workflow compilado a la instancia real de n8n.
   * Maneja actualización si providerWorkflowId existe, o creación si es nuevo.
   */
  static async deployWorkflow(workflow: N8nWorkflow, providerWorkflowId?: string): Promise<string> {
    const isDryRun = this.isDev;
    
    // Prefix name if dev to avoid collision in n8n
    const finalName = isDryRun ? `[DEV] ${workflow.name}` : workflow.name;
    const payload = { ...workflow, name: finalName };

    const headers = {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": this.apiKey
    };

    try {
      let url = `${this.baseUrl}/api/v1/workflows`;
      let method = "POST";

      if (providerWorkflowId) {
        url = `${this.baseUrl}/api/v1/workflows/${providerWorkflowId}`;
        method = "PUT";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`n8n API Error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      return data.id; // Retorna el ID de n8n
    } catch (error) {
      console.error("N8nAutomationProvider Error:", error);
      throw error;
    }
  }

  /**
   * Activa o desactiva un workflow en n8n.
   */
  static async toggleWorkflow(providerWorkflowId: string, active: boolean): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/workflows/${providerWorkflowId}/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": this.apiKey
        },
        body: JSON.stringify({ active })
      });

      if (!response.ok) {
        throw new Error(`n8n API Error on activation: ${response.status}`);
      }
    } catch (error) {
      console.error("N8nAutomationProvider Activation Error:", error);
      throw error;
    }
  }

  /**
   * Dispara el webhook de producción de n8n si hay una automatización activa.
   */
  static async triggerWebhook(path: string, payload: any): Promise<void> {
    const isDryRun = this.isDev;
    // En n8n, los webhooks de prueba son /webhook-test/, los de prod son /webhook/
    const endpoint = isDryRun ? `/webhook-test/${path}` : `/webhook/${path}`;
    
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.warn(`[N8n Provider] Webhook trigger returned ${response.status}`);
      }
    } catch (e) {
      console.error("[N8n Provider] Webhook trigger failed:", e);
    }
  }

}
