import { Prisma } from "@prisma/client";
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
for (const word of ["electrico", "electrica", "electricos", "electricas"]) FILLER.delete(word);
const CORRECTIONS: Record<string, string> = {
  maquinade: "maquina", televiores: "televisores", televisore: "televisores", televisorres: "televisores",
  selular: "celular", selulares: "celulares", parlnte: "parlante", parlates: "parlantes",
  repedidor: "repetidor", repetdor: "repetidor", repetidorw: "repetidor", wfi: "wifi",
  audiphono: "audifono", audiphonos: "audifonos", aurikular: "auricular", teklado: "teclado", teklados: "teclados",
  blutut: "bluetooth", bluetoo: "bluetooth", smar: "smart", wach: "watch", cavle: "cable",
};

export function normalizeProductQuery(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/range extender/g, "extensor").replace(/wi[ -]fi/g, "wifi").replace(/[^a-z0-9]+/g, " ").trim();
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
const ACCESSORIES = "funda|fundas|protector|protectores|soporte|soportes|control|controles|cargador|cargadores|cable|cables|adaptador|adaptadores";
function needsMainDevice(terms: string[]) {
  return terms.some(term => ["televisor", "celular", "iphone"].some(family => productTermAlternatives(family).includes(term))) &&
    !terms.some(term => new RegExp(`^(${ACCESSORIES})$`).test(term));
}

export function matchesProductQuery(product: { name: string; code?: string; externalCode?: string | null; brand?: string | null; category?: string | null }, query: string) {
  const terms = productQueryTerms(query);
  const text = normalizeProductQuery([product.name, product.code, product.externalCode, product.brand, product.category].filter(Boolean).join(" "));
  if (needsMainDevice(terms) && new RegExp(`(^| )(${ACCESSORIES})( |$)`).test(normalizeProductQuery(product.name))) return false;
  if (needsMainDevice(terms)) {
    const device = terms.find(term => ["televisor", "celular", "iphone"].some(family => productTermAlternatives(family).includes(term)))!;
    if (!new RegExp(termPattern(device)).test(normalizeProductQuery(product.name))) return false;
  }
  return terms.length > 0 && terms.every(term => new RegExp(termPattern(term)).test(text));
}

/** One retrieval policy for product answers and PDFs. AND between constraints,
 * OR only between genuine synonyms. Fold accents without requiring extensions.
 * Description is not identity: mentioning a TV does not make a remote a TV. */
export async function findCatalogProductIds(query: string, limit = 80) {
  const terms = productQueryTerms(query);
  if (!terms.length || terms.length > 24) return [];
  const identity = Prisma.sql`translate(lower(concat_ws(' ', "name", "code", "externalCode", "brand", "category")), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`;
  const conditions = terms.map(term => Prisma.sql`${identity} ~ ${termPattern(term)}`);
  if (needsMainDevice(terms)) conditions.push(Prisma.sql`NOT (translate(lower("name"), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ~ ${`(^|[^a-z0-9])(${ACCESSORIES})($|[^a-z0-9])`})`);
  if (needsMainDevice(terms)) {
    const device = terms.find(term => ["televisor", "celular", "iphone"].some(family => productTermAlternatives(family).includes(term)))!;
    conditions.push(Prisma.sql`translate(lower("name"), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') ~ ${termPattern(device)}`);
  }
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "Product" WHERE "isVisible" = true AND "stockUnits" > 0 AND "unitPrice" > 0
      AND ${Prisma.join(conditions, " AND ")}
    ORDER BY "isFeatured" DESC, "name" ASC, id ASC LIMIT ${Math.max(1, Math.min(200, limit))}`);
  return rows.map(row => row.id);
}
