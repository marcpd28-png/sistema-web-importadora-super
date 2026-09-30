import { z } from "zod";

export const storeEventNames = ["page_view", "view_item", "add_to_cart", "begin_checkout", "quote_created", "search", "search_results", "whatsapp_click", "assistant_open", "assistant_message", "checkout_error"] as const;
export type StoreEventName = typeof storeEventNames[number];
export const analyticsConsentEvent = "store-analytics-consent-change";
export function cleanSearchTerm(value: string) {
  const text = value.trim().replace(/\s+/g, " ").slice(0, 80);
  // Do not persist contact data, URLs or credential-shaped input as search analytics.
  if (/@|https?:|www\.|(?:\d[\s().-]*){7,}|\b(?:dni|ruc|telefono|celular|password|token|clave|contrasena|direccion)\b/i.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return "";
  return text.replace(/[^\p{L}\p{N}\s+.,()/-]/gu, "").toLowerCase();
}
export const storeEventSchema = z.object({
  id: z.string().uuid(), name: z.enum(storeEventNames), page: z.enum(["home", "product", "category", "sheet"]),
  productCode: z.string().trim().min(1).max(64).optional(),
  searchTerm: z.string().max(80).optional(), resultCount: z.number().int().min(0).max(1000000).optional(),
  quoteId: z.string().min(1).max(191).optional(),
}).strict().superRefine((event, ctx) => {
  if (event.name === "quote_created" && !event.quoteId) ctx.addIssue({ code: "custom", message: "QUOTE_REQUIRED" });
  if (event.quoteId && event.name !== "quote_created") ctx.addIssue({ code: "custom", message: "QUOTE_EVENT_ONLY" });
  if (["view_item", "add_to_cart"].includes(event.name) && !event.productCode) ctx.addIssue({ code: "custom", message: "PRODUCT_REQUIRED" });
  if (event.name === "search_results" && event.resultCount === undefined) ctx.addIssue({ code: "custom", message: "RESULT_COUNT_REQUIRED" });
  if (event.searchTerm !== undefined && !["search", "search_results"].includes(event.name)) ctx.addIssue({ code: "custom", message: "SEARCH_EVENT_ONLY" });
  if (event.resultCount !== undefined && event.name !== "search_results") ctx.addIssue({ code: "custom", message: "RESULT_EVENT_ONLY" });
  if (event.productCode !== undefined && !["view_item", "add_to_cart"].includes(event.name)) ctx.addIssue({ code: "custom", message: "PRODUCT_EVENT_ONLY" });
});
export const storeEventBatchSchema = z.object({ consent: z.literal(true), sessionId: z.string().uuid(), source: z.enum(["direct", "google", "tiktok", "facebook", "instagram", "whatsapp", "other"]), device: z.enum(["mobile", "desktop"]), events: z.array(storeEventSchema).min(1).max(8) }).strict();
export function trafficSource(referrer: string, campaignSource: string, ownOrigin: string) {
  let host = "";
  try { const url = new URL(referrer); if (url.origin !== ownOrigin) host = url.hostname; } catch { /* Direct visit. */ }
  const source = `${campaignSource.toLowerCase()} ${host.toLowerCase()}`;
  if (/tiktok/.test(source)) return "tiktok";
  if (/facebook|fb\.com|^fb\s/.test(source)) return "facebook";
  if (/instagram|^ig\s/.test(source)) return "instagram";
  if (/whatsapp|wa\.me/.test(source)) return "whatsapp";
  if (/google/.test(source)) return "google";
  return host || campaignSource ? "other" : "direct";
}
