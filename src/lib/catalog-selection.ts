import { resolveProductBrand } from "./product-discovery";
import { inferStoreCategoryName } from "./product-category-classifier";
import { literalProductCodes, matchesCommercialConstraints, matchesExplicitModelVersion, parseCommercialQuery } from "./commercial-query";

export type CatalogCandidate = { code: string; name: string; brand: string | null; category: string | null; categoryRef?: { name: string } | null; unitPrice?: unknown; specifications?: { name: string; value: string }[] };
export function normalizeCatalogText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\bpro\s*\+/g, "pro plus ").replace(/(\d)\s+(gb|tb|mb|w|mah)\b/g, "$1$2")
    .replace(/\b(?:readmi|redmy)\b/g, "redmi").replace(/\b(?:samsumg|sansung)\b/g, "samsung")
    .replace(/\b(?:xiomi|xiaomy)\b/g, "xiaomi").replace(/[^a-z0-9]+/g, " ").trim();
}
export function isCatalogRequest(content: string) {
  return /\bcatalogos?\b/.test(normalizeCatalogText(content));
}
export function isScreenExtenderQuery(content: string) {
  const text = normalizeCatalogText(content);
  return /\bextensor(?:a|as|es|s)?\b/.test(text) && /\b(?:pantallas?|screens?|monitores?)\b/.test(text);
}

const categories = [
  { label: "audífonos", stored: "AURICULARES", aliases: ["audifono", "audifonos", "audofnos", "auricular", "auriculares", "headphones", "headsets"] },
  { label: "parlantes", stored: "PARLANTES", aliases: ["parlante", "parlantes", "altavoz", "altavoces", "speaker", "speakers"] },
  { label: "proyectores", stored: "PROYECTORES", aliases: ["proyector", "proyectores"] },
  { label: "cargadores", stored: "CARGADORES", aliases: ["cargador", "cargadores"] },
  { label: "cámaras", stored: "CAMARA DE SEGURIDAD", aliases: ["camara", "camaras"] },
  { label: "baterías", stored: "BATERIAS", aliases: ["bateria", "baterias"] },
  { label: "relojes inteligentes", stored: "SMART WATCH", aliases: ["smartwatch", "smartwatches"] },
  { label: "relojes", stored: "RELOJ", aliases: ["reloj", "relojes"] },
];
const ignored = new Set(normalizeCatalogText("hola buenas buenos dias tardes noches por favor porfa gracias me nos dan das da dar dame pasa pasan pasas pasame pasar manda mandan mandas mandame envia envian envias enviame enviarme darme pasarme mandarme enviar mostrar muestra muestrame mostrarme quisiera quiero necesito deseo puedes pueden podria podrias tienen tendran catalogo catalogos de del el la los las un una unos unas tus sus su tu ustedes sus todos todas todo productos producto articulos articulo ver y o para con en pdf por mayor al menor unidades unidad mayorista minorista compra comprar completo completa completos completas general disponible disponibles stock precio precios lista listado este esta esos esas" ).split(" "));
function hasPhrase(text: string, phrase: string) { return (` ${text} `).includes(` ${phrase} `); }
for (const word of ["marca", "marcas", "categoria", "categorias", "tipo", "tipos", "porfavor", "codigo", "codigos", "modelo", "modelos", "compartir", "comparteme", "podrian", "podrias"]) ignored.add(word);
// Request wording such as "busco" or "estoy buscando" is not a product constraint.
for (const word of ["busco", "buscamos", "buscar", "buscando", "estoy", "estamos", "ando", "andamos"]) ignored.add(word);
for (const word of ["pero", "tambien", "ademas", "como", "ejemplo"]) ignored.add(word);
for (const word of ["que", "cual", "cuales", "tienes", "tenemos", "venden", "manejan", "ofrecen", "informacion", "info", "sobre", "detalles"]) ignored.add(word);

function canonicalBrand(value: string) {
  return /^(?:super|importaciones super|super importaciones|super importaciones super)$/.test(normalizeCatalogText(value)) ? "SUPER" : value.trim();
}

function catalogProductBrand(product: CatalogCandidate) {
  const value = product.brand?.trim() || product.specifications?.find(spec => normalizeCatalogText(spec.name) === "marca")?.value.trim();
  return value ? canonicalBrand(value) : null;
}
function singular(value: string) { return value.length > 4 && value.endsWith("s") ? value.slice(0, -1) : value; }
function nearWord(a: string, b: string) {
  if (a.length < 6 || b.length < 6 || Math.abs(a.length-b.length)>2) return false;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) { const next=[i]; for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1)); row=next; }
  return row[b.length]<=2;
}

function matchesCategory(product: CatalogCandidate, category: typeof categories[number]) {
  const name=normalizeCatalogText(product.name.replace(/^\([^)]*\)\s*/, ""));
  // A case/cable for headphones or a microphone for a speaker is not the device itself.
  const primaryType = name.match(/\b(?:audifonos?|auriculares?|headphones?|parlantes?|speakers?|proyectores?|fundas?|estuches?|soportes?|cables?|adaptadores?|microfonos?|baterias?|cargador(?:es)?|chargers?|pilas?)\b/)?.[0] || "";
  if (["AURICULARES", "PARLANTES", "PROYECTORES"].includes(category.stored) && /^(?:funda|estuche|soporte|cable|adaptador|microfono|bateria|cargador|charger)/.test(primaryType)) return false;
  if (category.stored === "AURICULARES" && /^(parlante|speaker|proyector)/.test(primaryType)) return false;
  if (category.stored === "PARLANTES" && /^(audifono|auricular|headphone|proyector)/.test(primaryType)) return false;
  if (category.stored === "BATERIAS" && /^(?:funda|estuche|soporte|cable|adaptador|microfono|cargador|charger)/.test(primaryType)
    && !/\b(?:cargador portatil|power ?bank)\b/.test(name)) return false;
  const stored=normalizeCatalogText(product.category || "");
  if(category.stored === "CARGADORES") {
    // A charger can follow an ERP prefix or a brand, but an item WITH/FOR a charger is not a charger.
    const subject = name.split(/\b(?:con|para)\b/)[0];
    return !/^(?:funda|estuche|soporte|cable|adaptador)/.test(primaryType) &&
      (/\b(?:cargador(?:es)?|chargers?)\b/.test(subject) || stored === "cargadores");
  }
  if(category.stored === "PROYECTORES") return /\bproyector(?:es)?\b/.test(name) || stored === "proyectores";
  if(category.stored === "SMART WATCH" || category.stored === "RELOJ") return stored.startsWith("smart watch") || /\bsmart ?watch\b/.test(name);
  const inferred=inferStoreCategoryName(product);
  return stored===normalizeCatalogText(category.stored) || inferred===category.stored;
}

function wordMatches(a: string, b: string) {
  if (a === b || singular(a) === singular(b)) return true;
  if (/^\d+$/.test(a) && b.match(/^(\d+)(?:gb|tb|mb|w|mah)$/)?.[1] === a) return true;
  // Spanish plurals: cargador/cargadores, control/controles, lápiz/lápices.
  const forms = (w: string) => [w, ...(w.endsWith("es") ? [w.slice(0,-2)] : []), ...(w.endsWith("ces") ? [w.slice(0,-3)+"z"] : [])];
  return forms(a).some(x => forms(b).includes(x));
}

const typePrefixes = new Set(["pack", "set", "kit", "combo", "sq", "de", "del", "dos", "tres", "un", "una", "mini", "m", "pla", "pl", "bt", "nuevo", "nueva"]);

/** Build the vocabulary from inventory and ERP references; aliases only supplement that vocabulary. */
export function createCatalogIndex<T extends CatalogCandidate>(products: T[], referenceBrands: string[] = []) {
  const knownBrands = new Map<string,string>();
  for (const value of [...referenceBrands, ...products.flatMap(p => [catalogProductBrand(p), resolveProductBrand(p)])]) {
    const brand = value ? canonicalBrand(value) : "";
    const key = normalizeCatalogText(brand);
    if (key) knownBrands.set(key, brand);
  }
  const brandEntries = [...knownBrands].sort((a,b) => b[0].length-a[0].length);
  const normalizeBrandAliases = (content: string) => knownBrands.has("super")
    ? content.replace(/\b(?:super\s*\/\s*importaciones\s+super|super\s+importaciones|importaciones\s+super)\b/gi, "SUPER")
    : content;
  const categoryNames = new Map<string,string>();
  for (const p of products) for (const value of [p.category, p.categoryRef?.name]) {
    if (value?.trim()) categoryNames.set(normalizeCatalogText(value),value.trim());
  }
  const rows = products.map(product => {
    const name = normalizeCatalogText(product.name.replace(/^\([^)]*\)\s*/, ""));
    const storedBrand = catalogProductBrand(product);
    const explicitBrand = normalizeCatalogText(storedBrand || "");
    const brandKeys = explicitBrand
      ? [explicitBrand]
      : brandEntries.filter(([key]) => hasPhrase(
        key === "super" ? name.replace(/\bsuper\s+(?:carga|bass|fast|charge)\b/g, "") : name,
        key,
      )).map(([key]) => key);
    const descriptiveBrands = new Set(["original", "generico", "generica", "s m", "sin marca"]);
    const namedBrands = brandKeys.filter(key => !descriptiveBrands.has(key));
    namedBrands.sort((a,b) => ` ${name} `.indexOf(` ${a} `) - ` ${name} `.indexOf(` ${b} `) || b.length-a.length);
    const displayKey = namedBrands[0] || brandKeys[0];
    const displayBrand = storedBrand || knownBrands.get(displayKey) || resolveProductBrand(product) || "Otras marcas";
    let typeText = ` ${name} `;
    for (const key of brandKeys) typeText = typeText.replaceAll(` ${key} `, " ");
    const type = typeText.split(/\s+/).find(w => w && !typePrefixes.has(w) && !ignored.has(w) && !/\d/.test(w)) || "";
    // SUPER in another brand's model name (e.g. BASEUS SUPER SI) is not our own brand.
    const searchableBrands = brandKeys.filter(key => key !== "super" || Boolean(explicitBrand) || displayKey === "super");
    return { product, name, brandKeys: searchableBrands, displayBrand, type, code: normalizeCatalogText(product.code), words: normalizeCatalogText(`${product.code} ${product.name} ${product.category || ""} ${product.categoryRef?.name || ""}`).split(" ") };
  });
  const types = [...new Set(rows.map(r => r.type).filter(Boolean))];
  const vocabulary = new Set(rows.flatMap(row => row.words));

  function selectSingle(content: string) {
    const parsed = parseCommercialQuery(content);
    const original = content;
    content = parsed.text;
    const text = normalizeCatalogText(content);
    const queryTerms = text.split(" ").filter(t => !ignored.has(t)).join(" ");
    const exactCodes = rows.filter(r => hasPhrase(text,r.code) && (/\bcodigos?\b/.test(text) || (queryTerms === r.code && !knownBrands.has(r.code) && !/\b(?:marca|categoria)s?\b/.test(text)) || content.includes(`(${r.product.code})`)));
    // An explicit SKU remains searchable even if it is numeric, unbranded or uncategorized.
    const maxCodeLength = Math.max(0,...exactCodes.map(r => r.code.length));
    const normalizedCodeRows = exactCodes.filter(r => r.code.length === maxCodeLength);
    const inventoryCodes = rows.map(r => r.product.code);
    const exactLiteralCodes = literalProductCodes(original, inventoryCodes);
    // A sentence-ending period is punctuation unless it identifies a real dotted SKU.
    // Prefer the literal match so BT454 and BT454. remain different products.
    const literalCodes = new Set(exactLiteralCodes.length ? exactLiteralCodes
      : literalProductCodes(original.replace(/\.(?=\s*$)/, ""), inventoryCodes));
    const literalCodeRows = rows.filter(r => literalCodes.has(r.product.code) && (/[a-z]/i.test(r.product.code) || /\bcodigos?\b/.test(text) || queryTerms === r.code));
    // Never collapse punctuation or suffixes of ERP codes. A normalized collision needs clarification.
    const codeRows = literalCodeRows.length ? literalCodeRows : normalizedCodeRows.length === 1 && !/[.-]/.test(original) ? normalizedCodeRows : [];
    if (codeRows.length) return { products: codeRows.filter(r => matchesCommercialConstraints(r.product, parsed.constraints)).map(r => r.product), scoped: true, label: codeRows.map(r => r.product.code).join(" / "), brands: [] as string[], categories: [] as string[], types: [] as string[], terms: codeRows.map(r => r.product.code) };

    let remainder = ` ${text} `;
    const screenExtenders = isScreenExtenderQuery(text);
    if (screenExtenders) remainder = remainder.replace(/\b(?:extensor(?:a|as|es|s)?|pantallas?|screens?|monitores?|informacion|info|sobre|detalles|fotos?|imagenes?|grandes?)\b/g, " ");
    const strictCategory = /\bcategorias?\b/.test(text);
    const requestedCategories: [string,string][] = [];
    for (const [key,label] of [...categoryNames].sort((a,b) => b[0].length-a[0].length)) {
      const isProductType = !key.includes(" ") && types.some(kind => wordMatches(kind,key));
      if (hasPhrase(remainder,key) && (strictCategory || (!isProductType && !(/\bmarcas?\b/.test(text) && knownBrands.has(key)) && !categories.some(c => c.aliases.includes(key))))) {
        requestedCategories.push([key,label]);
        remainder = remainder.replaceAll(` ${key} `," ");
      }
    }
    const requestedBrands: [string,string][] = [];
    for (const [key,label] of brandEntries) if (hasPhrase(remainder,key)) {
      requestedBrands.push([key,label]);
      remainder = remainder.replaceAll(` ${key} `," ");
    }
    const tokens = remainder.trim().split(/\s+/).filter(t => t && !ignored.has(t));
    // A real inventory type takes precedence over fuzzy spelling corrections (casacas ≠ cámaras).
    const aliasMatches = (t: string, c: typeof categories[number]) => c.aliases.includes(t) ||
      (!types.some(kind => wordMatches(kind,t)) && c.aliases.some(a => nearWord(t,a)));
    // Lists are already separated by splitScopes. Within one scope the first type
    // is the item: "cargador de batería" must not mean chargers OR batteries.
    const firstAlias = requestedCategories.length ? undefined : tokens.flatMap(t => categories.filter(c => aliasMatches(t,c)))[0];
    const aliases = firstAlias ? [firstAlias] : [];
    const remaining = tokens.filter(t => !aliases.some(c => aliasMatches(t,c)));
    const requestedTypes = !screenExtenders && !aliases.length && !remaining.some(t => /\d/.test(t))
      ? remaining.slice(0,1).filter(t => types.some(kind => wordMatches(kind,t))) : [];
    const terms = remaining.filter(t => !requestedTypes.includes(t));
    const scoped = Boolean(screenExtenders || requestedCategories.length || requestedBrands.length || aliases.length || requestedTypes.length || terms.length);
    const selected = rows.filter(r => {
      if (!matchesCommercialConstraints(r.product, parsed.constraints)) return false;
      if (!matchesExplicitModelVersion(content, r.product.name)) return false;
      if (screenExtenders && !isScreenExtenderQuery(r.name)) return false;
      if (requestedCategories.length && !requestedCategories.some(([key]) => [r.product.category,r.product.categoryRef?.name].some(v => normalizeCatalogText(v || "") === key))) return false;
      if (requestedBrands.length && !requestedBrands.some(([key]) => r.brandKeys.includes(key))) return false;
      if (aliases.length && !aliases.some(c => c.aliases.some(a => wordMatches(r.type,a)) || matchesCategory(r.product,c))) return false;
      if (requestedTypes.length && !requestedTypes.some(t => wordMatches(r.type,t))) return false;
      return terms.every(t => r.words.some(w => wordMatches(t,w) || (!vocabulary.has(t) && /^[a-z]{5,}$/.test(t) && /^[a-z]{5,}$/.test(w) && nearWord(t,w))));
    }).sort((a,b) => a.displayBrand.localeCompare(b.displayBrand,"es") || a.product.name.localeCompare(b.product.name,"es"));
    const labels = [...(screenExtenders ? ["extensores de pantalla"] : []),...requestedCategories.map(([,v]) => v),...aliases.map(c => c.label),...requestedTypes];
    const label = [...labels,...requestedBrands.map(([,v]) => v),...terms].join(" ") || "productos";
    return { products: selected.map(r => r.product), scoped, label, brands: requestedBrands.map(([,v]) => v), categories: [...requestedCategories.map(([,v]) => v),...aliases.map(c => c.label)], types: screenExtenders ? ["extensores de pantalla"] : requestedTypes, terms };
  }

  function startsWithScope(content: string) {
    let scope = ` ${normalizeCatalogText(content)} `;
    for (const [brand] of brandEntries) scope = scope.replaceAll(` ${brand} `, " ");
    const words = scope.trim().split(" ").filter(t => t && !ignored.has(t));
    const first = words[0];
    if (!first) return false;
    return types.some(kind => wordMatches(kind, first)) ||
      categories.some(category => category.aliases.includes(first)) ||
      [...categoryNames.keys()].some(key => hasPhrase(words.join(" "), key)) ||
      /^(?:fuentes? (?:poder|alimentacion)|extensores? pantallas?)\b/.test(words.join(" "));
  }

  function splitScopes(content: string) {
    // Keep punctuation until list boundaries are found; don't split compound categories or brands.
    const text = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const protectedRanges: [number, number][] = [];
    for (const key of [...categoryNames.keys(), ...knownBrands.keys()]) {
      if (!/\b(?:y|e|o|u)\b/.test(key)) continue;
      let start = text.indexOf(key);
      while (start !== -1) {
        protectedRanges.push([start, start + key.length]);
        start = text.indexOf(key, start + key.length);
      }
    }
    const parts: string[] = [];
    let start = 0;
    for (const match of text.matchAll(/\s+(?:y|e|o|u)\s+|[,;\n]+/g)) {
      const at = match.index!;
      if (protectedRanges.some(([from, to]) => at >= from && at < to)) continue;
      const before = text.slice(start, at);
      const after = text.slice(at + match[0].length);
      if (!startsWithScope(before) || !startsWithScope(after)) continue;
      parts.push(before);
      start = at + match[0].length;
    }
    parts.push(text.slice(start));
    return parts;
  }

  function select(content: string) {
    content = normalizeBrandAliases(content);
    const parts = splitScopes(content);
    if (parts.length < 2) return { ...selectSingle(content), unmatchedScopes: [] as string[] };

    let selections = parts.map(selectSingle);
    // A single brand qualifies the list; separately branded clauses keep their own filters.
    const branded = selections.filter(selection => selection.brands.length);
    const explicitLastBrand = parts.at(-1)?.match(/\bmarcas?\s+(.+)$/)?.[1];
    const sharedBrand = branded.length === 1 ? branded[0].brands.join(" ")
      : branded.length === 0 ? explicitLastBrand : null;
    if (sharedBrand) selections = selections.map((selection, i) => selection.brands.length
      ? selection : selectSingle(`${parts[i]} marca ${sharedBrand}`));

    const unique = (values: string[]) => [...new Set(values)];
    const matched = selections.filter(selection => selection.products.length);
    const chosenCodes = new Set(matched.flatMap(selection => selection.products.map(p => p.code)));
    const humanLabel = (label: string) => label.replace(/\b(fuentes?) (poder|alimentacion)\b/g, "$1 de $2");
    const selected = rows.filter(row => chosenCodes.has(row.product.code))
      .sort((a, b) => a.displayBrand.localeCompare(b.displayBrand, "es") || a.product.name.localeCompare(b.product.name, "es"));
    return {
      products: selected.map(row => row.product), scoped: true,
      label: unique((matched.length ? matched : selections).map(selection => humanLabel(selection.label))).join(" y "),
      brands: unique(selections.flatMap(selection => selection.brands)),
      categories: unique(selections.flatMap(selection => selection.categories)),
      types: unique(selections.flatMap(selection => selection.types)),
      terms: unique(selections.flatMap(selection => selection.terms)),
      unmatchedScopes: selections.filter(selection => !selection.products.length).map(selection => humanLabel(selection.label)),
    };
  }
  return { select, brands: [...knownBrands.values()], categories: [...categoryNames.values()], types,
    productType: (product: T) => rows.find(r => r.product === product)?.type || "",
    productBrand: (product: T) => rows.find(r => r.product === product)?.displayBrand || "Otras marcas" };
}

export function selectCatalogProducts<T extends CatalogCandidate>(content: string, products: T[], referenceBrands: string[] = []) {
  return createCatalogIndex(products,referenceBrands).select(content);
}
