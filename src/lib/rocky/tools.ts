import { z } from "zod";
import type { CatalogDelivery, KnowledgeHit, ProductFact, ToolCall } from "./contracts";

export const toolNames = ["getCatalog", "getBusinessInfo", "searchProducts", "getProduct", "getProductByCode", "getStock", "getPrice", "getPromotions", "compareProducts", "checkCompatibility", "getCategories", "getCustomer", "getCustomerOrders", "getOrderStatus", "createCart", "createCheckout", "searchKnowledge", "sendProduct", "sendImage", "sendCatalog", "handoffToHuman", "runWorkflow"] as const;
export type ToolName = typeof toolNames[number];
export interface ToolBackend {
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
export class ToolExecutor {
  readonly calls: ToolCall[] = [];
  constructor(private backend: ToolBackend, private allowed: string[]) {}
  async execute(name: ToolName, args: unknown): Promise<{ products: ProductFact[]; sources: KnowledgeHit[]; catalog?: CatalogDelivery; reasonCode?: string }> {
    const started = Date.now();
    if (this.calls.length >= 12 || !this.allowed.includes(name) || !schemas[name]) throw new Error("TOOL_NOT_AUTHORIZED");
    const input = schemas[name]!.parse(args) as { query?: string; budget?: number; code?: string; codes?: string[]; productId?: string; sourceType?: string; reasonCode?: string };
    try {
      let products: ProductFact[] = []; let sources: KnowledgeHit[] = []; let reasonCode: string | undefined; let catalog: CatalogDelivery | undefined;
      if (name === "getCatalog") { if (!this.backend.catalog) throw new Error("CATALOG_UNAVAILABLE"); catalog = await this.backend.catalog(input.query!); }
      else if (name === "getBusinessInfo") sources = await this.backend.business?.(input.query!) || [];
      else if (name === "searchProducts") products = await this.backend.search(input.query!, input.budget);
      else if (name === "searchKnowledge") sources = await this.backend.knowledge(input.query!, input.productId, input.sourceType);
      else if (name === "handoffToHuman") reasonCode = input.reasonCode;
      else if (name === "getPromotions") reasonCode = "NO_VERIFIED_PROMOTION_ADAPTER";
      else {
        for (const code of input.codes || [input.code!]) {
          const product = await this.backend.product(code);
          if (product) products.push(product);
        }
      }
      this.calls.push({ name, ok: true, latencyMs: Date.now() - started, resultCount: products.length + sources.length, reasonCode });
      return { products, sources, catalog, reasonCode };
    } catch {
      this.calls.push({ name, ok: false, latencyMs: Date.now() - started, resultCount: 0, reasonCode: "TOOL_FAILED" });
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
