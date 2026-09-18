import { normalizeCommercialText } from "./commercial-query";

/** Keep checkout answers with the checkout engine; explicit side questions still use the agenda. */
export function checkoutOwnsReply(stage: string | null | undefined, content: string) {
  if (!stage || !/QUANTITY|PRICE_CONFIRMATION|CUSTOMER|DOCUMENT|DELIVERY|ORDER|PAYMENT|COMPLETED/.test(stage)) return false;
  const text = normalizeCommercialText(content);
  if (/QUANTITY|PRICE_CONFIRMATION/.test(stage) && /^(?:(?:mejor|quiero|dame|cambia a)\s+)?\d{1,6}(?:\s*(?:unidades?|unds?|uds?))?[?.!]*$/.test(text)) return true;
  return !/[?¿]|\b(?:catalogo|precio|informacion|garantia|stock|envios|cuanto|horario)\b/.test(text);
}
