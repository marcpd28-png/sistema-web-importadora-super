import { randomUUID } from "node:crypto";
import { advanceMultiCart, priceMultiCart, type MultiCart } from "../bc-multi-cart";
import type { CommercialProduct } from "../commercial-catalog";
import { normalize, detectPlan } from "./planning";
import { memorySchema, type RockyMemory, type RockyResult } from "./contracts";

const words: Record<string, number> = { uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, diez: 10, doce: 12 };
const quantity = (text: string) => {
  const match = text.match(/^(?:quiero|llevo|dame|necesito)?\s*(\d+|uno|una|un|dos|tres|cuatro|cinco|seis|diez|doce)(?:\s+(?:unidades?|piezas?))?[.!]*$/);
  return match ? words[match[1]] ?? Number(match[1]) : undefined;
};

export function wantsRockyCheckout(text: string, memory: RockyMemory) {
  const t = normalize(text);
  return Boolean(memory.cart && memory.cart.stage !== "CANCELLED" || memory.awaitingQuantity ||
    memory.productCodes.length === 1 && quantity(t) !== undefined ||
    memory.productCodes.length === 1 && /^(?:si|ok|si quiero|si por favor)[.! ]*$/.test(t) ||
    /^(?:quiero comprar|comprar|lo quiero|me lo llevo|lo llevo|compralo|continuar compra|agregar\s)/.test(t));
}

export function checkoutPrompt(cart: MultiCart, deliveryMethods: string[] = []) {
  switch (cart.stage) {
    case "NAME": return "¿A nombre de quién?";
    case "DOCUMENT": return "¿Boleta o factura? Puedes incluir el DNI o RUC en el mismo mensaje.";
    case "DOCUMENT_NUMBER": return cart.documentType === "FACTURA" ? "¿Cuál es el RUC de 11 dígitos?" : "¿Cuál es el DNI de 8 dígitos?";
    case "DELIVERY": return deliveryMethods.length ? `¿Cómo lo recibes? ${deliveryMethods.join(", ")}.` : "¿Qué modalidad de entrega prefieres?";
    case "ADDRESS": return "¿Cuál es la ciudad y dirección o agencia? El envío se cotiza aparte.";
    case "REVIEW": return "¿Continuamos con esta compra?";
    case "CONFIRM": return "¿Todo correcto? Escribe «confirmar pedido».";
    default: return "";
  }
}

/** Simulator adapter over BC's validated cart. No provider, payment or order writes. */
export function runRockyCheckout(input: {
  text: string; memory: RockyMemory; products: CommercialProduct[];
  conversationId: string; triggerMessageId: string; voucherMessageId?: string;
  deliveryMethods: string[]; paymentMethods: string[];
}): RockyResult | null {
  const t = normalize(input.text);
  const plan = detectPlan(input.text, input.memory);
  if (["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY"].includes(plan.intent)) return null;
  const memory = memorySchema.parse(structuredClone(input.memory));
  const reply = (text: string): RockyResult => ({
    rockyRequestId: randomUUID(), intent: "FOLLOW_UP", skill: "closing-sale", confidence: 1,
    confidenceEvidence: ["VALIDATED_CART"], toolsRequested: [], toolCalls: [], products: [], sources: [],
    reply: text, requiresHuman: false, reasonCode: null, memory, model: "rules-and-tools", latencyMs: 0,
    tokens: null, finalAction: "SUGGEST",
  });
  if (input.voucherMessageId && memory.cart?.stage !== "VOUCHER") return null;
  if (!memory.cart || memory.cart.stage === "CANCELLED") {
    if (!wantsRockyCheckout(input.text, memory)) return null;
    if (/^(?:no|cancelar|no quiero comprar|ya no)[.! ]*$/.test(t)) {
      memory.awaitingQuantity = false;
      return reply("De acuerdo. ¿Qué otro producto necesitas?");
    }
    const count = quantity(t) ?? Number(t.match(/\b(\d+)\s*(?:unidades?|piezas?)\b/)?.[1] || t.match(/^(?:quiero comprar|comprar|agregar)\s+(\d+)\b/)?.[1] || (memory.intent === "WHOLESALE_QUERY" ? memory.quantity : 0));
    if (memory.awaitingQuantity && !count && !/^(?:lo quiero|me lo llevo|quiero comprar)/.test(t)) return null;
    const codes = input.products.filter(p => new RegExp(`(?:^|[^A-Z0-9-])${p.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Z0-9-])`, "i").test(input.text)).map(p => p.code);
    const ordinal = t.match(/\b(?:el|la) (primero|primera|segundo|segunda|tercero|tercera)\b/);
    const position = ordinal ? Math.floor(["primero", "primera", "segundo", "segunda", "tercero", "tercera"].indexOf(ordinal[1]) / 2) : -1;
    const selected = codes.length ? codes : position >= 0 ? memory.shownCodes[position] ? [memory.shownCodes[position]] : [] : memory.productCodes;
    if (!selected.length && !memory.shownCodes.length) return null;
    if (selected.length !== 1) return reply("¿Qué producto eliges? Dime el código o selecciona una de las opciones.");
    memory.productCodes = selected;
    if (!count) {
      memory.awaitingQuantity = true;
      return reply("¿Cuántas unidades llevas?");
    }
    const priced = priceMultiCart([{ code: selected[0], quantity: count }], input.products);
    if (!priced.cart) { memory.awaitingQuantity = true; return reply(priced.error!); }
    memory.cart = { ...priced.cart, mode: "SIMULATOR", stage: "NAME" };
    memory.quantity = count; memory.awaitingQuantity = false; memory.stage = "CLOSING";
    return reply(`${memory.cart.lines[0].name} · ${count} × S/ ${memory.cart.lines[0].unitPrice.toFixed(2)}\nProductos: S/ ${memory.cart.total.toFixed(2)}. Envío aparte.\n${checkoutPrompt(memory.cart)}`);
  }
  // Never turn a product question into a name/address or restart a completed order.
  if (!input.voucherMessageId && /[?¿]|\b(?:fotos?|imagenes?|catalogos?|garantia|precio|stock|horario|tienes|busco|caracteristicas|cuanto|pague|ya pague)\b/.test(t)) return null;
  if (!input.voucherMessageId && ["BUSINESS_QUERY", "WARRANTY_QUERY", "PRODUCT_COMPARISON", "PRODUCT_COMPATIBILITY", "CATALOG_REQUEST"].includes(plan.intent)) return null;
  if (["DELIVERY_QUERY", "PAYMENT_QUERY"].includes(plan.intent) && ![
    ...input.deliveryMethods, ...input.paymentMethods,
  ].some(method => normalize(method) === t) && /como|donde|cuando|cuanto|aceptan|puedo/.test(t)) return null;
  let cart = memory.cart;
  let content = input.text;
  const bundledDocument = t.match(/^(boleta|factura)\s+(?:dni\s*|ruc\s*)?(\d+)$/);
  if (cart.stage === "DOCUMENT" && bundledDocument) {
    cart = { ...cart, documentType: bundledDocument[1] === "factura" ? "FACTURA" : "BOLETA", stage: "DOCUMENT_NUMBER" };
    content = bundledDocument[2];
  }
  if (cart.stage === "REVIEW" && /^(?:ok|si|continuar|continuar compra)[.! ]*$/.test(t)) content = "continuar compra";
  const step = advanceMultiCart({ ...input, cart, content });
  if (!step) return null;
  memory.cart = step.cart;
  memory.stage = step.cart.stage === "CANCELLED" ? "DISCOVERY" : "CLOSING";
  // Preserve errors and quote changes; shorten only successful data-entry transitions.
  let response = step.reply;
  if (step.cart.stage !== input.memory.cart?.stage && ["NAME", "DOCUMENT", "DOCUMENT_NUMBER", "DELIVERY", "ADDRESS"].includes(step.cart.stage)) {
    response = checkoutPrompt(step.cart, input.deliveryMethods);
  }
  if (step.cart.stage === "CONFIRM" && step.cart.stage !== input.memory.cart?.stage) {
    response = `${step.cart.lines.map(line => `${line.name} · ${line.quantity} × S/ ${line.unitPrice.toFixed(2)}`).join("\n")}\nProductos: S/ ${step.cart.total.toFixed(2)}. Envío aparte.\n${step.cart.name} · ${step.cart.documentType}: ${step.cart.documentNumber}\n${step.cart.delivery}${step.cart.address ? ` · ${step.cart.address}` : ""}\n${checkoutPrompt(step.cart)}`;
  }
  return reply(response);
}
