const numbers: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const textKey = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const amount = `(\\d+|${Object.keys(numbers).join("|")})`;

/** A bounded purchase command, not arbitrary customer prose or a model instruction. */
export function purchaseCommand(content: string) {
  const text = textKey(content).replace(/[,!\.]+$/g, "").replace(/\s+(?:por favor|porfa)$/g, "").trim();
  const match = text.match(new RegExp(`^(?:dame|quiero|necesito|llevo|me llevo|quiero comprar|comprar)\\s+${amount}(?:\\s+(?:unidades?|piezas?))?(?:\\s+(?:del?|de la|el|la))?\\s*(.*?)$`));
  if (!match || /\b(?:no|soles|watts|mas|menos|o|y)\b/.test(match[2])) return null;
  return { quantity: numbers[match[1]] ?? Number(match[1]), reference: match[2].trim() };
}

export function resolvePurchaseReference(reference: string, shown: Array<{ code: string; name: string }>, selected: string[]) {
  const ref = textKey(reference).replace(/^(?:el|la|del|de la)\s+/, "");
  if (!ref || /^(?:ese|esa|este|esta)$/.test(ref)) return selected;
  const ordinal = ["primero", "segundo", "tercero"].indexOf(ref.replace(/a$/, "o"));
  if (ordinal >= 0) return shown[ordinal] ? [shown[ordinal].code] : [];
  if (/^(?:otro|otra)$/.test(ref)) return shown.filter(p => !selected.includes(p.code)).map(p => p.code);
  const tokens = ref.split(/\s+/);
  return shown.filter(p => textKey(p.code) === ref || tokens.every(token => textKey(p.name).split(/[^a-z0-9]+/).includes(token))).map(p => p.code);
}
