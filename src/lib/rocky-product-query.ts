import { prisma } from "./prisma";

const FILLER = new Set(`a al algo alguna alguno algun busco busca buscando como con cual cuanto cuesta cuestan de del el en es esta estan este esto hay habra habran la las los me mi para por precio precios producto productos opcion opciones q que quiero quisiera deseo necesito saber consultar consulta informacion sobre un una unos unas ver tiene tienen tienes tendra tendran favor porfavor xfavor hola ola buenos buenas buen dia dias tardes noches muy gracias saludo saludos puede puedes pueden podria podrias podria dar darme brindar brindarme enviar enviarme mandame mandar pasame pasar mostrar mostrarme muestrame su sus tu ustedes catalogo catalogos catalog catalogo completo general virtual tienda web online pagina link enlace donde acceder entrar stock disponible disponibles disponibilidad costo vale vale cuanto estan ustedes estimado estimada amigo amiga porfa porfis electrico electrica electricos electricas`.split(/\s+/));
const GROUPS = [
  ["televisor", "televisores", "television", "televisiones", "tv", "tvs"],
  ["celular", "celulares", "telefono", "telefonos", "smartphone", "smartphones"],
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

export function normalizeProductQuery(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:["″]|pulgadas?\b|inches\b)/g, "$1 pulgadas ")
    .replace(/(\d)\s*(gb|tb|mb|mah|hz|mm|cm|kg)\b/g, "$1 $2")
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
  return terms.some(term => ["televisor", "celular", "iphone"].some(family => productTermAlternatives(family).includes(term))) &&
    !terms.some(term => new RegExp(`^(${ACCESSORIES})$`).test(term));
}

// A category is useful context, but cannot turn a stand or walkie-talkie
// into a speaker. Explicit accessory searches remain available.
function speakerIdentityTerm(terms: string[]) {
  if (terms.some(term => /^(tripode|tripodes|soporte|soportes|funda|fundas|cable|cables)$/.test(term))) return undefined;
  return terms.find(term => productTermAlternatives("parlante").includes(term));
}
const SPEAKER_ACCESSORIES = "tripode|tripodes|soporte|soportes|funda|fundas|cable|cables";

export function matchesProductQuery(product: { name: string; code?: string; externalCode?: string | null; brand?: string | null; category?: string | null }, query: string) {
  const terms = productQueryTerms(query);
  const text = normalizeProductQuery([product.name, product.code, product.externalCode, product.brand, product.category].filter(Boolean).join(" "));
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
    const device = terms.find(term => ["televisor", "celular", "iphone"].some(family => productTermAlternatives(family).includes(term)))!;
    if (!new RegExp(termPattern(device)).test(normalizeProductQuery(product.name).split(" para ")[0])) return false;
  }
  return terms.length > 0 && terms.every(term => new RegExp(termPattern(term)).test(text));
}

type CatalogIdentity = {
  id: string; name: string; code: string; externalCode: string | null;
  brand: string | null; category: string | null;
  isVisible: boolean; stockUnits: number; unitPrice: unknown;
};

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

/** Resolve identity before checking sale eligibility. Prices/stock are read
 * afresh, never cached in an approximate-search index or supplied by a model. */
export async function searchCatalogIdentity(query: string, limit = 80) {
  const terms = productQueryTerms(query);
  if (!terms.length || terms.length > 24) return { query, ids: [], unavailableIds: [] };
  const rows = await prisma.product.findMany({
    select: { id: true, name: true, code: true, externalCode: true, brand: true, category: true, isVisible: true, stockUnits: true, unitPrice: true },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }, { id: "asc" }],
  });
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
