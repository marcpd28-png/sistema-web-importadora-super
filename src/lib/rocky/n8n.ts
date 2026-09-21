import { z } from "zod";
import { WorkflowRegistry } from "./tools";

/** Register only a dedicated read-only Rocky workflow. Existing outbound workflows remain BC-owned. */
export function createN8nWorkflowRegistry() {
  const registry = new WorkflowRegistry();
  const configured = process.env.ROCKY_N8N_CATALOG_PREVIEW_PATH;
  const base = process.env.N8N_BASE_URL;
  if (base && configured && /^\/webhook\/rocky-[a-z0-9-]+$/.test(configured)) {
    const origin = new URL(base);
    if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password) throw new Error("INVALID_N8N_CONFIG");
    registry.register("catalogPreview", z.object({ query: z.string().min(1).max(120), limit: z.number().int().min(1).max(10).default(5) }).strict(), async (payload, signal) => {
      const response = await fetch(new URL(configured, origin.origin), { method: "POST", redirect: "error", signal,
        headers: { "content-type": "application/json", "x-internal-api-key": process.env.N8N_INTERNAL_API_KEY || "" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("WORKFLOW_FAILED");
      const result = z.object({ products: z.array(z.object({ code: z.string().max(64) })).max(10) }).parse(await response.json());
      return result; // Reload all business facts from ERP/backend after receiving references.
    });
  }
  return registry;
}
