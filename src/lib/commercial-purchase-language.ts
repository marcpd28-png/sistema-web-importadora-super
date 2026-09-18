import { normalizeCommercialText } from "./commercial-query";

export function hasPurchaseIntent(content: string) {
  const text = normalizeCommercialText(content);
  if (/\b(?:no|nunca)\s+(?:lo\s+)?(?:quiero|deseo|quisiera|voy a)\s+comprar\b/.test(text)) return false;
  return /\b(?:quiero|deseo|quisiera|voy a|me gustaria)\s+comprar\b|\b(?:lo|los|la|las)\s+(?:quiero|deseo|compro)\b|\bcomprar\s+(?:estos|ambos|los dos)\b/.test(text);
}

/** Remove sales wording without changing brand, model, color or model numbers. */
export function purchaseSubject(content: string) {
  return content
    .replace(/\b(?:me\s+interesa(?:n)?|(?:lo|los|la|las)\s+(?:deseo|quiero|quisiera)\s+comprar|(?:quiero|deseo|quisiera|voy\s+a|me\s+gustar[ií]a)\s+comprar)\b/gi, " ")
    .replace(/\b(?:este|ese|estos|esos)\s+productos?\b/gi, " ")
    .replace(/\b(?:quiero|necesito|deseo)\s+(?:\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\s+(?:unidad(?:es)?|unds?|piezas?)\b/gi, " ")
    .replace(/\b(?:\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\s+(?:unidad(?:es)?|unds?|piezas?)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
}

/** Explicit additions introduce a second requested article, not a longer product name. */
export function splitPurchaseAdditions(content: string) {
  if (!hasPurchaseIntent(content)) return [content];
  return content.split(/\s+(?:y\s+)?(?:tambi[eé]n|adem[aá]s)\s+/i).filter(part => part.trim());
}

