import { access } from "node:fs/promises";
import path from "node:path";
import type { ShopAssistantProductCard } from "@/lib/shop-assistant-types";

const PAYMENT_IMAGE_PATH = "/uploads/communications/metodos-pago-importaciones-super-20260929-v2.jpeg";

function normalizeSimulatorAffirmation(message: string) {
  return message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    // The simulator submits the literal customer turn, so accept a common
    // mobile typo where “Sí” and “Me interesa” were typed without a space.
    .replace(/^si(?=me interesa\b)/, "si ");
}

export function isSimulatorProductAffirmation(message: string) {
  const text = normalizeSimulatorAffirmation(message);
  return /^(?:si(?:[,.! ]|$)|claro(?:[,.! ]|$)|dale(?:[,.! ]|$)|ok(?:[,.! ]|$)|okay(?:[,.! ]|$)|de acuerdo(?:[,.! ]|$)|me interesa(?:[,.! ]|$)|lo quiero(?:[,.! ]|$)|la quiero(?:[,.! ]|$)|quiero ese(?:[,.! ]|$)|quiero esa(?:[,.! ]|$)|comprar(?:[,.! ]|$)|lo llevo(?:[,.! ]|$)|la llevo(?:[,.! ]|$))/.test(text);
}

/** A bare “sí” is never enough to bind an arbitrary displayed card to payment. */
export function isExplicitSimulatorProductInterest(message: string) {
  const text = normalizeSimulatorAffirmation(message);
  return /\b(me interesa|lo quiero|la quiero|quiero ese|quiero esa|lo llevo|la llevo|comprar(?:lo|la)?|dame ese|dame esa)\b/.test(text);
}

/** Accepts a direct answer to “¿Cuántas unidades deseas?” after a card. */
export function isSimulatorQuantityReply(message: string) {
  const text = normalizeSimulatorAffirmation(message);
  return /^(?:\d{1,4}(?:\s*(?:unidades?|unds?|und|piezas?|pieza))?|(?:quiero|para)\s+\d{1,4}(?:\s*(?:unidades?|unds?|und|piezas?|pieza))?)$/.test(text);
}

/** The fixed first reply after an image match: catalog facts, then quantity. */
export function simulatorImageProductQuoteCopy(product: ShopAssistantProductCard) {
  const wholesale = product.wholesalePrice !== null && product.wholesalePriceValue !== null
    ? ` Precio por mayor: ${product.wholesalePrice} c/u a partir de ${product.wholesaleMinQty} unidades.`
    : " Este producto no registra un precio por mayor.";

  return `Producto: ${product.name}. Precio por unidad: ${product.unitPrice}.${wholesale} ¿Cuántas unidades deseas?`;
}

export function simulatorPaymentCopy(product: ShopAssistantProductCard, hasPaymentImage: boolean) {
  const imageNote = hasPaymentImage ? "" : " La imagen oficial de métodos de pago aún no está configurada.";
  return `${product.unitPrice}. Puedes pagar con tarjeta o Yape por Culqi, transferencia Interbank o Plin.${imageNote}`;
}

export async function getSimulatorPaymentImageUrl() {
  try {
    await access(path.join(process.cwd(), "public", PAYMENT_IMAGE_PATH));
    return PAYMENT_IMAGE_PATH;
  } catch {
    return null;
  }
}
