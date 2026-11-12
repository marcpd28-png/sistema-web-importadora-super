import assert from "node:assert/strict";
import test from "node:test";
import { isExplicitSimulatorProductInterest, isSimulatorProductAffirmation, isSimulatorQuantityReply, simulatorImageProductQuoteCopy, simulatorPaymentCopy } from "./super-bot-simulator-payment";

const card = {
  id: "p-1", slug: "producto", code: "SKU-1", name: "Producto", description: null, brand: null, category: null,
  imageUrl: "/producto.webp", imageAlt: "Producto", unitPrice: "S/ 59.90", unitPriceValue: 59.9,
  wholesalePrice: null, wholesalePriceValue: null, wholesaleMinQty: 1, availabilityLabel: "Disponible", stockUnits: 3, unitsPerBox: null,
};

test("una afirmación posterior a una tarjeta activa el paso de pago, no una búsqueda nueva", () => {
  assert.equal(isSimulatorProductAffirmation("Sí, me interesa"), true);
  assert.equal(isSimulatorProductAffirmation("siMe interesa"), true);
  assert.equal(isExplicitSimulatorProductInterest("Sí"), false);
  assert.equal(isExplicitSimulatorProductInterest("Me interesa"), true);
  assert.equal(isExplicitSimulatorProductInterest("siMe interesa"), true);
  assert.equal(isSimulatorQuantityReply("3"), true);
  assert.equal(isSimulatorQuantityReply("3 unidades"), true);
  assert.equal(isSimulatorQuantityReply("quiero 12 unidades"), true);
  assert.equal(isSimulatorQuantityReply("¿Tienen otro color?"), false);
  assert.equal(isSimulatorProductAffirmation("Lo quiero"), true);
  assert.equal(isSimulatorProductAffirmation("¿Tienen otro color?"), false);
  assert.equal(simulatorPaymentCopy(card, true), "S/ 59.90. Puedes pagar con tarjeta o Yape por Culqi, transferencia Interbank o Plin.");
  assert.match(simulatorPaymentCopy(card, false), /imagen oficial de métodos de pago aún no está configurada/i);
});

test("una imagen identificada siempre muestra precios y solicita cantidad", () => {
  const wholesaleCard = {
    ...card,
    name: "Parlante Bluetooth",
    unitPrice: "S/ 89.90",
    unitPriceValue: 89.9,
    wholesalePrice: "S/ 74.90",
    wholesalePriceValue: 74.9,
    wholesaleMinQty: 6,
  };

  assert.equal(
    simulatorImageProductQuoteCopy(wholesaleCard),
    "Producto: Parlante Bluetooth. Precio por unidad: S/ 89.90. Precio por mayor: S/ 74.90 c/u a partir de 6 unidades. ¿Cuántas unidades deseas?",
  );
  assert.equal(
    simulatorImageProductQuoteCopy(card),
    "Producto: Producto. Precio por unidad: S/ 59.90. Este producto no registra un precio por mayor. ¿Cuántas unidades deseas?",
  );
});
