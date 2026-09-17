// Product identity is resolved before checking visibility, stock or prices.
// Never relax numeric model/capacity constraints to manufacture a match.
export type ProductIdentity = {
  id: string;
  code: string;
  externalCode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
};

const STOP_WORDS = new Set((
  "a al algo algun alguna buenos buenas busco buscando cuanto cuesta cuestan costo " +
  "dame dias de del deseo el en ese esa este esta hay informacion la las lo los " +
  "mas me necesito para por precio precios producto productos quiero sale stock " +
  "tienen tienes un una unidad unidades comprar compra mayor mayorista hola ola " +
  "quisiera saber unos unas tarde tardes favor porfavor porfa xfa xf porfis pfv " +
  "gracias x y su sus favorcito puedes puede dar darme decir decirme pasas pasar " +
  "pasame cotiza cotizar cotizacion disponible disponibles disponibilidad esta estan " +
  "estoy interesado interesada interesa tienen tendran modelo marca capacidad " +
  "informes info sobre del detalle detalles caracteristicas especificaciones"
).split(" "));

const ALIASES: Record<string, string> = {
  READMI: "REDMI", REDMY: "REDMI", XIOMI: "XIAOMI", XIAOMY: "XIAOMI",
  SAMSUMG: "SAMSUNG", SANSUNG: "SAMSUNG",
  SCUTER: "SCOOTER", SCOTER: "SCOOTER", ESCUTER: "SCOOTER", SCOOTERS: "SCOOTER",
  PARLANTES: "PARLANTE", PARLNTES: "PARLANTE", PARLENTES: "PARLANTE", SPEAKER: "PARLANTE", SPEAKERS: "PARLANTE",
  AUDIFONOS: "AUDIFONO", AUDIFNOS: "AUDIFONO", AUDOFNOS: "AUDIFONO", AURICULARES: "AUDIFONO", EARBUDS: "AUDIFONO", HEADPHONES: "AUDIFONO",
  MICROFONOS: "MICROFONO", MICROFNOS: "MICROFONO", MICROPHONE: "MICROFONO",
  TABLETS: "TABLET", TABLETAS: "TABLET", CELULARES: "CELULAR", TELEFONOS: "CELULAR", SMARTPHONE: "CELULAR",
  CARGADORES: "CARGADOR", CARGDOR: "CARGADOR", CHARGER: "CARGADOR",
  RELOJES: "SMARTWATCH", RELOJ: "SMARTWATCH", LAPTOPS: "LAPTOP", NOTEBOOK: "LAPTOP",
  PANTALLAS: "PANTALLA", MONITORES: "PANTALLA", MONITOR: "PANTALLA",
  CABLES: "CABLE", MOUSES: "MOUSE", MAUSE: "MOUSE", ROUTERS: "ROUTER", RUTER: "ROUTER",
  ELECTRICA: "ELECTRICO", ELECTRICOS: "ELECTRICO", ELECTRICAS: "ELECTRICO",
  NEGRO: "BLACK", NEGRA: "BLACK", AZUL: "BLUE", BLANCO: "WHITE", BLANCA: "WHITE", MORADO: "PURPLE",
};

const VARIANTS = new Set(["PRO", "PLUS", "MAX", "ULTRA", "LITE", "MINI", "FE", "SE"]);

export function normalizeProductIdentity(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/&#(?:x20|32);|&nbsp;/gi, " ")
    .replace(/\b(PRO|[A-Z]+\d+)\s*\+/g, "$1 PLUS ")
    .replace(/(\d)\s*(GB|TB|MB|W|MAH)\b/g, "$1 $2")
    .replace(/\b([A-Z]{2,})(\d)/g, "$1 $2")
    .replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)
    .map((word) => ALIASES[word] ?? word).join(" ");
}

export function productQueryTokens(value: string) {
  const withoutQuantity = value.replace(/\b(?:quiero|comprar|necesito|dame)\s+\d+\s+(?:unidades?|unds?|uds?)\b/gi, " ");
  return [...new Set(normalizeProductIdentity(withoutQuantity).split(" ")
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase())))];
}

export function hasSpecificProductQuery(value: string) {
  return productQueryTokens(value).some((token) => /\d/.test(token) || VARIANTS.has(token));
}

function oneTypo(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  while (left[i] === right[i] && i < Math.min(left.length, right.length)) i++;
  if (left.length === right.length) {
    return left.slice(i + 1) === right.slice(i + 1) ||
      (left[i] === right[i + 1] && left[i + 1] === right[i] && left.slice(i + 2) === right.slice(i + 2));
  }
  return left.length > right.length
    ? left.slice(i + 1) === right.slice(i)
    : left.slice(i) === right.slice(i + 1);
}

export function matchProductIdentities(query: string, products: ProductIdentity[]) {
  const tokens = productQueryTokens(query);
  if (!tokens.length) return { tokens, matches: [] as ProductIdentity[], ambiguousSpelling: false };

  // Codes keep priority, including punctuation used by the ERP.
  const occurrences = products.flatMap(product => [product.code, product.externalCode].filter((code): code is string => Boolean(code))).flatMap(code => {
    const literal = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...query.matchAll(new RegExp(`(?:^|[\\s(),;:!?¿¡])(${literal})(?=$|[\\s(),;:!?¿¡])`, "gi"))].map(match => ({ code, start: match.index! + match[0].length - match[1].length, end: match.index! + match[0].length }));
  });
  const exactCodes = new Set(occurrences.filter(item => !occurrences.some(other => other.start <= item.start && other.end >= item.end && other.end - other.start > item.end - item.start)).map(item => item.code));
  const exact = products.filter((product) => [product.code, product.externalCode]
    .some((code) => code && exactCodes.has(code) && (/[A-Z]/i.test(code) || /\bc[oó]digo\b/i.test(query) || query.trim() === code)));
  if (exact.length) return { tokens, matches: exact, ambiguousSpelling: false };

  const indexed = products.map((product) => ({
    product,
    words: new Set(normalizeProductIdentity(`${product.name} ${product.brand ?? ""} ${product.category ?? ""}`).split(" ")),
    nameWords: new Set(normalizeProductIdentity(product.name).split(" ")),
  }));
  const vocabulary = new Set(indexed.flatMap((item) => [...item.words]));
  const groups = tokens.map((token) => {
    if (vocabulary.has(token) || !/^[A-Z]{5,}$/.test(token) || VARIANTS.has(token)) return [token];
    const singular = token.endsWith("S") ? token.slice(0, -1) : "";
    if (singular && vocabulary.has(singular)) return [singular];
    const near = [...vocabulary].filter((word) => /^[A-Z]{4,}$/.test(word) && !VARIANTS.has(word) &&
      (oneTypo(token, word) || (singular && oneTypo(singular, word))));
    return near.length ? near : [token];
  });
  let candidates = indexed.filter((item) => groups.every((group) => group.some((word) => item.words.has(word))));

  // An explicitly named base model must never silently become a Pro, Max, etc.
  if (tokens.some((token) => /\d/.test(token))) {
    candidates = candidates.filter((item) => [...VARIANTS].every((variant) =>
      tokens.includes(variant) === item.nameWords.has(variant)));
  }
  const ambiguousSpelling = groups.some((group) => group.filter((word) => candidates.some((item) => item.words.has(word))).length > 1);
  const correctedTokens = groups.map((group, index) => {
    const supported = group.filter((word) => candidates.some((item) => item.words.has(word)));
    return supported.length === 1 ? supported[0] : tokens[index];
  });
  return { tokens: correctedTokens, matches: candidates.map((item) => item.product), ambiguousSpelling };
}
