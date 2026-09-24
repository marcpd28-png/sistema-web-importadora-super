import test from "node:test";
import assert from "node:assert/strict";
import { runRockyCheckout, wantsRockyCheckout } from "./checkout";
import { memorySchema } from "./contracts";
import type { CommercialProduct } from "../commercial-catalog";
import { RockyAIOrchestrator } from "./orchestrator";
import { rockyAttachments } from "./attachments";
import { detectPlan } from "./planning";
import { Prisma } from "@prisma/client";

const products = [{ id: "p1", code: "P100-NEGRO", name: "Audífono inalámbrico Pro negro", isVisible: true,
  unitPrice: 50, wholesalePrice: 40, wholesaleMinQty: 3, boxPrice: null, unitsPerBox: null, stockUnits: 10 }] as unknown as CommercialProduct[];
const initial = () => memorySchema.parse({ productCodes: ["P100-NEGRO"] });
function step(text: string, memory = initial(), voucherMessageId?: string, inventory = products) {
  return runRockyCheckout({ text, memory, products: inventory, conversationId: "sim-1", triggerMessageId: "m-1", voucherMessageId,
    deliveryMethods: ["RECOJO", "DELIVERY"], paymentMethods: ["Yape", "Plin"] });
}

test("venta breve: intención, cantidad, datos juntos, confirmación y comprobante sin aprobar pago", () => {
  let result = step("lo quiero")!;
  assert.equal(result.memory.awaitingQuantity, true);
  assert.equal((result.reply.match(/¿/g) ?? []).length, 1);
  result = step("tres", result.memory)!;
  assert.equal(result.memory.cart?.total, 120);
  assert.equal(result.memory.cart?.stage, "NAME");
  for (const text of ["Ana Perez", "boleta 12345678", "recojo"]) result = step(text, result.memory)!;
  assert.equal(result.memory.cart?.stage, "CONFIRM");
  assert.equal(result.memory.cart?.orderNumber, undefined);
  result = step("confirmar pedido", result.memory)!;
  assert.match(result.memory.cart!.orderNumber!, /^SIM-CART-/);
  assert.match(result.reply, /No se creó un pedido real/);
  result = step("Yape", result.memory)!;
  assert.equal(result.memory.cart?.stage, "VOUCHER");
  result = step("comprobante", result.memory, "photo-1")!;
  assert.equal(result.memory.cart?.stage, "COMPLETE");
  assert.match(result.reply, /pago no verificado/);
  assert.equal(step("confirmo", result.memory)!.memory.cart?.orderNumber, result.memory.cart?.orderNumber);
});

test("una consulta lateral conserva compra y selección, sin convertirla en datos personales", async () => {
  const memory = step("quiero comprar 2 unidades")!.memory;
  for (const text of ["¿Qué garantía tiene?", "como puedo pagar", "mandame una foto", "tienes otro modelo"]) assert.equal(step(text, memory), null);
  const answer = await new RockyAIOrchestrator({ search: async () => [], product: async () => null,
    knowledge: async () => [{ id: "k", sourceId: "policy", sourceType: "WARRANTY", text: "Garantía de 6 meses.", title: "Garantía", score: 1, productId: null }],
  }).chat({ text: "¿Qué garantía tiene?", memory });
  assert.deepEqual(answer.memory.cart, memory.cart);
  assert.deepEqual(answer.memory.productCodes, memory.productCodes);
  assert.match(answer.reply, /¿A nombre de quién/);
  assert.equal(step("Ana Perez", answer.memory)!.memory.cart?.stage, "DOCUMENT");
});

test("stock, ambigüedad, cancelación y cambios de precio impiden confirmar equivocadamente", () => {
  assert.equal(step("quiero comprar 2 unidades", memorySchema.parse({ productCodes: ["A", "B"] }))!.memory.cart, undefined);
  const out = step("quiero comprar 20 unidades")!;
  assert.equal(out.memory.cart, undefined);
  assert.equal(step("2", out.memory)!.memory.cart?.total, 100);
  let memory = step("comprar P100-NEGRO 2 unidades")!.memory;
  assert.equal(step("asesor", memory), null);
  assert.equal(step("no me escribas", memory), null);
  assert.equal(step("cancelar pedido", memory)!.memory.cart?.stage, "CANCELLED");
  for (const text of ["Ana Perez", "factura 12345678901", "recojo"]) memory = step(text, memory)!.memory;
  const changed = step("confirmar pedido", memory, undefined, products.map(p => ({ ...p, unitPrice: new Prisma.Decimal(60) })))!;
  assert.equal(changed.memory.cart?.orderNumber, undefined);
  assert.equal(changed.memory.cart?.stage, "REVIEW");
  assert.equal(changed.memory.cart?.total, 120);
  assert.match(changed.reply, /Cambió la cotización/);
});

test("acepta compra afirmativa solo con selección única y no pierde cantidad mayorista", () => {
  assert.equal(wantsRockyCheckout("si", initial()), true);
  assert.equal(wantsRockyCheckout("si", memorySchema.parse({})), false);
  assert.equal(step("quiero comprar", memorySchema.parse({ productCodes: [products[0].code], intent: "WHOLESALE_QUERY", quantity: 3 }))!.memory.cart?.total, 120);
  assert.deepEqual(detectPlan("precio P100-NEGRO", initial()).codes, ["P100-NEGRO"]);
  assert.equal(step("no", step("lo quiero")!.memory)!.memory.awaitingQuantity, false);
  assert.equal(step("quiero 2")!.memory.cart?.total, 100);
  assert.equal(step("quiero comprar el primero 2 unidades", memorySchema.parse({ shownCodes: [products[0].code] }))!.memory.cart?.total, 100);
});

test("nombres extensos no interrumpen la compra y facturas inválidas no avanzan a entrega", () => {
  const result = step("quiero comprar 2 unidades", initial(), undefined, products.map(p => ({ ...p, name: "Auricular Pro ".repeat(30) })))!;
  assert.equal(result.memory.cart?.lines[0].name.length, 180);
  const identified = step("Ana Perez", result.memory)!;
  const invalid = step("factura 123", identified.memory)!;
  assert.equal(invalid.memory.cart?.stage, "DOCUMENT_NUMBER");
  assert.equal(invalid.memory.cart?.documentNumber, undefined);
  assert.match(invalid.reply, /11 dígitos/);
});

test("fotos y PDF verificables, máximo tres opciones y sin adjuntos al derivar", () => {
  const result = step("lo quiero")!;
  result.intent = "PRODUCT_DETAILS";
  result.products = [{ ...products[0], updatedAt: undefined, unitPrice: 50, wholesalePrice: 40, brand: null, category: null, description: null, technicalSpecs: null, imageUrl: "/uploads/pro.jpg" }];
  assert.deepEqual(rockyAttachments(result, "https://tienda.test"), [{ messageType: "IMAGE", content: `${products[0].name} · P100-NEGRO`, mediaUrl: "https://tienda.test/uploads/pro.jpg" }]);
  result.catalog = { scope: "FILTERED", label: "Audio", count: 1, url: "https://tienda.test", document: { url: "/uploads/audio.pdf", name: "Audio.pdf" } };
  assert.equal(rockyAttachments(result, "https://tienda.test")[0].messageType, "DOCUMENT");
  result.products[0].imageUrl = "javascript:alert(1)";
  assert.equal(rockyAttachments(result, "https://tienda.test").length, 1);
  result.requiresHuman = true;
  assert.deepEqual(rockyAttachments(result, "https://tienda.test"), []);
});
