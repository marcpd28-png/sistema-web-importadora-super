import assert from "node:assert/strict";
import test from "node:test";
import { memorySchema, type RockyMemory, type ProductFact } from "./contracts";
import { runRockyCheckout, wantsRockyCheckout } from "./checkout";
import { RockyAIOrchestrator } from "./orchestrator";
import type { CommercialProduct } from "../commercial-catalog";
import { purchaseCommand } from "./purchase-language";
import { detectPlan } from "./planning";

const products = [
  { id: "a", code: "A100", name: "Audífono Pro negro", unitPrice: 50, wholesalePrice: 40, wholesaleMinQty: 3, stockUnits: 10 },
  { id: "b", code: "B200", name: "Audífono Pro blanco", unitPrice: 60, wholesalePrice: null, wholesaleMinQty: 3, stockUnits: 5 },
  { id: "c", code: "C300", name: "Audífono Pro negro premium", unitPrice: 80, wholesalePrice: null, wholesaleMinQty: 3, stockUnits: 3 },
].map(p => ({ ...p, isVisible: true, boxPrice: null, unitsPerBox: null, brand: null, category: null, description: null, technicalSpecs: null }));
const initial = (shownCodes = ["A100", "B200"]) => memorySchema.parse({ productCodes: ["A100"], shownCodes });
function step(text: string, memory: RockyMemory) {
  return runRockyCheckout({ text, memory, products: products as unknown as CommercialProduct[], conversationId: "test", triggerMessageId: "test",
    deliveryMethods: ["RECOJO", "DELIVERY"], paymentMethods: ["Yape"] });
}
const orchestrator = new RockyAIOrchestrator({ search: async () => products, product: async code => products.find(p => p.code === code) as ProductFact ?? null,
  knowledge: async () => [{ id: "w", sourceId: "w", sourceType: "WARRANTY", text: "Garantía con comprobante.", score: 1, productId: null, title: "Garantía" }] });

test("agradecimientos, pausas y confirmaciones no se guardan como datos del cliente", () => {
  const buying = step("quiero 2", initial())!;
  for (const stage of ["NAME", "ADDRESS"] as const) {
    const memory = memorySchema.parse({ ...buying.memory, cart: { ...buying.memory.cart, stage } });
    for (const text of ["gracias", "muchas gracias", "no gracias", "un momento", "ya vuelvo", "ok", "perfecto", "sí", "confirmar pedido"]) {
      assert.deepEqual(step(text, memory)!.memory.cart, memory.cart, `${stage}: ${text}`);
    }
  }
  assert.equal(step("me llamo Ana Perez", buying.memory)!.memory.cart?.name, "Ana Perez");
});

test("cancelación natural limpia la compra pendiente y permite empezar otra", () => {
  const buying = step("quiero 2", initial())!;
  for (const text of ["cancelar", "cancela la compra", "ya no quiero comprar", "ya no"]) {
    const cancelled = step(text, buying.memory)!;
    assert.equal(cancelled.memory.cart?.stage, "CANCELLED");
    assert.equal(cancelled.memory.awaitingQuantity, false);
    assert.equal(step("quiero 3", cancelled.memory)!.memory.cart?.lines[0].quantity, 3);
  }
  const ambiguous = step("dame dos del negro", initial(["A100", "C300"]))!;
  const cancelled = step("cancelar", ambiguous.memory)!;
  assert.equal(cancelled.memory.pendingPurchaseQuantity, undefined);
  assert.equal(cancelled.memory.awaitingQuantity, false);
});

test("cantidades sueltas completas y valores inválidos mientras espera cantidad", () => {
  const waiting = step("lo quiero", initial())!;
  for (const [text, count] of [["siete", 7], ["ocho", 8], ["nueve", 9]] as const) {
    assert.equal(step(text, waiting.memory)!.memory.cart?.lines[0].quantity, count);
  }
  for (const text of ["0", "-2", "1.5", "1,5", "quiero 0"]) {
    const result = step(text, waiting.memory)!;
    assert.equal(result.memory.cart, undefined);
    assert.match(result.reply, /entera mayor que cero/);
  }
});

test("saludos, agradecimientos y objeciones conservan selección y contexto", async () => {
  const memory = memorySchema.parse({ ...initial(), query: "audifono", quantity: 2, budget: 100 });
  for (const text of ["hola", "gracias", "lo voy a pensar"]) {
    const result = await orchestrator.chat({ text, memory });
    assert.deepEqual(result.memory.productCodes, memory.productCodes);
    assert.equal(result.memory.query, memory.query);
    assert.equal(result.memory.quantity, memory.quantity);
    assert.equal(result.memory.budget, memory.budget);
  }
});

test("cancelar después de confirmar no modifica la referencia ni afirma cancelación", () => {
  let result = step("quiero 2", initial())!;
  for (const text of ["Ana Perez", "boleta 12345678", "recojo", "confirmar pedido"]) result = step(text, result.memory)!;
  const cancelled = step("cancelar", result.memory)!;
  assert.deepEqual(cancelled.memory.cart, result.memory.cart);
  assert.match(cancelled.reply, /asesor/);
});

test("dos resultados ofrecen solamente las dos opciones disponibles", async () => {
  const twoOptions = new RockyAIOrchestrator({ search: async () => products.slice(0, 2), product: async () => null, knowledge: async () => [] });
  const result = await twoOptions.chat({ text: "busco audifonos" });
  assert.match(result.reply, /el primero o el segundo/);
  assert.doesNotMatch(result.reply, /tercero/);
});

for (const command of ["dame dos del negro", "quiero dos del negro", "me llevo dos del negro", "dame 2 del negro por favor", "necesito dos del primero"]) {
  test(`selección natural: ${command}`, () => {
    assert.equal(wantsRockyCheckout(command, initial()), true);
    const result = step(command, initial())!;
    assert.equal(result.memory.cart?.lines[0].code, "A100");
    assert.equal(result.memory.cart?.total, 100);
    assert.equal(result.memory.cart?.stage, "NAME");
  });
}

test("color ambiguo conserva cantidad hasta elegir, sin escoger el producto anterior", () => {
  const ambiguous = step("dame dos del negro", initial(["A100", "B200", "C300"]))!;
  assert.equal(ambiguous.memory.cart, undefined);
  const selected = step("el tercero", ambiguous.memory)!;
  assert.equal(selected.memory.cart?.lines[0].code, "C300");
  assert.equal(selected.memory.cart?.lines[0].quantity, 2);
});

for (const command of ["no quiero dos del negro", "dame dos del negro o blanco", "quiero dos del negro y uno del blanco", "quiero 60 soles", "quiero dos mas"]) {
  test(`no interpreta una compra ambigua o negada: ${command}`, () => assert.equal(purchaseCommand(command), null));
}

test("compra completa admite cambio de producto y cantidad sin pedir otra vez datos válidos", async () => {
  let result = step("dame dos del negro", initial())!;
  for (const text of ["Ana Perez", "boleta 12345678", "recojo"]) result = step(text, result.memory)!;
  result = step("ese no, el otro", result.memory)!;
  assert.equal(result.memory.cart?.lines[0].code, "B200");
  result = step("mejor tres", result.memory)!;
  assert.equal(result.memory.cart?.total, 180);
  result = step("continuar", result.memory)!;
  assert.equal(result.memory.cart?.stage, "CONFIRM");
  assert.match(result.reply, /Ana Perez/);
  assert.match(result.reply, /12345678/);
  const question = await orchestrator.chat({ text: "¿Qué garantía tiene?", memory: result.memory });
  assert.equal(question.memory.cart?.stage, "CONFIRM");
  result = step("confirmar pedido", question.memory)!;
  assert.equal(result.memory.cart?.stage, "PAYMENT");
  assert.equal(step("mejor el primero", result.memory)!.memory.cart?.lines[0].code, "B200");
});

test("otro entre varias opciones, stock insuficiente y negaciones no alteran el carrito", () => {
  const result = step("quiero 2 A100", initial(["A100", "B200", "C300"]))!;
  for (const text of ["ese no, el otro", "no cambies la cantidad", "mejor doce"]) {
    assert.deepEqual(step(text, result.memory)!.memory.cart, result.memory.cart);
  }
  assert.equal(step("lo voy a pensar", result.memory), null);
  assert.equal(step("está muy caro", result.memory), null);
});

test("detalle conserva opciones mostradas y foto no vuelve a iniciar el checkout", async () => {
  const selected = await orchestrator.chat({ text: "el primero", memory: initial() });
  assert.deepEqual(selected.memory.shownCodes, ["A100", "B200"]);
  const buying = step("quiero 2", selected.memory)!;
  const photo = await orchestrator.chat({ text: "una foto", memory: buying.memory });
  assert.match(photo.reply, /¿A nombre de quién/);
  assert.doesNotMatch(photo.reply, /¿Quieres comprarlo/);
  assert.deepEqual(photo.memory.cart, buying.memory.cart);
});

test("dudas durante selección ambigua y devoluciones nunca se convierten en compras", () => {
  const result = step("dame dos del negro", initial(["A100", "B200", "C300"]))!;
  assert.equal(step("¿Qué garantía tienen?", result.memory), null);
  assert.equal(detectPlan("quiero 3 pero necesito una devolucion", initial()).intent, "RETURN_QUERY");
  const cart = step("quiero 2", initial())!;
  assert.deepEqual(step("quiero dos del negro y uno del blanco", cart.memory)!.memory.cart, cart.memory.cart);
  assert.equal(step("quiero tres", cart.memory)!.memory.cart?.total, 120);
});

for (const text of ["quiero 2 unidades y 3 unidades del blanco", "no quiero comprar 2 unidades", "quiero -2 unidades", "quiero 1.5 unidades"]) {
  test(`la conversación no crea carrito a partir de: ${text}`, () => {
    const waiting = step("lo quiero", initial())!;
    assert.equal(step(text, waiting.memory)!.memory.cart, undefined);
  });
}
