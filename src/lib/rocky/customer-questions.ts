import { businessTopics, productSubject } from "./query-language";
import type { RockyPlan } from "./contracts";

export type CustomerQuestion = { label: string; text: string; intent?: RockyPlan["intent"] };
/** Only supported independent information topics; never split a request to a human or an order action. */
export function customerQuestions(text: string): CustomerQuestion[] {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const business = businessTopics(text);
  const topics: CustomerQuestion[] = [];
  let product = normalized;
  if (business.address || business.hours) {
    topics.push({ label: "Tienda", intent: "BUSINESS_QUERY", text: [business.address ? "dirección" : "", business.hours ? "horario" : ""].filter(Boolean).join(" y ") });
    product = product.replace(/\b(?:direccion|ubicacion|horarios?|donde (?:queda(?:n)?(?: su| la)? tienda|estan|se encuentran))\b/g, " ");
  }
  for (const [label, pattern, question, intent] of [
    ["Envío", /\b(?:delivery|envios?|envian|entregas?)\b/, "envío", "DELIVERY_QUERY"],
    ["Pago", /\b(?:pagos?|pagar|yape|plin|cuenta bancaria)\b/, "pago", "PAYMENT_QUERY"],
    ["Garantía", /\bgarantia\b/, "garantía", "WARRANTY_QUERY"],
  ] as const) {
    if (pattern.test(normalized)) {
      topics.push({ label, intent, text: `${question}: ${text}` });
      product = product.replace(new RegExp(pattern.source, "g"), " ");
    }
  }
  // Do not treat an address/destination or payment method as a product search.
  product = product.replace(/\b(?:hacen|aceptan|tienen|cual es|su|tiene)\b/g, " ")
    .replace(/\ba\s+[^?,;]+$/g, " ").replace(/[¿?;,]/g, " ").replace(/\s+/g, " ").trim();
  const hasProductQuestion = /\b(?:precio|precios|cuanto cuesta|cuanto sale|stock|caracteristicas|fotos?)\b/.test(normalized)
    || /\b(?:informacion|detalles)\b/.test(normalized) && Boolean(productSubject(product));
  if (!hasProductQuestion) return topics.length > 1 ? topics : [];
  if (!topics.length) return [];
  return [{ label: "Producto", text: product }, ...topics];
}
