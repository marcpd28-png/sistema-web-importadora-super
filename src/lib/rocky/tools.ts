import { rockyConfig } from "./config";
import { z } from "zod";
import type { CatalogDelivery, KnowledgeHit, ProductFact, ToolCall } from "./contracts";

export const toolNames = ["getCatalog", "getBusinessInfo", "searchProducts", "getProduct", "getProductByCode", "getStock", "getPrice", "getPromotions", "compareProducts", "checkCompatibility", "getCategories", "getCustomer", "getCustomerOrders", "getOrderStatus", "createCart", "createCheckout", "searchKnowledge", "sendProduct", "sendImage", "sendCatalog", "handoffToHuman", "runWorkflow"] as const;
export type ToolName = typeof toolNames[number];
export interface ToolBackend {
  reviewedExamples?(query: string): Promise<import("./reviewed-examples").ReviewedExample[]>;
  catalog?(query: string): Promise<CatalogDelivery>;
  business?(query: string): Promise<KnowledgeHit[]>;
  search(query: string, budget?: number | null): Promise<ProductFact[]>;
  product(code: string): Promise<ProductFact | null>;
  knowledge(query: string, productId?: string, sourceType?: string): Promise<KnowledgeHit[]>;
}
const codeSchema = z.object({ code: z.string().trim().min(1).max(64) }).strict();
const schemas: Partial<Record<ToolName, z.ZodType>> = {
  getCatalog: z.object({ query: z.string().min(1).max(1200) }).strict(),
  getBusinessInfo: z.object({ query: z.string().min(1).max(120) }).strict(),
  searchProducts: z.object({ query: z.string().trim().min(1).max(120), budget: z.number().nonnegative().nullable().optional() }).strict(),
  getProduct: z.object({ code: z.string().min(1).max(191) }).strict(), getProductByCode: codeSchema, getStock: codeSchema, getPrice: codeSchema,
  getPromotions: codeSchema, checkCompatibility: codeSchema,
  compareProducts: z.object({ codes: z.array(z.string().min(1).max(64)).min(2).max(6) }).strict(),
  searchKnowledge: z.object({ query: z.string().min(1).max(120), productId: z.string().max(191).optional(), sourceType: z.string().max(40).optional() }).strict(),
  handoffToHuman: z.object({ reasonCode: z.string().min(1).max(80) }).strict(),
};
export type RiskLevel = "READ_ONLY" | "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";
type ToolResult = { products: ProductFact[]; sources: KnowledgeHit[]; catalog?: CatalogDelivery; reasonCode?: string };
type ToolInput = { query?: string; budget?: number; code?: string; codes?: string[]; productId?: string; sourceType?: string; reasonCode?: string };
export type ToolDefinition = { name: ToolName; description: string; inputSchema: z.ZodType; riskLevel: RiskLevel;
  execute: (backend: ToolBackend, input: ToolInput) => Promise<ToolResult> };
const empty = (): ToolResult => ({ products: [], sources: [] });
const descriptions: Partial<Record<ToolName, string>> = {
  getCatalog: "Preparar catálogo publicado y enlace de tienda", getBusinessInfo: "Consultar horario y dirección publicados",
  searchProducts: "Buscar productos visibles en backend", getProduct: "Consultar producto por ID o código", getProductByCode: "Consultar producto por código",
  getStock: "Consultar stock actual", getPrice: "Consultar precios actuales", getPromotions: "Comprobar disponibilidad del adaptador de promociones",
  checkCompatibility: "Consultar ficha; compatibilidad requiere verificación", compareProducts: "Consultar productos para comparar atributos",
  searchKnowledge: "Recuperar documentos aprobados", handoffToHuman: "Solicitar derivación; el servicio valida y persiste el control humano",
};
export const toolRegistry: Partial<Record<ToolName, ToolDefinition>> = Object.fromEntries(Object.entries(schemas).map(([key, inputSchema]) => {
  const name = key as ToolName;
  return [name, { name, description: descriptions[name]!, inputSchema, riskLevel: name === "getCatalog" || name === "handoffToHuman" ? "LOW_RISK" : "READ_ONLY",
    async execute(backend: ToolBackend, input: ToolInput): Promise<ToolResult> {
      const result = empty();
      if (name === "getCatalog") { if (!backend.catalog) throw new Error("CATALOG_UNAVAILABLE"); result.catalog = await backend.catalog(input.query!); }
      else if (name === "getBusinessInfo") result.sources = await backend.business?.(input.query!) || [];
      else if (name === "searchProducts") result.products = await backend.search(input.query!, input.budget);
      else if (name === "searchKnowledge") result.sources = await backend.knowledge(input.query!, input.productId, input.sourceType);
      else if (name === "handoffToHuman") result.reasonCode = input.reasonCode;
      else if (name === "getPromotions") result.reasonCode = "NO_VERIFIED_PROMOTION_ADAPTER";
      else for (const code of input.codes || [input.code!]) { const product = await backend.product(code); if (product) result.products.push(product); }
      return result;
    } }];
}));
export async function withToolDeadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("TOOL_TIMEOUT")), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export class ToolExecutor {
  readonly calls: ToolCall[] = [];
  private attempts = 0;
  constructor(private backend: ToolBackend, private allowed: string[]) {}
  async execute(name: ToolName, args: unknown): Promise<ToolResult> {
    const started = Date.now();
    const entry = toolRegistry[name];
    const authorized = this.attempts++ < 12 && this.allowed.includes(name) && entry && ["READ_ONLY", "LOW_RISK"].includes(entry.riskLevel);
    try {
      if (!authorized) throw new Error("TOOL_NOT_AUTHORIZED");
      const input = entry!.inputSchema.parse(args) as ToolInput;
      const result = await withToolDeadline(entry!.execute(this.backend, input), rockyConfig().toolTimeoutMs);
      this.calls.push({ name, ok: true, latencyMs: Date.now() - started, resultCount: result.products.length + result.sources.length + (result.catalog ? 1 : 0), reasonCode: result.reasonCode });
      return result;
    } catch (error) {
      const reasonCode = !authorized ? "TOOL_NOT_AUTHORIZED" : error instanceof z.ZodError ? "INVALID_TOOL_INPUT" : "TOOL_FAILED";
      this.calls.push({ name, ok: false, latencyMs: Date.now() - started, resultCount: 0, reasonCode });
      if (!authorized || error instanceof z.ZodError) throw error;
      throw new Error("TOOL_FAILED");
    }
  }
}

// Explicitly registered execution adapters only. No workflow IDs or URLs from a model.
export class WorkflowRegistry {
  private actions = new Map<string, { schema: z.ZodType; execute: (payload: unknown, signal: AbortSignal) => Promise<unknown> }>();
  register(action: string, schema: z.ZodType, execute: (payload: unknown, signal: AbortSignal) => Promise<unknown>) {
    if (this.actions.has(action)) throw new Error("DUPLICATE_WORKFLOW_ACTION");
    this.actions.set(action, { schema, execute });
  }
  async runWorkflow(action: string, payload: unknown) {
    const entry = this.actions.get(action);
    if (!entry) throw new Error("WORKFLOW_NOT_AUTHORIZED");
    return entry.execute(entry.schema.parse(payload), AbortSignal.timeout(15000));
  }
}
