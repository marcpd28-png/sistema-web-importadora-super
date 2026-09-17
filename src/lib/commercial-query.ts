/** Text normalization is for descriptions only. ERP identifiers retain punctuation. */
export const normalizeCommercialText = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function literalProductCodes(query: string, codes: string[]) {
  const occurrences = codes.flatMap(code => {
    const literal = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...query.matchAll(new RegExp(`(?:^|[\\s(),;:!?¿¡])(${literal})(?=$|[\\s(),;:!?¿¡])`, "gi"))].map(match => ({ code, start: match.index! + match[0].length - match[1].length, end: match.index! + match[0].length }));
  });
  return [...new Set(occurrences.filter(item => !occurrences.some(other => other.start <= item.start && other.end >= item.end && other.end - other.start > item.end - item.start)).map(item => item.code))];
}

const COLORS: Record<string, string[]> = {
  negro: ["negro", "negra", "negros", "negras", "black"],
  blanco: ["blanco", "blanca", "blancos", "blancas", "white"],
  azul: ["azul", "azules", "blue"], rojo: ["rojo", "roja", "rojos", "rojas", "red"],
  morado: ["morado", "morada", "morados", "moradas", "purple", "purpura"],
  gris: ["gris", "grises", "grey", "gray"], rosado: ["rosado", "rosada", "rosa", "pink"],
  verde: ["verde", "verdes", "green"], amarillo: ["amarillo", "amarilla", "yellow"],
};

export type CommercialConstraints = {
  colors: string[]; excluded: string[]; minPrice: number | null; maxPrice: number | null;
};

export function parseCommercialQuery(content: string) {
  let text = content;
  const constraints: CommercialConstraints = { colors: [], excluded: [], minPrice: null, maxPrice: null };
  const amount = "(?:s\\s*\\/?\\.?\\s*)?(\\d+(?:[.,]\\d{1,2})?)(?:\\s*(?:soles|sol))?";
  text = text.replace(new RegExp(`\\bentre\\s+${amount}\\s+y\\s+${amount}`, "gi"), (_, min, max) => {
    constraints.minPrice = Number(min.replace(",", ".")); constraints.maxPrice = Number(max.replace(",", ".")); return " ";
  });
  text = text.replace(new RegExp(`\\b(?:hasta|menos de|maximo|máximo|presupuesto(?: de)?)\\s+${amount}`, "gi"), (_, value) => {
    constraints.maxPrice = Number(value.replace(",", ".")); return " ";
  });
  text = text.replace(new RegExp(`\\b(?:desde|mas de|más de|minimo|mínimo)\\s+${amount}`, "gi"), (_, value) => {
    constraints.minPrice = Number(value.replace(",", ".")); return " ";
  });
  text = text.replace(/\b(?:que\s+)?(?:no\s+(?:sean?|quiero)|sin|excepto)\s+(?:de\s+)?([\p{L}\d-]+(?:\s+(?:pro|max|plus))?)/giu, (_, value) => {
    constraints.excluded.push(normalizeCommercialText(value)); return " ";
  });
  for (const [color, aliases] of Object.entries(COLORS)) {
    text = text.replace(new RegExp(`\\b(?:${aliases.join("|")})\\b`, "gi"), () => {
      if (!constraints.colors.includes(color)) constraints.colors.push(color); return " ";
    });
  }
  text = text.replace(/\b(?:solo|solamente|únicamente|unicamente|que\s+sean?|color|colores|en)\b/gi, " ");
  return { text: text.replace(/\s+/g, " ").trim(), constraints };
}

export function matchesCommercialConstraints(product: { name: string; code: string; unitPrice?: unknown }, filters: CommercialConstraints) {
  const words = normalizeCommercialText(`${product.name} ${product.code}`).split(" ");
  if (filters.colors.length && !filters.colors.some(color => COLORS[color]?.some(alias => words.includes(alias)))) return false;
  if (filters.excluded.some(term => {
    const aliases = Object.values(COLORS).find(values => values.includes(term)) ?? [term];
    return aliases.some(alias => (` ${words.join(" ")} `).includes(` ${alias} `));
  })) return false;
  const price = product.unitPrice == null ? NaN : Number(product.unitPrice);
  if (filters.minPrice !== null && (!Number.isFinite(price) || price < filters.minPrice)) return false;
  if (filters.maxPrice !== null && (!Number.isFinite(price) || price > filters.maxPrice)) return false;
  return true;
}

export function matchesExplicitModelVersion(query: string, name: string) {
  const tokens = normalizeCommercialText(query.replace(/\bpro\s*\+/gi, "pro plus")).split(" ");
  if (!tokens.some(token => /\d/.test(token))) return true;
  const words = normalizeCommercialText(name.replace(/\bpro\s*\+/gi, "pro plus")).split(" ");
  return ["pro", "max", "plus", "ultra", "lite", "mini"].every(version => tokens.includes(version) === words.includes(version));
}
