import { businessTopics, productSubject } from "./query-language";
import { memorySchema, type RockyMemory, type RockyPlan } from "./contracts";

export const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function detectPlan(text: string, memory: RockyMemory = memorySchema.parse({})): RockyPlan {
  const t = normalize(text);
  let codes = [...new Set((text.match(/\b[A-Za-z]{1,8}[-]?\d{2,8}[A-Za-z]?\b/g) || []).map(c => c.toUpperCase()))].slice(0, 6);
  const knownCodes = [...new Set([...memory.productCodes, ...memory.shownCodes])].filter(code =>
    new RegExp(`(?:^|[^A-Z0-9-])${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Z0-9-])`, "i").test(text));
  if (knownCodes.length) codes = [...knownCodes, ...codes.filter(code => !knownCodes.some(known => known.toUpperCase() === code || known.toUpperCase().startsWith(`${code}-`)))].slice(0, 6);
  const ordinal = t.match(/\b(?:el|la|del) (primero|primera|segundo|segunda|tercero|tercera)\b/);
  if (ordinal) {
    const index = Math.floor(["primero", "primera", "segundo", "segunda", "tercero", "tercera"].indexOf(ordinal[1]) / 2);
    if (memory.shownCodes[index]) codes = [memory.shownCodes[index]];
  }
  const budget = t.match(/(?:maximo|hasta|presupuesto(?: de)?|menos de)\s*(?:s\/\.?\s*)?(\d+(?:\.\d+)?)/);
  const quantity = t.match(/(?:quiero|necesito|llevo|deseo)\s+(\d+)\b(?!\s*(?:soles|watts|w\b))/);
  const rules: [RockyPlan["intent"], RegExp][] = [
    ["HUMAN_REQUEST", /hablar con (?:una )?persona|humano|asesor|llamar urgente|deja de responder|no me escrib/],
    ["COMPLAINT", /reclamo|denuncia|estafa|cobro indebido|problema (?:de|con el) pago/],
    ["RETURN_QUERY", /devolucion|devolver|cambio por falla/],
    ["PRICE_OBJECTION", /muy caro|esta caro|mas barato|bajar.*precio/],
    ["PRODUCT_COMPARISON", /cual es mejor|diferencia (?:entre|con)|comparar|compara| versus | vs /],
    ["PRODUCT_COMPATIBILITY", /compatible|sirve para|funciona con/],
    ["WARRANTY_QUERY", /garantia/], ["ORDER_STATUS", /mi pedido|estado del pedido|rastrear/],
    ["DELIVERY_QUERY", /delivery|envio|entrega|envian/], ["PAYMENT_QUERY", /pago|pagar|cuenta bancaria|yape|plin/],
    ["STOCK_QUERY", /stock|disponible|disponibilidad/], ["PROMOTION_QUERY", /promocion|descuento|oferta/],
    ["WHOLESALE_QUERY", /mayorista|al por mayor/], ["PRICE_QUERY", /precio|cuanto cuesta|cuanto sale|cuanto esta/],
    ["CATALOG_REQUEST", /catalogo/], ["PRODUCT_DETAILS", /caracteristicas|ficha|detalle|informacion|especificaciones|\bfotos?\b|\bimagenes?\b/],
    ["PRODUCT_RECOMMENDATION", /recomienda|que me sugieres/], ["SALES_OBJECTION", /no estoy seguro|lo voy a pensar/],
    ["GREETING", /^(?:hola(?: buenas(?: tardes| noches)?| buenos dias| buen dia)?|buenas|buen dia|buenos dias|buenas tardes|buenas noches)[!. ]*$/],
    ["PRODUCT_SEARCH", /quiero|busco|necesito|tienes|tienen|cargador|arrancador|booster|\bcamaras?\b/],
    ["FOLLOW_UP", /^(?:si|ok|ese|el primero|el segundo|gracias)[!. ]*$/],
  ];
  let intent = rules.find(([, rule]) => rule.test(t))?.[0] || (codes.length ? "PRODUCT_DETAILS" : "UNKNOWN");
  // Short technical follow-ups refer to the selected product, not a new catalog search.
  if (/^(?:¿\s*)?tiene (?:bluetooth|wifi|wi-fi)\s*\??$/.test(t)) {
    intent = "PRODUCT_DETAILS";
    if (!codes.length) codes = [...memory.productCodes];
  }
  if (intent === "PRODUCT_COMPARISON" && codes.length === 1 && memory.productCodes.length === 1 && codes[0] !== memory.productCodes[0]) {
    codes = [memory.productCodes[0], ...codes];
  }
  if (/\b(?:catalogos?|catalgoo|catalago)\b/.test(t) && !["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY"].includes(intent)) intent = "CATALOG_REQUEST";
  const topics = businessTopics(text);
  if ((topics.hours || topics.address) && !["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "DELIVERY_QUERY"].includes(intent)) intent = "BUSINESS_QUERY";
  if (ordinal && codes.length) intent = "PRODUCT_DETAILS";
  if (quantity && Number(quantity[1]) >= 3 && memory.productCodes.length && !codes.length && ["PRODUCT_SEARCH", "FOLLOW_UP", "UNKNOWN", "WHOLESALE_QUERY"].includes(intent)) intent = "WHOLESALE_QUERY";
  const follow = ["PRICE_OBJECTION", "WHOLESALE_QUERY", "FOLLOW_UP", "STOCK_QUERY", "PRICE_QUERY", "PRODUCT_COMPARISON", "PRODUCT_DETAILS", "PRODUCT_COMPATIBILITY", "WARRANTY_QUERY"].includes(intent);
  const query = text.replace(/(?:quiero|necesito|llevo|deseo)\s+\d+\s*(?:unidades|uds|piezas)\b/gi, " ").replace(/(?:máximo|maximo|hasta|presupuesto(?: de)?)\s*\d+(?:\.\d+)?\s*(?:soles)?/gi, "").replace(/\b(?:hola|quiero|un|una|para|tienes|tienen|busco|necesito|disponibles?|stock)\b/gi, " ").replace(/[¿?!,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const subject = productSubject(query);
  const another = /\b(?:el otro|del otro|la otra|los otros|las otras)\b/.test(t) && !subject;
  const usePrevious = !another && !ordinal && (follow || intent === "PRODUCT_SEARCH" && !subject) && !codes.length && (!subject || ["PRICE_OBJECTION", "WHOLESALE_QUERY", "FOLLOW_UP", "PRODUCT_COMPARISON", "WARRANTY_QUERY"].includes(intent));
  // A list of options is not a selected product. Never repeat a broad inventory search for "ese".
  const referenceCodes = usePrevious ? memory.productCodes : [];
  return { intent, codes: codes.length ? codes : referenceCodes, query: ordinal && !codes.length || another ? "" : usePrevious ? referenceCodes.length === 1 ? memory.query : "" : subject,
    budget: budget ? Number(budget[1]) : follow ? memory.budget : null,
    quantity: quantity ? Math.min(100000, Math.max(1, Number(quantity[1]))) : follow ? memory.quantity : 1,
    needs: [...new Set([...(follow ? memory.needs : []), ...(/samsung/.test(t) ? ["Samsung"] : []), ...(/rapido|rapida/.test(t) ? ["carga rápida"] : [])])].slice(-10) };
}

export { SYSTEM_PROMPT } from "./prompts";
