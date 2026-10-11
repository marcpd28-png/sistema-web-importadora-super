import { STOREFRONT_CATEGORIES, normalizeCatalogText } from "./storefront-taxonomy";

export type CatalogScope =
  | { kind: "general"; key: "general"; title: string }
  | { kind: "category"; key: string; category: string; title: string }
  | { kind: "category-brand"; key: string; category: string; brand: string; title: string }
  | { kind: "ambiguous"; reason: "category_ambiguous" | "category_unknown" | "brand_ambiguous" | "brand_without_category" };

type CategoryDefinition = { slug: string; label: string; aliases: string[] };

const CATEGORY_ALIASES: Record<string, readonly string[]> = {
  audifonos: ["audifono", "audifonos", "auricular", "auriculares", "headphone", "headset"],
  parlantes: ["parlante", "parlantes", "speaker", "speakers", "altavoz", "altavoces"],
  televisores: ["televisor", "televisores", "television", "televisiones", "tv", "tvs"],
  drones: ["dron", "drones", "drone", "drones"],
  "power-banks": ["powerbank", "powerbanks", "power bank", "power banks", "bateria portatil", "baterias portatiles"],
  proyectores: ["proyector", "proyectores", "projector", "projectors"],
  celulares: ["celular", "celulares", "telefono", "telefonos", "smartphone", "smartphones"],
};

const CATALOG_WORDS = ["catalogo", "catalogos", "catalog", "catalogue", "catalgo", "catalgoo", "cataglafo"];
const FILLER = new Set([
  "a", "al", "con", "de", "del", "el", "en", "es", "la", "las", "lo", "los", "para", "por", "su", "un", "una",
  "hola", "ola", "buen", "buena", "buenos", "buenas", "dia", "dias", "tarde", "tardes", "noche", "noches",
  "quiero", "quisiera", "necesito", "me", "puede", "podria", "podrias", "podrian", "mandar", "mandame", "enviar", "enviame",
  "pasar", "pasame", "mostrar", "muestrame", "ver", "verme", "tienen", "tiene", "hay", "favor", "porfavor", "porfa", "porfis",
  "productos", "producto", "pdf", "virtual", "online", "actualizado", "actualizados", "escoger", "elegir",
]);
const GENERAL_WORDS = new Set(["general", "completo", "completa", "todos", "todas", "todo", "toda", "entero", "entera"]);

function words(value: string) {
  return normalizeCatalogText(value).replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(text: string, phrase: string) {
  return new RegExp(`(^| )${escaped(phrase).replace(/\\ /g, "\\s+")}(?= |$)`).test(text);
}

function isOneEdit(from: string, to: string) {
  if (from === to) return true;
  if (Math.abs(from.length - to.length) > 1 || from.length < 4 || to.length < 4) return false;
  let index = 0;
  while (index < Math.min(from.length, to.length) && from[index] === to[index]) index++;
  if (from.length === to.length) return from.slice(index + 1) === to.slice(index + 1) ||
    (from[index] === to[index + 1] && from[index + 1] === to[index] && from.slice(index + 2) === to.slice(index + 2));
  return from.length > to.length ? from.slice(index + 1) === to.slice(index) : from.slice(index) === to.slice(index + 1);
}

function definitions(): CategoryDefinition[] {
  return STOREFRONT_CATEGORIES.map(([slug, label]) => {
    const generated = [slug.replace(/-/g, " "), normalizeCatalogText(label)];
    return { slug, label, aliases: [...new Set([...(CATEGORY_ALIASES[slug] ?? []), ...generated])] };
  });
}

function requestedCategories(scope: string): CategoryDefinition[] {
  const text = ` ${scope} `;
  const matches = definitions().filter(definition => definition.aliases.some(alias => hasPhrase(text, alias)));
  if (matches.length) return matches;

  // One typo is tolerated only when exactly one canonical single-word alias
  // matches. This avoids guessing a commercially different category.
  const typos = words(scope).flatMap(word => definitions().filter(definition =>
    definition.aliases.some(alias => !alias.includes(" ") && isOneEdit(word, alias)),
  ));
  return [...new Map(typos.map(definition => [definition.slug, definition])).values()];
}

function catalogWordIndex(tokens: string[]) {
  return tokens.findIndex(token => CATALOG_WORDS.includes(token) || (token.length >= 6 && isOneEdit(token, "catalogo")));
}

export function catalogRequestText(content: string) {
  const tokens = words(content);
  const index = catalogWordIndex(tokens);
  if (index < 0) return null;
  return tokens.filter((_, tokenIndex) => tokenIndex !== index).join(" ");
}

export function isCatalogRequest(content: string) {
  return catalogRequestText(content) !== null;
}

/** Resolve only a scope that can be served without guessing. Product selection
 * deliberately happens later from an immutable ERP/storefront snapshot. */
export function resolveCatalogScope(content: string, brands: readonly string[] = []): CatalogScope | null {
  const raw = catalogRequestText(content);
  if (raw === null) return null;
  const scope = raw.replace(/\s+/g, " ").trim();
  const significant = words(scope).filter(word => !FILLER.has(word) && !GENERAL_WORDS.has(word));
  const categoryMatches = requestedCategories(scope);

  const normalizedBrands = brands
    .map(brand => ({ original: brand.trim(), normalized: normalizeCatalogText(brand).replace(/[^a-z0-9]+/g, " ").trim() }))
    .filter((brand, index, values) => Boolean(brand.original) && values.findIndex(other => other.normalized === brand.normalized) === index);
  const brandMatches = normalizedBrands.filter(brand => hasPhrase(` ${scope} `, brand.normalized));

  if (!significant.length) return { kind: "general", key: "general", title: "CATÁLOGO GENERAL" };
  if (categoryMatches.length > 1) return { kind: "ambiguous", reason: "category_ambiguous" };
  if (brandMatches.length > 1) return { kind: "ambiguous", reason: "brand_ambiguous" };
  if (!categoryMatches.length) {
    if (brandMatches.length) return { kind: "ambiguous", reason: "brand_without_category" };
    return { kind: "ambiguous", reason: "category_unknown" };
  }

  const category = categoryMatches[0];
  const categoryWords = new Set(category.aliases.flatMap(words));
  const residual = significant.filter(word => !categoryWords.has(word) && ![...categoryWords].some(alias => isOneEdit(word, alias)));
  if (!brandMatches.length && !residual.length) return { kind: "category", key: category.slug, category: category.slug, title: `CATÁLOGO DE ${category.label.toUpperCase()}` };
  const brand = brandMatches[0]?.original ?? residual.join(" ");
  return {
    kind: "category-brand",
    key: `${category.slug}:${normalizeCatalogText(brand)}`,
    category: category.slug,
    brand,
    title: `CATÁLOGO DE ${category.label.toUpperCase()} ${brand.toUpperCase()}`,
  };
}

export function catalogAmbiguityMessage(scope: Extract<CatalogScope, { kind: "ambiguous" }>) {
  if (scope.reason === "brand_without_category") return "¿De qué categoría deseas el catálogo de esa marca? Por ejemplo: parlantes JBL o audífonos Sony.";
  if (scope.reason === "category_ambiguous") return "Encontré más de una categoría. Indícame una sola, por ejemplo: televisores, drones o power banks.";
  if (scope.reason === "brand_ambiguous") return "Encontré más de una marca. Indícame una sola marca junto con la categoría.";
  return "No identifiqué la categoría del catálogo. Indícame una, por ejemplo: drones, televisores, parlantes o power banks.";
}
