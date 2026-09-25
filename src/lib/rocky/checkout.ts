import { randomUUID } from "node:crypto";
import { advanceMultiCart, priceMultiCart, type MultiCart } from "../bc-multi-cart";
import type { CommercialProduct } from "../commercial-catalog";
import { normalize, detectPlan } from "./planning";
import { memorySchema, type RockyMemory, type RockyResult } from "./contracts";
import { purchaseCommand, resolvePurchaseReference } from "./purchase-language";

const words: Record<string, number> = { uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const quantity = (text: string) => {
  const match = text.match(/^(?:quiero|llevo|dame|necesito)?\s*(\d+|uno|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+(?:unidades?|piezas?))?[.!]*$/);
  return match ? words[match[1]] ?? Number(match[1]) : undefined;
};

export function wantsRockyCheckout(text: string, memory: RockyMemory) {
  const t = normalize(text);
  return Boolean(memory.cart && memory.cart.stage !== "CANCELLED" || memory.awaitingQuantity ||
    purchaseCommand(text) ||
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
    case "PAYMENT": return "¿Qué medio de pago prefieres?";
    case "VOUCHER": return "Puedes adjuntar el comprobante para revisión; el pago aún no está verificado.";
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
  if (["HUMAN_REQUEST", "COMPLAINT", "RETURN_QUERY", "SALES_OBJECTION", "PRICE_OBJECTION"].includes(plan.intent)) return null;
  const memory = memorySchema.parse(structuredClone(input.memory));
  const reply = (text: string): RockyResult => ({
    rockyRequestId: randomUUID(), intent: "FOLLOW_UP", skill: "closing-sale", confidence: 1,
    confidenceEvidence: ["VALIDATED_CART"], toolsRequested: [], toolCalls: [], products: [], sources: [],
    reply: text, requiresHuman: false, reasonCode: null, memory, model: "rules-and-tools", latencyMs: 0,
    tokens: null, finalAction: "SUGGEST",
  });
  if (input.voucherMessageId && memory.cart?.stage !== "VOUCHER") return null;
  const shortText = t.replace(/[.!]+$/g, "").trim();
  const cancel = /^(?:cancelar(?: (?:pedido|carrito|compra))?|cancela(?: (?:el pedido|el carrito|la compra))?|ya no(?: quiero(?: comprar| el pedido)?)?|no quiero comprar)$/.test(shortText);
  if (cancel && !memory.cart?.orderNumber) {
    if (memory.cart) memory.cart.stage = "CANCELLED";
    memory.awaitingQuantity = false;
    delete memory.pendingPurchaseQuantity;
    memory.stage = "DISCOVERY";
    return reply("De acuerdo, cancelé la compra. No se creó ningún pedido. ¿Qué otro producto necesitas?");
  }
  if (cancel) return reply("La referencia ya fue confirmada. Un asesor debe revisar la cancelación.");
  if (/^(?:gracias|muchas gracias|no gracias|ok|okay|listo|perfecto|entiendo|hola|buenas|un momento|espera(?: un momento)?|ya vuelvo|ahorita|luego|mas tarde)[! .]*$/.test(t) && memory.cart?.stage !== "REVIEW") {
    const prompt = memory.cart ? checkoutPrompt(memory.cart, input.deliveryMethods) : memory.pendingPurchaseQuantity ? "¿Qué producto eliges? Dime el código o una de las opciones." : "¿Cuántas unidades llevas?";
    return reply(`Claro, conservamos lo que llevas.${prompt ? ` Cuando quieras continuar: ${prompt}` : ""}`);
  }
  if (/^no\s+(?:quiero|compres|agregues|cambies|quites)\b/.test(t) && t !== "no quiero comprar") {
    return reply("De acuerdo, no cambio tu compra. ¿Qué necesitas corregir?");
  }
  if (/^(?:quiero|dame|necesito|llevo|me llevo|comprar)\b/.test(t)) {
    if (/\s-\d|\b\d+[.,]\d/.test(t)) return reply("Indica una cantidad entera mayor que cero.");
    if (/\b(?:y|o|mas|menos)\b/.test(t) && /\d|\b(?:un|uno|una|dos|tres|cuatro|cinco)\b/.test(t)) {
      return reply("Vamos producto por producto. ¿Qué código y cantidad agregamos primero?");
    }
  }
  if (!memory.cart || memory.cart.stage === "CANCELLED") {
    if (!wantsRockyCheckout(input.text, memory)) return null;
    if (["BUSINESS_QUERY", "WARRANTY_QUERY", "PAYMENT_QUERY", "DELIVERY_QUERY", "CATALOG_REQUEST"].includes(plan.intent)) return null;
    if (/^(?:no|cancelar|no quiero comprar|ya no)[.! ]*$/.test(t)) {
      memory.awaitingQuantity = false;
      delete memory.pendingPurchaseQuantity;
      return reply("De acuerdo. ¿Qué otro producto necesitas?");
    }
    const command = purchaseCommand(input.text);
    const count = command?.quantity ?? quantity(t) ?? Number(t.match(/\b(\d+)\s*(?:unidades?|piezas?)\b/)?.[1] || t.match(/^(?:quiero comprar|comprar|agregar)\s+(\d+)\b/)?.[1] || memory.pendingPurchaseQuantity || (memory.intent === "WHOLESALE_QUERY" ? memory.quantity : 0));
    if ((command || quantity(t) !== undefined) && (!Number.isInteger(count) || count < 1 || count > 100000)) return reply("Indica una cantidad entera mayor que cero y hasta 100000 unidades.");
    if (memory.awaitingQuantity && /^-?\d+(?:[.,]\d+)?$/.test(t) && (!Number.isInteger(Number(t)) || Number(t) < 1)) return reply("Indica una cantidad entera mayor que cero.");
    if (memory.awaitingQuantity && !count && !/^(?:lo quiero|me lo llevo|quiero comprar)/.test(t)) return null;
    const codes = input.products.filter(p => new RegExp(`(?:^|[^A-Z0-9-])${p.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Z0-9-])`, "i").test(input.text)).map(p => p.code);
    const ordinal = t.match(/\b(?:el|la) (primero|primera|segundo|segunda|tercero|tercera)\b/);
    const position = ordinal ? Math.floor(["primero", "primera", "segundo", "segunda", "tercero", "tercera"].indexOf(ordinal[1]) / 2) : -1;
    const shown = memory.shownCodes.flatMap(code => input.products.filter(p => p.code === code));
    const reference = command?.reference || (memory.pendingPurchaseQuantity && !quantity(t) ? t : "");
    const selected = codes.length ? codes : position >= 0 ? memory.shownCodes[position] ? [memory.shownCodes[position]] : [] : reference ? resolvePurchaseReference(reference, shown, memory.productCodes) : memory.productCodes;
    if (!selected.length && !memory.shownCodes.length) return null;
    if (selected.length !== 1) {
      if (count > 0 && count <= 100000) memory.pendingPurchaseQuantity = count;
      memory.awaitingQuantity = true;
      return reply("¿Qué producto eliges? Dime el código o selecciona una de las opciones.");
    }
    memory.productCodes = selected;
    if (!count) {
      memory.awaitingQuantity = true;
      return reply("¿Cuántas unidades llevas?");
    }
    const priced = priceMultiCart([{ code: selected[0], quantity: count }], input.products);
    if (!priced.cart) { memory.awaitingQuantity = true; return reply(priced.error!); }
    memory.cart = { ...priced.cart, mode: "SIMULATOR", stage: "NAME" };
    memory.quantity = count; memory.awaitingQuantity = false; memory.stage = "CLOSING";
    delete memory.pendingPurchaseQuantity;
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
  if (["NAME", "ADDRESS"].includes(cart.stage) && /^(?:si|no|de acuerdo|esta bien|continuar|continuar compra|confirmar pedido|confirmo)[.! ]*$/.test(t)) return reply(checkoutPrompt(cart, input.deliveryMethods));
  if (cart.stage === "NAME") content = content.replace(/^(?:me llamo|mi nombre es|a nombre de)\s+/i, "").trim();
  if (/^(?:no cambies|no agregues|no quites)\b/.test(t)) return reply(`De acuerdo, conservo tu carrito. ${checkoutPrompt(cart, input.deliveryMethods)}`);
  const replacement = t.match(/^(?:ese no[, ]+|esa no[, ]+|mejor\s+)(?:el|la)\s+(.+?)[.!]*$/);
  if (replacement) {
    if (cart.orderNumber) return reply("El pedido ya fue registrado. Un asesor debe revisar el cambio.");
    if (cart.lines.length !== 1) return reply("¿Qué producto quieres reemplazar? Indica su código.");
    const shown = memory.shownCodes.flatMap(code => input.products.filter(p => p.code === code));
    const candidates = resolvePurchaseReference(replacement[1], shown, cart.lines.map(line => line.code));
    if (candidates.length !== 1) return reply("¿Cuál eliges? Indica el código para cambiar al producto correcto.");
    const priced = priceMultiCart([{ code: candidates[0], quantity: cart.lines[0].quantity }], input.products);
    if (!priced.cart) return reply(priced.error!);
    memory.cart = { ...cart, lines: priced.cart.lines, total: priced.cart.total, stage: "REVIEW" };
    memory.productCodes = candidates;
    return reply(`${priced.cart.lines[0].name} · ${priced.cart.lines[0].quantity} unidades\nProductos: S/ ${priced.cart.total.toFixed(2)}. Envío aparte.\n¿Continuamos con esta compra?`);
  }
  const correction = t.match(/^(?:mejor|solo|cambia a|dejalo en)\s+(\d+|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+unidades?)?[.!]*$/);
  const command = purchaseCommand(input.text);
  if (correction || command && !command.reference) {
    if (cart.lines.length !== 1) return reply("¿De qué producto cambio la cantidad? Indica su código.");
    const count = correction ? purchaseCommand(`quiero ${correction[1]}`)!.quantity : command!.quantity;
    content = `cambiar ${cart.lines[0].code} a ${count}`;
  } else if (/^(?:quiero|dame|necesito|me llevo|llevo)\b/.test(t) && !["DELIVERY", "PAYMENT"].includes(cart.stage)) {
    return reply("Para agregar otro producto, escribe «agregar CÓDIGO cantidad». Para reemplazarlo, escribe «mejor el primero» o indica la opción que eliges.");
  }
  const bundledDocument = t.match(/^(boleta|factura)\s+(?:dni\s*|ruc\s*)?(\d+)$/);
  if (cart.stage === "DOCUMENT" && bundledDocument) {
    cart = { ...cart, documentType: bundledDocument[1] === "factura" ? "FACTURA" : "BOLETA", stage: "DOCUMENT_NUMBER" };
    content = bundledDocument[2];
  }
  if (cart.stage === "REVIEW" && /^(?:ok|si|continuar|continuar compra)[.! ]*$/.test(t)) content = "continuar compra";
  const step = advanceMultiCart({ ...input, cart, content });
  if (!step) return null;
  if (cart.stage === "REVIEW" && step.cart.stage === "DELIVERY" && cart.delivery) {
    step.cart.stage = normalize(cart.delivery) === "recojo" || cart.address ? "CONFIRM" : "ADDRESS";
  }
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
