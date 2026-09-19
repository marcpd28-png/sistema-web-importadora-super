import { z } from "zod";
import { createHash } from "node:crypto";
import { normalizeCartCommand } from "./bc-cart-language";
import { normalizeCommercialText } from "./commercial-query";
import { getLinePricing } from "./pricing";
import type { CommercialProduct } from "./commercial-catalog";
import type { RequestAgenda } from "./bc-request-agenda";

export const multiCartSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["SIMULATOR", "LIVE"]).optional(),
  stage: z.enum(["REVIEW", "NAME", "DOCUMENT", "DOCUMENT_NUMBER", "DELIVERY", "ADDRESS", "CONFIRM", "PAYMENT", "VOUCHER", "COMPLETE", "CANCELLED"]),
  lines: z.array(z.object({ code: z.string().min(1).max(64), name: z.string().max(180), quantity: z.number().int().positive().max(100000), unitPrice: z.number().nonnegative(), total: z.number().nonnegative() })).max(30),
  total: z.number().nonnegative(),
  name: z.string().max(120).optional(), documentType: z.enum(["BOLETA", "FACTURA"]).optional(), documentNumber: z.string().max(11).optional(),
  delivery: z.string().max(40).optional(), address: z.string().max(500).optional(),
  orderNumber: z.string().max(80).optional(), payment: z.string().max(60).optional(), voucherMessageId: z.string().max(191).optional(),
});
export type MultiCart = z.infer<typeof multiCartSchema>;
const money = (n: number) => (Math.round(n * 100) / 100);
const sameLines = (a: MultiCart, b: MultiCart) => JSON.stringify(a.lines) === JSON.stringify(b.lines);

export function priceMultiCart(lines: Array<{ code: string; quantity: number }>, products: CommercialProduct[]) {
  if (!lines.length || lines.length > 30) return { error: "El carrito debe tener entre 1 y 30 productos." };
  const quantities = new Map<string, number>();
  for (const line of lines) quantities.set(line.code, (quantities.get(line.code) ?? 0) + line.quantity);
  const priced: MultiCart["lines"] = [];
  for (const [code, quantity] of quantities) {
    const product = products.find(p => p.code === code && p.isVisible);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000 || product.stockUnits < quantity) return { error: `No puedo confirmar ${quantity} unidades de ${code}: revisa el producto o su stock.` };
    const pricing = getLinePricing({ ...product, unitPrice: Number(product.unitPrice), wholesalePrice: product.wholesalePrice === null ? null : Number(product.wholesalePrice), boxPrice: product.boxPrice === null ? null : Number(product.boxPrice) }, quantity);
    priced.push({ code, name: product.name, quantity, unitPrice: money(pricing.unitPrice), total: money(pricing.total) });
  }
  return { cart: multiCartSchema.parse({ version: 1, stage: "REVIEW", lines: priced, total: money(priced.reduce((sum, line) => sum + line.total, 0)) }) };
}

export function cartFromAgenda(agenda: RequestAgenda, products: CommercialProduct[], minimumTopics = 2) {
  const requests = new Map<string, RequestAgenda["requests"][number]>();
  for (const request of agenda.requests) if (request.purchaseRequested && request.kind === "PRICE" && request.status !== "CANCELLED" && request.topicId) requests.set(request.topicId, request);
  if (requests.size < minimumTopics) return null;
  const lines: Array<{ code: string; quantity: number }> = [];
  for (const [topicId, request] of requests) {
    const code = agenda.topics.find(t => t.id === topicId)?.selectedCode;
    if (!code || !request.quantity || request.status !== "ANSWERED") return null;
    lines.push({ code, quantity: request.quantity });
  }
  const priced = priceMultiCart(lines, products);
  return priced.cart ?? null;
}

export function multiCartSummary(cart: MultiCart) {
  return `${cart.mode === "LIVE" ? "Carrito" : "Carrito de simulación"}:\n${cart.lines.map(line => `${line.code} · ${line.name}: ${line.quantity} × S/ ${line.unitPrice.toFixed(2)} = S/ ${line.total.toFixed(2)}`).join("\n")}\nTotal de productos: S/ ${cart.total.toFixed(2)}. No incluye flete no cotizado.\nPuedes escribir «agregar CODIGO 2», «cambiar CODIGO a 3», «quitar CODIGO» o «continuar compra».`;
}

export function advanceMultiCart(input: { cart: MultiCart; content: string; products: CommercialProduct[]; conversationId: string; triggerMessageId: string; voucherMessageId?: string; deliveryMethods: string[]; paymentMethods: string[] }) {
  const cart = structuredClone(input.cart);
  const text = normalizeCommercialText(normalizeCartCommand(input.content, cart));
  const live = cart.mode === "LIVE";
  const result = (reply: string) => ({ cart: multiCartSchema.parse(cart), reply });
  // Never intercept opt-out, human handoff or unrelated questions.
  if (/\b(?:asesor|humano|reclamo|queja|devolucion|stop|unsubscribe|no quiero mensajes)\b|\b(?:no me|deja de|dejen de)\s+(?:escrib\w*|respond\w*|contact\w*)/.test(text)) return null;
  if (cart.stage === "CANCELLED" || input.voucherMessageId && cart.stage !== "VOUCHER") return null;
  const correction = text.match(/^(?:cambiar|cambia|corregir|corrige|mi)\s+(?:mi\s+)?(nombre|dni|ruc|direccion)(?:\s+(?:a|es))?\s*:?\s+(.+)$/);
  if (correction) {
    if (cart.orderNumber) return result("El pedido ya está registrado. Un asesor debe revisar la corrección.");
    const [, field, value] = correction;
    if (field === "nombre") {
      if (value.length < 3 || value.length > 120 || /\d/.test(value)) return result("Indica un nombre válido.");
      cart.name = value;
    } else if (field === "direccion") {
      if (value.length < 8 || value.length > 500) return result("Indica ciudad y dirección completa.");
      cart.address = value;
    } else {
      if (!(field === "dni" ? /^\d{8}$/ : /^\d{11}$/).test(value)) return result(field === "dni" ? "El DNI debe tener 8 dígitos." : "El RUC debe tener 11 dígitos.");
      cart.documentType = field === "dni" ? "BOLETA" : "FACTURA"; cart.documentNumber = value;
    }
    cart.stage = "REVIEW";
    return result(`Dato corregido. ${multiCartSummary(cart)}\nCliente: ${cart.name ?? "pendiente"}. ${cart.documentType ?? "Documento"}: ${cart.documentNumber ?? "pendiente"}. Dirección: ${cart.address ?? "pendiente"}. Revisa y continúa la compra.`);
  }
  if (text === "cancelar pedido" || text === "cancelar carrito" || text === "no quiero comprar") {
    if (cart.orderNumber) return result("El pedido ya fue confirmado. Solicita revisión al asesor para cancelarlo.");
    cart.stage = "CANCELLED";
    return result("Carrito cancelado. No se creó ningún pedido.");
  }
  const remove = text.match(/^quitar\s+(\S+)$/);
  const change = text.match(/^(?:cambiar|cambia)\s+(\S+)\s+a\s+(\d+)(?:\s+unidad(?:es)?)?$/);
  const add = text.match(/^agregar\s+(\S+)\s+(\d+)(?:\s+unidad(?:es)?)?$/);
  if (add) {
    if (cart.orderNumber) return result("Este pedido ya fue confirmado. Solicita una nueva revisión antes de agregar productos.");
    const product = input.products.find(p => normalizeCommercialText(p.code) === add[1] && p.isVisible);
    if (!product) return result("No identifiqué ese código en el catálogo publicado.");
    const quantity = Number(add[2]);
    if (quantity < 1 || quantity > 100000) return result("Indica una cantidad válida para agregar.");
    const priced = priceMultiCart([...cart.lines, { code: product.code, quantity }], input.products);
    if (!priced.cart) return result(priced.error!);
    Object.assign(cart, { lines: priced.cart.lines, total: priced.cart.total, stage: "REVIEW" });
    return result(multiCartSummary(cart));
  }
  if (remove || change) {
    if (cart.orderNumber) return result("Este pedido ya fue confirmado. Las modificaciones requieren una nueva revisión del asesor.");
    const code = cart.lines.find(line => normalizeCommercialText(line.code) === (remove || change)![1])?.code;
    if (!code) return result("Ese código no está en el carrito. Indica el código de una de sus líneas.");
    const lines = remove ? cart.lines.filter(line => line.code !== code) : cart.lines.map(line => line.code === code ? { ...line, quantity: Number(change![2]) } : line);
    if (!lines.length) { cart.lines = []; cart.total = 0; cart.stage = "CANCELLED"; return result("Carrito vacío. No se creó ningún pedido."); }
    const priced = priceMultiCart(lines, input.products);
    if (!priced.cart) return result(priced.error!);
    Object.assign(cart, { lines: priced.cart.lines, total: priced.cart.total, stage: "REVIEW" });
    return result(multiCartSummary(cart));
  }
  if (text === "ver carrito" || text === "resumen") return result(multiCartSummary(cart));
  if (cart.stage === "COMPLETE" && live) return result(`El pedido ${cart.orderNumber} está pendiente de revisión. El pago no está verificado.`);
  if (cart.stage === "COMPLETE") return result(`La referencia ${cart.orderNumber} ya está registrada en esta simulación. El comprobante sigue pendiente de validación; no se creó un pedido real.`);
  if (/[?¿]|\b(?:catalogo|garantia|horario|informacion|precios?|stock|envios?|aceptan)\b/.test(text)) return null;
  if (cart.stage === "REVIEW") {
    if (!/^(?:continuar compra|continuar|si|confirmo carrito)$/.test(text)) return null;
    cart.stage = !cart.name ? "NAME" : !cart.documentType ? "DOCUMENT" : !cart.documentNumber ? "DOCUMENT_NUMBER" : "DELIVERY";
    return result(cart.stage === "NAME" ? `¿A nombre de quién registramos este pedido${live ? "" : " de simulación"}?` : cart.stage === "DOCUMENT" ? "¿Boleta o factura?" : cart.stage === "DOCUMENT_NUMBER" ? "Indica tu número de documento." : `¿Cómo prefieres recibirlo? ${input.deliveryMethods.join(", ")}.`);
  }
  if (cart.stage === "NAME") {
    if (input.content.trim().length < 3 || input.content.trim().length > 120 || /\d|\b(?:si|no|comprar|precio|stock|envio)\b/.test(text)) return result("Indícame el nombre del cliente para este pedido conjunto.");
    cart.name = input.content.trim(); cart.stage = "DOCUMENT";
    return result("¿Boleta o factura?");
  }
  if (cart.stage === "DOCUMENT") {
    if (!/^(?:boleta|factura)$/.test(text)) return result("Indica «boleta» o «factura».");
    cart.documentType = text === "boleta" ? "BOLETA" : "FACTURA";
    delete cart.documentNumber; cart.stage = "DOCUMENT_NUMBER";
    return result(cart.documentType === "BOLETA" ? "Indica el DNI de 8 dígitos." : "Indica el RUC de 11 dígitos.");
  }
  if (cart.stage === "DOCUMENT_NUMBER") {
    const digits = text.replace(/^(?:mi\s+)?(?:dni|ruc)(?:\s+es)?\s*/, "");
    if (!(cart.documentType === "FACTURA" ? /^\d{11}$/ : /^\d{8}$/).test(digits)) return result(cart.documentType === "FACTURA" ? "Necesito un RUC de 11 dígitos." : "Necesito un DNI de 8 dígitos.");
    cart.documentNumber = digits; cart.stage = "DELIVERY";
    return result(`¿Cómo prefieres recibirlo? ${input.deliveryMethods.join(", ")}.`);
  }
  if (cart.stage === "DELIVERY") {
    const deliveryText = /^(?:lo recojo|voy a recoger|recoger en tienda|recojo en tienda)$/.test(text) ? "recojo" : text.replace(/^(?:por|quiero|prefiero)\s+/, "");
    const method = input.deliveryMethods.find(method => normalizeCommercialText(method) === deliveryText);
    if (!method) return result(`Elige una opción: ${input.deliveryMethods.join(", ")}.`);
    cart.delivery = method;
    cart.stage = normalizeCommercialText(method) === "recojo" ? "CONFIRM" : "ADDRESS";
    return result(cart.stage === "ADDRESS" ? "Indica ciudad, dirección o agencia y datos de recepción. El flete queda pendiente de cotización." : `${multiCartSummary(cart)}\nCliente: ${cart.name}. ${cart.documentType}: ${cart.documentNumber}. Entrega: ${cart.delivery}.\nEscribe «confirmar pedido» para registrar ${live ? "el pedido pendiente de revisión" : "la referencia de simulación"}.`);
  }
  if (cart.stage === "ADDRESS") {
    if (input.content.trim().length < 8 || input.content.trim().length > 500) return result("Necesito ciudad y dirección o agencia para continuar.");
    cart.address = input.content.trim(); cart.stage = "CONFIRM";
    return result(`${multiCartSummary(cart)}\nCliente: ${cart.name}. ${cart.documentType}: ${cart.documentNumber}. Entrega: ${cart.delivery}, ${cart.address}.\nFlete pendiente de cotización. Escribe «confirmar pedido» para registrar ${live ? "el pedido pendiente de revisión" : "la referencia de simulación"}.`);
  }
  if (cart.stage === "CONFIRM") {
    if (!/^(?:confirmar pedido|confirmo pedido|confirmo)$/.test(text)) return result("Revisa el resumen y escribe «confirmar pedido», o cambia una línea por su código.");
    const priced = priceMultiCart(cart.lines, input.products);
    if (!priced.cart) { cart.stage = "REVIEW"; return result(`${priced.error} Corrige el carrito antes de confirmar.`); }
    if (!sameLines(cart, priced.cart)) {
      Object.assign(cart, { lines: priced.cart.lines, total: priced.cart.total, stage: "REVIEW" });
      return result(`Cambió la cotización. Debes revisarla de nuevo.\n${multiCartSummary(cart)}`);
    }
    cart.orderNumber = live ? `BC-${createHash("sha256").update(`${input.conversationId}:${input.triggerMessageId}`).digest("hex").slice(0, 24).toUpperCase()}` : `SIM-CART-${input.triggerMessageId.slice(-20).toUpperCase()}`;
    cart.stage = "PAYMENT";
    if (live) return result(`Pedido ${cart.orderNumber} registrado pendiente de revisión. Total de productos S/ ${cart.total.toFixed(2)}; flete no incluido. El stock no está reservado. Un asesor confirmará disponibilidad y envío antes del pago. ¿Qué medio prefieres? ${input.paymentMethods.join(", ")}.`);
    return result(`Referencia de simulación ${cart.orderNumber}. Total de productos S/ ${cart.total.toFixed(2)}; flete no incluido. No se creó un pedido real ni se reservó stock. ¿Qué medio de pago usarías? ${input.paymentMethods.join(", ")}.`);
  }
  if (cart.stage === "PAYMENT") {
    const paymentText = text.replace(/^(?:por|con|pago con|pagare con|prefiero)\s+/, "");
    const payment = input.paymentMethods.find(method => normalizeCommercialText(method) === paymentText);
    if (!payment) return result(`Elige un medio: ${input.paymentMethods.join(", ")}.`);
    cart.payment = payment; cart.stage = "VOUCHER";
    if (live) return result(`Preferencia ${payment} registrada. Espera la confirmación del asesor antes de pagar. Si ya pagaste, adjunta el comprobante para revisión.`);
    return result(`Registrado ${payment} para la simulación. Puedes adjuntar un comprobante de prueba, sin realizar un pago real.`);
  }
  if (cart.stage === "VOUCHER") {
    if (!input.voucherMessageId && live) return result("El pedido está pendiente de revisión. Si ya pagaste, adjunta el comprobante; no se validará automáticamente.");
    if (!input.voucherMessageId) return result("Adjunta una imagen del comprobante de prueba. No marcaré el pago como validado automáticamente.");
    cart.voucherMessageId = input.voucherMessageId; cart.stage = "COMPLETE";
    if (live) return result(`Comprobante recibido para ${cart.orderNumber}. Pendiente de revisión; pago no verificado.`);
    return result(`Comprobante de prueba recibido para ${cart.orderNumber}. Pendiente de revisión; pago no verificado. El pedido conjunto permanece exclusivamente en la simulación.`);
  }
  return null;
}
