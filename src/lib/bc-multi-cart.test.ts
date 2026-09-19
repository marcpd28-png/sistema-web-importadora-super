import assert from "node:assert/strict";
import test from "node:test";
import { advanceMultiCart, cartFromAgenda, priceMultiCart, type MultiCart } from "./bc-multi-cart";
import type { CommercialProduct } from "./commercial-catalog";
import { emptyAgenda, planRequests } from "./bc-request-agenda";

const products = [
  { id: "a", code: "A100", name: "Parlante", unitPrice: 100, wholesalePrice: 90, wholesaleMinQty: 3, boxPrice: null, unitsPerBox: null, unitLabel: "unidad", isVisible: true, stockUnits: 10 },
  { id: "b", code: "B200", name: "Dron", unitPrice: 200, wholesalePrice: null, wholesaleMinQty: 3, boxPrice: null, unitsPerBox: null, unitLabel: "unidad", isVisible: true, stockUnits: 2 },
] as unknown as CommercialProduct[];
const initial = () => priceMultiCart([{ code: "A100", quantity: 1 }, { code: "B200", quantity: 1 }], products).cart!;
function step(cart: MultiCart, content: string, inventory = products, voucherMessageId?: string) {
  return advanceMultiCart({ cart, content, products: inventory, conversationId: "sim-test", triggerMessageId: "message-test", voucherMessageId, deliveryMethods: ["RECOJO", "SHALOM"], paymentMethods: ["Yape", "Plin"] });
}

test("multi-item checkout preserves each line through correction, confirmation and unverified voucher", () => {
  let cart = initial();
  cart = step(cart, "cambiar A100 a 3")!.cart;
  assert.equal(cart.total, 470); assert.equal(cart.lines[1].quantity, 1);
  const inputs = ["continuar compra", "Cliente Prueba", "boleta", "12345678", "recojo", "confirmar pedido", "Yape"];
  for (const input of inputs) cart = step(cart, input)!.cart;
  assert.equal(cart.stage, "VOUCHER"); assert.equal(cart.total, 470);
  assert.match(cart.orderNumber!, /^SIM-CART-/);
  const result = step(cart, "comprobante", products, "image-test")!;
  assert.equal(result.cart.stage, "COMPLETE"); assert.match(result.reply, /pago no verificado/);
  assert.equal(step(result.cart, "confirmo")!.cart.orderNumber, result.cart.orderNumber);
});
test("new prices require another review and unavailable stock prevents confirmation", () => {
  const ready: MultiCart = { ...initial(), stage: "CONFIRM", name: "Cliente", documentType: "BOLETA", documentNumber: "12345678", delivery: "RECOJO" };
  const repriced = products.map(p => p.code === "A100" ? { ...p, unitPrice: 110 } : p) as unknown as CommercialProduct[];
  const result = step(ready, "confirmo", repriced)!;
  assert.equal(result.cart.stage, "REVIEW"); assert.equal(result.cart.orderNumber, undefined); assert.equal(result.cart.total, 310);
  const noStock = products.map(p => ({ ...p, stockUnits: 0 }));
  assert.equal(step(ready, "confirmo", noStock)!.cart.orderNumber, undefined);
});
test("cancellation, exact-code removal and handoff never invent an order", () => {
  assert.equal(step(initial(), "asesor"), null);
  assert.equal(step({ ...initial(), stage: "NAME" }, "no me escribas"), null);
  assert.equal(step({ ...initial(), stage: "NAME" }, "precio A100"), null);
  assert.equal(step({ ...initial(), stage: "NAME" }, "no quiero comprar")!.cart.stage, "CANCELLED");
  assert.equal(step(initial(), "cancelar pedido")!.cart.stage, "CANCELLED");
  const one = step(initial(), "quitar B200")!.cart;
  assert.equal(one.lines.length, 1); assert.equal(one.total, 100);
  assert.equal(step(one, "agregar B200 1")!.cart.lines.length, 2);
  assert.equal(step(one, "agregar A100 2")!.cart.total, 270);
  assert.equal(step(one, "quitar A100")!.cart.stage, "CANCELLED");
  assert.equal(step(initial(), "cambiar A100 a 0")!.cart.total, 300);
  assert.equal(step(initial(), "cambiar B200 a 3")!.cart.total, 300);
});
test("ambiguous or unpriced requests cannot silently enter the cart", () => {
  const parsed = planRequests(emptyAgenda(), [{ id: "m", content: "quiero comprar A100 1 unidad y tambien B200 1 unidad" }]);
  assert.deepEqual(parsed.agenda.requests.map(r => r.quantity), [1, 1]);
  const agenda = emptyAgenda();
  for (const [i, code] of ["A100", "B200"].entries()) {
    const id = `topic-${i}`;
    agenda.topics.push({ id, query: code, selectedCode: code, shownCodes: [] });
    agenda.requests.push({ id: `request-${i}`, kind: "PRICE", topicId: id, question: code, fields: [], quantity: 1, sourceMessageIds: [], status: "ANSWERED", answeredBy: null, evidence: [], purchaseRequested: true });
  }
  assert.equal(cartFromAgenda(agenda, products)?.total, 300);
  agenda.requests[1].status = "NEEDS_CLARIFICATION";
  assert.equal(cartFromAgenda(agenda, products), null);
});
