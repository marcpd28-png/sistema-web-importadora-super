import { z } from "zod";

export const intents = ["GREETING", "BUSINESS_QUERY", "PRODUCT_SEARCH", "PRODUCT_DETAILS", "PRODUCT_COMPARISON", "PRODUCT_RECOMMENDATION", "PRODUCT_COMPATIBILITY", "PRICE_QUERY", "STOCK_QUERY", "PROMOTION_QUERY", "WHOLESALE_QUERY", "DELIVERY_QUERY", "PAYMENT_QUERY", "WARRANTY_QUERY", "RETURN_QUERY", "ORDER_STATUS", "COMPLAINT", "PRICE_OBJECTION", "SALES_OBJECTION", "CATALOG_REQUEST", "HUMAN_REQUEST", "FOLLOW_UP", "UNKNOWN"] as const;
export const modeSchema = z.enum(["MANUAL", "COPILOT", "AUTO"]);
export type RockyMode = z.infer<typeof modeSchema>;
export const memorySchema = z.object({
  version: z.literal(1).default(1), intent: z.enum(intents).default("UNKNOWN"),
  productCodes: z.array(z.string().max(64)).max(6).default([]),
  shownCodes: z.array(z.string().max(64)).max(8).default([]),
  query: z.string().max(120).default(""), budget: z.number().nonnegative().nullable().default(null),
  quantity: z.number().int().positive().max(100000).default(1),
  needs: z.array(z.string().max(120)).max(10).default([]),
  asked: z.array(z.string().max(120)).max(10).default([]),
  stage: z.enum(["DISCOVERY", "QUALIFICATION", "COMPARISON", "OBJECTION", "CLOSING", "HANDOFF"]).default("DISCOVERY"),
});
export type RockyMemory = z.infer<typeof memorySchema>;
export const planSchema = z.object({
  intent: z.enum(intents), query: z.string().max(120),
  codes: z.array(z.string().max(64)).max(6),
  budget: z.number().nonnegative().nullable(), quantity: z.number().int().positive().max(100000),
  needs: z.array(z.string().max(120)).max(10),
}).strict();
export type RockyPlan = z.infer<typeof planSchema>;
export type ProductFact = {
  id: string; code: string; name: string; brand: string | null; category: string | null;
  unitPrice: number; wholesalePrice: number | null; wholesaleMinQty: number;
  stockUnits: number; description: string | null; technicalSpecs: string | null;
  updatedAt?: string;
};
export type KnowledgeHit = { id: string; sourceId: string; sourceType: string; text: string; score: number; productId: string | null; title: string };
export type ToolCall = { name: string; ok: boolean; latencyMs: number; resultCount: number; reasonCode?: string };
export type CatalogDelivery = { scope: "FULL" | "FILTERED"; label: string; url: string; count: number;
  document?: { url: string; name: string }; reason?: string };
export type RockyResult = {
  catalog?: CatalogDelivery;
  rockyRequestId: string; intent: RockyPlan["intent"]; skill: string; confidence: number;
  confidenceEvidence: string[]; toolsRequested: string[]; toolCalls: ToolCall[];
  products: ProductFact[]; sources: KnowledgeHit[]; reply: string; requiresHuman: boolean;
  reasonCode: string | null; memory: RockyMemory; model: string; latencyMs: number;
  tokens: { input: number; output: number } | null; finalAction: "SUGGEST" | "SIMULATE" | "HANDOFF" | "QUEUE";
};
export type LLMMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; images?: string[] };
export interface LLMProvider {
  readonly model: string;
  plan(messages: LLMMessage[]): Promise<{ plan: RockyPlan; tokens: { input: number; output: number } }>;
  embed(texts: string[]): Promise<number[][]>;
  health(): Promise<{ ready: boolean; models: string[] }>;
}
export interface SpeechToTextProvider { transcribe(audio: Uint8Array, mimeType: string): Promise<string> }
