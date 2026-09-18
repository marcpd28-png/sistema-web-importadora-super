/** Text normalization is for descriptions only. ERP identifiers retain punctuation. */
export const normalizeCommercialText = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const codePatterns = new WeakMap<string[], { code: string; pattern: RegExp }[]>();
export function literalProductCodes(query: string, codes: string[]) {
  if (!codePatterns.has(codes)) codePatterns.set(codes, codes.map(code => {
    const literal = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { code, pattern: new RegExp(`(?:^|[\\s(),;:!?¿¡])(${literal})(?=$|[\\s(),;:!?¿¡])`, "gi") };
  }));
  const occurrences = codePatterns.get(codes)!.flatMap(({ code, pattern }) => {
    return [...query.matchAll(pattern)].map(match => ({ code, start: match.index! + match[0].length - match[1].length, end: match.index! + match[0].length }));
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
  measurements: { unit: string; min: number | null; max: number | null }[];
};

const UNITS = "mah|watts?|vatios?|w|voltios?|volts?|v|gb|tb|mb|pulgadas?|hz|khz|mhz|ghz";
const unitName = (unit: string) => /^(?:watts?|vatios?)$/.test(unit) ? "w" : /^(?:voltios?|volts?)$/.test(unit) ? "v" : /^pulgada/.test(unit) ? "pulgadas" : unit;
const numeric = (value: string) => Number(value.replace(",", "."));

export function parseCommercialQuery(content: string) {
  let text = content;
  const constraints: CommercialConstraints = { colors: [], excluded: [], minPrice: null, maxPrice: null, measurements: [] };
  // Parse typed values before currency. A power, voltage or capacity can never be a price.
  text = text.replace(new RegExp(`\\b(?:(hasta|menos de|m[aá]ximo|desde|m[aá]s de|m[ií]nimo)\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})\\b`, "gi"), (_, operator: string | undefined, value: string, unit: string) => {
    const op = normalizeCommercialText(operator || "");
    constraints.measurements.push({ unit: unitName(unit.toLowerCase()), min: /hasta|menos|maximo/.test(op) ? null : numeric(value), max: /desde|mas|minimo/.test(op) ? null : numeric(value) });
    return " ";
  });
  const amount = `(?:s\\s*\\/?\\.?\\s*)?(\\d+(?:[.,]\\d{1,2})?)(?:\\s*(?:soles|sol))?(?![\\da-z]|[.,]\\d|\\s*(?:${UNITS}|cm|mm|kg|g|a|ma)\\b)`;
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

export function matchesCommercialConstraints(product: { name: string; code: string; unitPrice?: unknown; specifications?: { name: string; value: string }[] }, filters: CommercialConstraints) {
  const description = `${product.name} ${(product.specifications || []).filter(spec => !/^marca$/i.test(spec.name)).map(spec => `${spec.name} ${spec.value}`).join(" ")}`;
  const words = normalizeCommercialText(`${description} ${product.code}`).split(" ");
  const measured = [...description.toLowerCase().matchAll(new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})\\b`, "g"))].map(match => ({ unit: unitName(match[2]), value: numeric(match[1]) }));
  if (filters.measurements.some(filter => !measured.some(value => value.unit === filter.unit && (filter.min === null || value.value >= filter.min) && (filter.max === null || value.value <= filter.max)))) return false;
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

/** Canonical filters are reusable by every list scope and by follow-up corrections. */
export function describeCommercialConstraints(filters: CommercialConstraints) {
  return [...filters.colors, ...filters.excluded.map(term => `sin ${term}`),
    ...(filters.minPrice === null ? [] : [`desde ${filters.minPrice} soles`]),
    ...(filters.maxPrice === null ? [] : [`hasta ${filters.maxPrice} soles`]),
    ...filters.measurements.flatMap(value => value.min === value.max ? [`${value.min}${value.unit}`] : [value.min === null ? "" : `desde ${value.min}${value.unit}`, value.max === null ? "" : `hasta ${value.max}${value.unit}`].filter(Boolean)),
  ].join(" ");
}

export function matchesExplicitModelVersion(query: string, name: string) {
  const tokens = normalizeCommercialText(query.replace(/\bpro\s*\+/gi, "pro plus")).split(" ");
  if (!tokens.some(token => /\d/.test(token))) return true;
  const words = normalizeCommercialText(name.replace(/\bpro\s*\+/gi, "pro plus")).split(" ");
  return ["pro", "max", "plus", "ultra", "lite", "mini"].every(version => tokens.includes(version) === words.includes(version));
}
