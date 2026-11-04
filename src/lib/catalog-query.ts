import { prisma } from "./prisma";

const FILLER = new Set(`a al algo alguna alguno algun busco busca buscando como con cual cuanto cuesta cuestan de del el en es esta estan este esto hay habra habran la las los me mi para por precio precios producto productos opcion opciones q que quiero quisiera deseo necesito saber consultar consulta informacion sobre un una unos unas ver tiene tienen tienes tendra tendran favor porfavor xfavor hola ola buenos buenas buen dia dias tardes noches muy gracias saludo saludos puede puedes pueden podria podrias podria dar darme brindar brindarme enviar enviarme mandame mandar pasame pasar mostrar mostrarme muestrame su sus tu ustedes catalogo catalogos catalog catalogo completo general virtual tienda web online pagina link enlace donde acceder entrar stock disponible disponibles disponibilidad costo vale vale cuanto estan ustedes estimado estimada amigo amiga porfa porfis electrico electrica electricos electricas`.split(/\s+/));
const GROUPS = [
  ["televisor", "televisores", "television", "televisiones", "tv", "tvs"],
  ["celular", "celulares", "telefono", "telefonos", "smartphone", "smartphones"],
  ["tablet", "tablets"],
  ["parlante", "parlantes", "altavoz", "altavoces", "speaker", "speakers"],
  ["audifono", "audifonos", "auricular", "auriculares", "headset"],
  ["teclado", "teclados", "keyboard"], ["mouse", "mause", "raton"],
  ["repetidor", "repetidores", "extensor", "extensores", "extender"],
  ["pantalla", "pantallas", "monitor", "monitores"],
  ["proyector", "proyectores"], ["scooter", "scoter", "scuter", "patineta"],
  ["alexa", "alexas", "echo"], ["maquina", "maquinas"],
];
for (const word of ["y", "si", "estoy", "recomiendas", "recomienda", "recomendame", "presupuesto", "soles", "sol", "veo", "mandas", "unidad", "unidades"]) FILLER.add(word);
for (const word of ["comprar", "compra", "cotizar", "cotizacion"]) FILLER.add(word);
for (const word of ["todavia", "aun", "venta", "venden", "vende", "vender", "siguen", "sigue", "actualmente"]) FILLER.add(word);
for (const word of ["electrico", "electrica", "electricos", "electricas"]) FILLER.delete(word);
const CORRECTIONS: Record<string, string> = {
  maquinade: "maquina", televiores: "televisores", televisore: "televisores", televisorres: "televisores",
  selular: "celular", selulares: "celulares", parlnte: "parlante", parlates: "parlantes",
  repedidor: "repetidor", repetdor: "repetidor", repetidorw: "repetidor", wfi: "wifi",
  audiphono: "audifono", audiphonos: "audifonos", aurikular: "auricular", teklado: "teclado", teklados: "teclados",
  blutut: "bluetooth", bluetoo: "bluetooth", smar: "smart", wach: "watch", cavle: "cable",
};

const MEASUREMENT_UNITS = ["pulgadas", "gb", "tb", "mb", "mah", "hz", "mm", "cm", "kg"] as const;
type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];
const MEASUREMENT_UNIT_SET = new Set<string>(MEASUREMENT_UNITS);

export function normalizeProductQuery(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:["″]|pulg(?:adas?)?\b|inch(?:es)?\b)/g, "$1 pulgadas ")
    .replace(/(\d+(?:[.,]\d+)?)\s*(gb|tb|mb|mah|hz|mm|cm|kg)\b/g, "$1 $2")
    .replace(/range extender/g, "extensor").replace(/wi[ -]fi/g, "wifi").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Keep model numbers and every meaningful constraint; never turn unknown
 * product words into a best-effort unrelated recommendation. */
export function productQueryTerms(value: string) {
  return [...new Set(normalizeProductQuery(value).split(/\s+/).map(word => CORRECTIONS[word] ?? word)
    .filter(word => word && !FILLER.has(word) && (word.length > 1 || /^\d$/.test(word))))];
}

export function productTermAlternatives(term: string) {
  const group = GROUPS.find(values => values.includes(term));
  if (group) return group[0] === "celular" ? [...group, "iphone"] : group;
  return term.endsWith("s") && term.length > 4 ? [term, term.slice(0, -1)] : [term];
}

function termPattern(term: string) {
  return `(^|[^a-z0-9])(${productTermAlternatives(term).join("|")})($|[^a-z0-9])`;
}
const ACCESSORIES = "funda|fundas|protector|protectores|soporte|soportes|control|controles|cargador|cargadores|cable|cables|adaptador|adaptadores|box|stick|cooler|holder|aro|microfono|tripode|audifono|audifonos|auricular|auriculares|dado";
function needsMainDevice(terms: string[]) {
  return terms.some(term => ["televisor", "celular", "tablet", "iphone"].some(family => productTermAlternatives(family).includes(term))) &&
    !terms.some(term => new RegExp(`^(${ACCESSORIES})$`).test(term));
}

// A category is useful context, but cannot turn a stand or walkie-talkie
// into a speaker. Explicit accessory searches remain available.
function speakerIdentityTerm(terms: string[]) {
  if (terms.some(term => /^(tripode|tripodes|soporte|soportes|funda|fundas|cable|cables)$/.test(term))) return undefined;
  return terms.find(term => productTermAlternatives("parlante").includes(term));
}
const SPEAKER_ACCESSORIES = "tripode|tripodes|soporte|soportes|funda|fundas|cable|cables";

export function matchesProductQuery(product: { name: string; code?: string; externalCode?: string | null; brand?: string | null; category?: string | null; technicalSpecs?: string | null }, query: string) {
  const terms = productQueryTerms(query);
  const text = normalizeProductQuery([product.name, product.code, product.externalCode, product.brand, product.category, product.technicalSpecs].filter(Boolean).join(" "));
  // Dimensions/capacities are paired constraints: 32 GB is not a 32-inch screen.
  const measurements = normalizeProductQuery(query).matchAll(/\b(\d+(?: \d+)?) (pulgadas|gb|tb|mb|mah|hz|mm|cm|kg)\b/g);
  for (const measurement of measurements) {
    if (!new RegExp(`\\b${measurement[1]} ${measurement[2]}\\b`).test(text)) return false;
  }
  const speaker = speakerIdentityTerm(terms);
  if (speaker) {
    const name = normalizeProductQuery(product.name).split(" para ")[0];
    if (!new RegExp(termPattern(speaker)).test(name) || new RegExp(`(^| )(${SPEAKER_ACCESSORIES})( |$)`).test(name)) return false;
  }
  if (needsMainDevice(terms) && new RegExp(`(^| )(${ACCESSORIES})( |$)`).test(normalizeProductQuery(product.name))) return false;
  if (needsMainDevice(terms)) {
    if (/accesorio/.test(normalizeProductQuery(product.category ?? ""))) return false;
    const device = terms.find(term => ["televisor", "celular", "tablet", "iphone"].some(family => productTermAlternatives(family).includes(term)))!;
    if (!new RegExp(termPattern(device)).test(normalizeProductQuery(product.name).split(" para ")[0])) return false;
  }
  return terms.length > 0 && terms.every(term => new RegExp(termPattern(term)).test(text));
}

export type CatalogIdentity = {
  id: string; name: string; code: string; externalCode: string | null;
  brand: string | null; category: string | null; technicalSpecs?: string | null;
  isVisible: boolean; stockUnits: number; unitPrice: unknown;
};

export type CatalogSearchInference =
  | { kind: "none" }
  | { kind: "resolved"; query: string; interpretation: string }
  | {
    kind: "clarification";
    interpretations: string[];
    candidates: Array<{ code: string; name: string }>;
    crossFamily: boolean;
  };

type CatalogMeasurement = {
  value: string;
  unit: MeasurementUnit;
};

const DEVICE_FAMILIES = [
  { key: "televisor", label: "televisor", terms: ["televisor", "televisores", "television", "televisiones", "tv", "tvs"] },
  { key: "monitor", label: "monitor", terms: ["monitor", "monitores"] },
  { key: "pantalla", label: "pantalla", terms: ["pantalla", "pantallas"] },
  { key: "proyector", label: "proyector", terms: ["proyector", "proyectores"] },
  { key: "tablet", label: "tablet", terms: ["tablet", "tablets"] },
  { key: "celular", label: "celular", terms: ["celular", "celulares", "telefono", "telefonos", "smartphone", "smartphones", "iphone"] },
] as const;

const DISPLAY_FAMILY_KEYS = new Set(["televisor", "monitor", "pantalla", "proyector"]);
const CROSS_FAMILY_INFERENCE_SOURCES = new Set(["tablet", "televisor", "monitor", "pantalla", "proyector"]);

function isAvailableCatalogIdentity(row: CatalogIdentity) {
  return row.isVisible && row.stockUnits > 0 && Number(row.unitPrice) > 0;
}

function normalizeMeasurementValue(value: string) {
  return value.replace(/\s+/g, ".");
}

function measurementLabel(value: string, unit: MeasurementUnit) {
  const formattedValue = normalizeMeasurementValue(value);
  const formattedUnit = unit === "pulgadas"
    ? "pulgadas"
    : unit === "mah"
      ? "mAh"
      : unit === "hz"
        ? "Hz"
        : unit.toUpperCase();
  return `${formattedValue} ${formattedUnit}`;
}

function getCatalogMeasurements(row: CatalogIdentity) {
  const text = normalizeProductQuery(`${row.name} ${row.technicalSpecs ?? ""}`);
  const measurements: CatalogMeasurement[] = [];

  for (const match of text.matchAll(/\b(\d+(?: \d+)?) (pulgadas|gb|tb|mb|mah|hz|mm|cm|kg)\b/g)) {
    const unit = match[2] as MeasurementUnit;
    if (MEASUREMENT_UNIT_SET.has(unit)) {
      measurements.push({ value: match[1], unit });
    }
  }

  return measurements;
}

function getBareNumericTerms(query: string) {
  const tokens = normalizeProductQuery(query).split(/\s+/).filter(Boolean);
  const bare = tokens.filter((token, index) => {
    if (!/^\d+(?: \d+)?$/.test(token)) return false;
    return !MEASUREMENT_UNIT_SET.has(tokens[index + 1] ?? "");
  });
  return [...new Set(bare)];
}

function getDeviceFamily(value: string) {
  const terms = new Set(productQueryTerms(value));
  return DEVICE_FAMILIES.find((family) => family.terms.some((term) => terms.has(term))) ?? null;
}

function appendMeasurementUnit(query: string, value: string, unit: MeasurementUnit) {
  const tokens = normalizeProductQuery(query).split(/\s+/).filter(Boolean);
  let applied = false;

  return tokens.map((token, index) => {
    if (!applied && token === value && !MEASUREMENT_UNIT_SET.has(tokens[index + 1] ?? "")) {
      applied = true;
      return `${token} ${unit}`;
    }
    return token;
  }).join(" ");
}

function uniqueCandidates(rows: CatalogIdentity[]) {
  const candidates = new Map<string, { code: string; name: string }>();
  for (const row of rows) {
    candidates.set(row.id, { code: row.code, name: row.name });
  }
  return Array.from(candidates.values()).slice(0, 4);
}

/** A standalone number is never treated as a price, code, or specification by
 * default. It is eligible for catalog-backed interpretation only when the
 * customer included one product word and omitted every unit/quantity marker. */
export function hasInferableCatalogNumber(query: string) {
  if (/(?:^|\s)(?:s\/|s\.\/|pen)\s*\d|\b\d+(?:[.,]\d+)?\s*(?:soles?|s\/|s\.\/|pen)\b/i.test(query)) {
    return false;
  }
  const normalized = normalizeProductQuery(query);
  if (/\b(?:codigo|cod|modelo|model|sol|soles|pen|unidad|unidades|und|unds|pieza|piezas)\b/.test(normalized)) {
    return false;
  }
  const terms = productQueryTerms(query);
  return getBareNumericTerms(query).length === 1 && terms.some((term) => /[a-z]/.test(term));
}

/**
 * Turns an omitted unit into an explicit catalog query only if the live,
 * saleable catalog supports exactly one interpretation. When the wording
 * appears to point to a different display device, it returns a confirmation
 * proposal rather than silently changing the requested product family.
 */
export function inferCatalogSearchIntent(query: string, rows: CatalogIdentity[]): CatalogSearchInference {
  if (!hasInferableCatalogNumber(query)) return { kind: "none" };

  const resolvedQuery = resolveCatalogQuery(query, rows);
  const [bareNumber] = getBareNumericTerms(resolvedQuery);
  if (!bareNumber) return { kind: "none" };

  const availableRows = rows.filter(isAvailableCatalogIdentity);
  const directRows = availableRows.filter((row) => matchesProductQuery(row, resolvedQuery));
  const directMeasurements = new Map<string, { unit: MeasurementUnit; rows: CatalogIdentity[] }>();

  for (const row of directRows) {
    for (const measurement of getCatalogMeasurements(row)) {
      if (measurement.value !== bareNumber) continue;
      const key = `${measurement.value}:${measurement.unit}`;
      const current = directMeasurements.get(key) ?? { unit: measurement.unit, rows: [] };
      current.rows.push(row);
      directMeasurements.set(key, current);
    }
  }

  if (directMeasurements.size === 1) {
    const [{ unit }] = directMeasurements.values();
    return {
      kind: "resolved",
      query: appendMeasurementUnit(resolvedQuery, bareNumber, unit),
      interpretation: measurementLabel(bareNumber, unit),
    };
  }

  if (directMeasurements.size > 1) {
    const entries = Array.from(directMeasurements.entries());
    return {
      kind: "clarification",
      interpretations: entries.map(([, value]) => measurementLabel(bareNumber, value.unit)),
      candidates: uniqueCandidates(entries.flatMap(([, value]) => value.rows)),
      crossFamily: false,
    };
  }

  // If the named family has no saleable interpretation, look only for display
  // products with the same explicit diagonal. This can surface a likely typo
  // such as "tablet de 32" -> "televisor de 32 pulgadas", but it stays a
  // confirmation rather than an automatic commercial answer.
  const requestedFamily = getDeviceFamily(resolvedQuery);
  if (!requestedFamily || !CROSS_FAMILY_INFERENCE_SOURCES.has(requestedFamily.key)) return { kind: "none" };

  const displayMatches = availableRows.flatMap((row) => {
    const measurement = getCatalogMeasurements(row).find((item) =>
      item.value === bareNumber && item.unit === "pulgadas",
    );
    const family = getDeviceFamily(`${row.name} ${row.category ?? ""}`);
    return measurement && family && DISPLAY_FAMILY_KEYS.has(family.key)
      ? [{ row, family }]
      : [];
  });

  if (!displayMatches.length) return { kind: "none" };

  const byFamily = new Map<string, { label: string; rows: CatalogIdentity[] }>();
  for (const match of displayMatches) {
    const current = byFamily.get(match.family.key) ?? { label: match.family.label, rows: [] };
    current.rows.push(match.row);
    byFamily.set(match.family.key, current);
  }

  const entries = Array.from(byFamily.values());
  return {
    kind: "clarification",
    interpretations: entries.map((entry) => `${entry.label} de ${measurementLabel(bareNumber, "pulgadas")}`),
    candidates: uniqueCandidates(entries.flatMap((entry) => entry.rows)),
    crossFamily: true,
  };
}

/** One edit (including adjacent transposition), never an unrestricted fuzzy match. */
export function oneSpellingEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Vocabulary comes from the entire catalog, not a growing list of individual
 * product exceptions. Unknown/ambiguous words remain constraints. Codes, brands
 * and all numeric tokens are never approximately corrected. */
export function resolveCatalogQuery(query: string, rows: CatalogIdentity[]) {
  const vocabulary = new Set(rows.flatMap(row => productQueryTerms(`${row.name} ${row.category ?? ""}`)));
  const protectedWords = new Set(rows.flatMap(row => normalizeProductQuery(`${row.code} ${row.externalCode ?? ""} ${row.brand ?? ""}`).split(/\s+/)));
  return productQueryTerms(query).map(term => {
    if (term.length < 5 || /\d/.test(term) || protectedWords.has(term) || productTermAlternatives(term).some(word => vocabulary.has(word))) return term;
    const candidates = [...vocabulary].filter(word => /^[a-z]+$/.test(word) && !protectedWords.has(word) && oneSpellingEdit(term, word));
    return candidates.length === 1 ? candidates[0] : term;
  }).join(" ");
}

const CATALOG_IDENTITY_SELECT = {
  id: true,
  name: true,
  code: true,
  externalCode: true,
  brand: true,
  category: true,
  technicalSpecs: true,
  isVisible: true,
  stockUnits: true,
  unitPrice: true,
} as const;

async function loadCatalogIdentities() {
  return prisma.product.findMany({
    select: CATALOG_IDENTITY_SELECT,
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }, { id: "asc" }],
  });
}

/** Loads the current catalog only for a query that contains a number whose
 * unit is missing. All conclusions remain grounded in visible, saleable rows. */
export async function inferCatalogSearchIntentFromDatabase(query: string) {
  if (!hasInferableCatalogNumber(query)) return { kind: "none" } as const;
  return inferCatalogSearchIntent(query, await loadCatalogIdentities());
}

/** Resolve identity before checking sale eligibility. Prices/stock are read
 * afresh, never cached in an approximate-search index or supplied by a model. */
export async function searchCatalogIdentity(query: string, limit = 80) {
  const terms = productQueryTerms(query);
  if (!terms.length || terms.length > 24) return { query, ids: [], unavailableIds: [] };
  const rows = await loadCatalogIdentities();
  const resolved = resolveCatalogQuery(query, rows);
  const matching = rows.filter(row => matchesProductQuery(row, resolved));
  const available = (row: CatalogIdentity) => row.isVisible && row.stockUnits > 0 && Number(row.unitPrice) > 0;
  const take = Math.max(1, Math.min(200, limit));
  return {
    query: resolved,
    ids: matching.filter(available).slice(0, take).map(row => row.id),
    unavailableIds: matching.filter(row => !available(row)).slice(0, take).map(row => row.id),
  };
}

export async function findCatalogProductIds(query: string, limit = 80) {
  return (await searchCatalogIdentity(query, limit)).ids;
}
