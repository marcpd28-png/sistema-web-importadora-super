import { normalizeProductQuery } from "./rocky-product-query";

export function isRockyGreeting(content: string): boolean {
  const lines = content.split(/\n+/).filter(line => line.trim());
  if (lines.length > 1) return lines.every(isRockyGreeting);
  const text = normalizeProductQuery(content).replace(/tatdes/g, "tardes");
  return /^(hola|ola|buenos dias|buenas tardes|buenas noches|buen dia|saludos|hey)( (rocky|amigo|amiga))?$/.test(text);
}

export function requestedUnits(content: string) {
  const match = normalizeProductQuery(content).match(/^(?:(?:quiero|serian|necesito|son|deseo) )?(\d{1,4})(?: (?:unidad|unidades|und|unds|piezas))?$/)
    ?? normalizeProductQuery(content).match(/\b(\d{1,4}) (?:unidades|unidad|und|unds|piezas)\b/);
  const quantity = match ? Number(match[1]) : 0;
  return quantity > 0 ? quantity : null;
}

export function isQuantityOnly(content: string) {
  return /^(?:(?:quiero|serian|necesito|son|deseo) )?\d{1,4}(?: (?:unidad|unidades|und|unds|piezas))?$/.test(normalizeProductQuery(content));
}

export function isPriceFollowUp(content: string) {
  return /^(?:y )?(?:el )?(?:precio|precios|cuanto cuesta|cuanto vale|cuanto esta|cual es el precio)(?: (?:por mayor|mayorista|del producto|de ese|de este))?$/.test(normalizeProductQuery(content));
}

/** A pending delivery question is NOT permission to consume arbitrary text
 * as an address. Questions and product requests remain independent intents. */
export function deliveryLocation(content: string) {
  const value = normalizeProductQuery(content);
  if (/[?¿]/.test(content) || /\b(precio|cuanto|catalogo|tienen|busco|producto|pago|horario|donde)\b/.test(value)) return null;
  const region = /^(?:(?:soy de|para|en|a|estoy en|lo necesito en|envio a) )?(?:lima|callao|arequipa|cusco|cuzco|trujillo|piura|chiclayo|tacna|puno|juliaca|huancayo|ica|iquitos|pucallpa|huanuco|cajamarca|ayacucho|huaraz|chimbote|tarapoto|tumbes|huancavelica|pasco|moquegua|apurimac|amazonas|lambayeque|madre de dios|san martin|la libertad)(?: peru)?$/;
  const address = /\b(?:avenida|av|jiron|jr|calle|urbanizacion|urb|manzana|mz)\b/.test(value) && /\d/.test(value);
  return region.test(value) || address ? content.trim().slice(0, 500) : null;
}

export function verifiedQuote(product: { isVisible: boolean; stockUnits: number; unitPrice: unknown; wholesalePrice: unknown; wholesaleMinQty: number }, quantity: number) {
  const retail = Number(product.unitPrice), wholesale = Number(product.wholesalePrice);
  if (!product.isVisible || !Number.isInteger(quantity) || quantity < 1 || product.stockUnits < quantity || !Number.isFinite(retail) || retail <= 0) return null;
  const unitPrice = product.wholesalePrice != null && Number.isFinite(wholesale) && wholesale > 0 && quantity >= product.wholesaleMinQty ? wholesale : retail;
  return { unitPrice, quantity, total: Math.round(unitPrice * quantity * 100) / 100 };
}
