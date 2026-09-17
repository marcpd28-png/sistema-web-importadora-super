import type { FlowDefinition } from "@/lib/automations/flow-definition";

export type AutomationData = {
  id: string; name: string; description: string | null; status: string; currentPublishedVersionId: string | null;
  versions: Array<{ id: string; version: number; status: string; flowDefinition: FlowDefinition }>;
  executions: Array<{ id: string; status: string; startedAt: string; error: string | null }>;
  configuration: { publishReady: boolean; missing: string[]; liveEnabled: boolean; outboundReady: boolean };
};
export const statusLabels: Record<string, string> = {
  DRAFT: "Borrador", ACTIVE: "Activo", PAUSED: "Pausado", SYSTEM: "Sistema",
  SUCCESS: "Completado", FAILED: "Fallido", RUNNING: "En curso", QUEUED: "En cola", SKIPPED: "Omitido",
};

export async function automationRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) throw new Error(data?.error || "No se pudo conectar con el servidor. Inténtalo de nuevo.");
  return data as T;
}
