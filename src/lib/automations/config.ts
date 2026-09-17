import { N8nAutomationProvider } from "./n8n-provider";

export function automationConfiguration() {
  const { baseUrl, apiKey } = N8nAutomationProvider.configuration;
  const missing: string[] = [];
  if (!baseUrl) missing.push("URL de n8n");
  if (!apiKey) missing.push("Clave de escritura de n8n");
  if (!process.env.AUTOMATIONS_CALLBACK_URL?.trim()) missing.push("URL de retorno de la aplicación");
  if ((process.env.AUTOMATIONS_EXECUTION_SECRET?.trim().length || 0) < 32) missing.push("Clave de ejecución de automatizaciones");
  return {
    publishReady: missing.length === 0, missing,
    liveEnabled: process.env.AUTOMATIONS_WHATSAPP_ENABLED === "true",
    outboundReady: Boolean(process.env.N8N_OUTBOUND_WEBHOOK_URL && process.env.N8N_OUTBOUND_API_KEY),
  };
}
