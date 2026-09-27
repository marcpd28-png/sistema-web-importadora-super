import type { RockyMemory, RockyPlan } from "./contracts";
import { detectPlan } from "./planning";
import { selectSkill } from "./skills";

export const commercialIntents = ["GREETING", "PRODUCT_SEARCH", "PRODUCT_INFORMATION", "PRODUCT_PRICE", "PRODUCT_STOCK", "PRODUCT_COMPARISON", "SHIPPING", "PAYMENT", "PROMOTION", "WARRANTY", "ORDER_STATUS", "PURCHASE_INTENT", "OBJECTION", "CATALOG_REQUEST", "MEDIA_RECEIVED", "HUMAN_REQUEST", "COMPLAINT", "UNKNOWN", "BUSINESS_QUERY", "FOLLOW_UP"] as const;
export type CommercialIntent = typeof commercialIntents[number];
const aliases: Record<RockyPlan["intent"], CommercialIntent> = {
  GREETING: "GREETING", BUSINESS_QUERY: "BUSINESS_QUERY", PRODUCT_SEARCH: "PRODUCT_SEARCH", PRODUCT_DETAILS: "PRODUCT_INFORMATION",
  PRODUCT_COMPARISON: "PRODUCT_COMPARISON", PRODUCT_RECOMMENDATION: "PRODUCT_SEARCH", PRODUCT_COMPATIBILITY: "PRODUCT_INFORMATION",
  PRICE_QUERY: "PRODUCT_PRICE", STOCK_QUERY: "PRODUCT_STOCK", PROMOTION_QUERY: "PROMOTION", WHOLESALE_QUERY: "PRODUCT_PRICE",
  DELIVERY_QUERY: "SHIPPING", PAYMENT_QUERY: "PAYMENT", WARRANTY_QUERY: "WARRANTY", RETURN_QUERY: "COMPLAINT", ORDER_STATUS: "ORDER_STATUS",
  COMPLAINT: "COMPLAINT", PRICE_OBJECTION: "OBJECTION", SALES_OBJECTION: "OBJECTION", CATALOG_REQUEST: "CATALOG_REQUEST",
  HUMAN_REQUEST: "HUMAN_REQUEST", FOLLOW_UP: "FOLLOW_UP", UNKNOWN: "UNKNOWN",
};
export function classifyIntent(text: string, memory?: RockyMemory, plan = detectPlan(text, memory), media = false) {
  const safety = ["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "ORDER_STATUS"].includes(plan.intent);
  const purchase = /\b(?:quiero comprar|comprarlo|me lo llevo|lo quiero)\b/i.test(text);
  const intent: CommercialIntent = safety ? aliases[plan.intent] : purchase ? "PURCHASE_INTENT" : media && plan.intent === "UNKNOWN" ? "MEDIA_RECEIVED" : aliases[plan.intent];
  const suggestedTools = selectSkill(plan.intent).tools;
  return { intent, legacyIntent: plan.intent, confidence: plan.intent === "UNKNOWN" ? 0.2 : 0.9,
    entities: { budget: plan.budget, quantity: plan.quantity, needs: plan.needs }, productReferences: plan.codes,
    requiresTool: !["GREETING", "FOLLOW_UP", "SALES_OBJECTION", "UNKNOWN"].includes(plan.intent), suggestedTools };
}
export type IntentClassification = ReturnType<typeof classifyIntent>;
