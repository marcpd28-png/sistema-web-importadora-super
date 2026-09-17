import { resolveProductBrand } from "./product-discovery";
import { inferStoreCategoryName } from "./product-category-classifier";

export type CatalogCandidate = { code: string; name: string; brand: string | null; category: string | null; categoryRef?: { name: string } | null };
export function normalizeCatalogText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function isCatalogRequest(content: string) {
  return /\bcatalogos?\b/.test(normalizeCatalogText(content));
}

const categories = [
  { label: "audífonos", stored: "AURICULARES", aliases: ["audifono", "audifonos", "audofnos", "auricular", "auriculares", "headphones", "headsets"] },
  { label: "parlantes", stored: "PARLANTES", aliases: ["parlante", "parlantes", "altavoz", "altavoces", "speaker", "speakers"] },
  { label: "proyectores", stored: "PROYECTORES", aliases: ["proyector", "proyectores"] },
  { label: "cámaras", stored: "CAMARA DE SEGURIDAD", aliases: ["camara", "camaras"] },
  { label: "baterías", stored: "BATERIAS", aliases: ["bateria", "baterias"] },
  { label: "relojes inteligentes", stored: "SMART WATCH", aliases: ["smartwatch", "smartwatches"] },
  { label: "relojes", stored: "RELOJ", aliases: ["reloj", "relojes"] },
];
const ignored = new Set(normalizeCatalogText("hola buenas buenos dias tardes noches por favor porfa gracias me nos dan das da dar dame pasa pasan pasas pasame pasar manda mandan mandas mandame envia envian envias enviame enviarme darme pasarme mandarme enviar mostrar muestra muestrame mostrarme quisiera quiero necesito deseo puedes pueden podria podrias tienen tendran catalogo catalogos de del el la los las un una unos unas tus sus su tu ustedes sus todos todas todo productos producto articulos articulo ver y o para con en pdf por mayor al menor unidades unidad mayorista minorista compra comprar completo completa completos completas general disponible disponibles stock precio precios lista listado este esta esos esas" ).split(" "));
function hasPhrase(text: string, phrase: string) { return (` ${text} `).includes(` ${phrase} `); }
for (const word of ["marca", "marcas", "categoria", "categorias", "tipo", "tipos", "porfavor", "codigo", "codigos", "modelo", "modelos", "compartir", "comparteme", "podrian", "podrias"]) ignored.add(word);
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
  const primaryType = name.match(/\b(?:audifonos?|auriculares?|headphones?|parlantes?|speakers?|proyectores?|fundas?|estuches?|soportes?|cables?|adaptadores?|microfonos?|baterias?)\b/)?.[0] || "";
  if (["AURICULARES", "PARLANTES", "PROYECTORES"].includes(category.stored) && /^(?:funda|estuche|soporte|cable|adaptador|microfono|bateria)/.test(primaryType)) return false;
  if (category.stored === "AURICULARES" && /^(parlante|speaker|proyector)/.test(primaryType)) return false;
  if (category.stored === "PARLANTES" && /^(audifono|auricular|headphone|proyector)/.test(primaryType)) return false;
  const stored=normalizeCatalogText(product.category || "");
  if(category.stored === "PROYECTORES") return /\bproyector(?:es)?\b/.test(name) || stored === "proyectores";
  if(category.stored === "SMART WATCH" || category.stored === "RELOJ") return stored.startsWith("smart watch") || /\bsmart ?watch\b/.test(name);
  const inferred=inferStoreCategoryName(product);
  return stored===normalizeCatalogText(category.stored) || inferred===category.stored;
}

function wordMatches(a: string, b: string) {
  if (a === b || singular(a) === singular(b)) return true;
  // Spanish plurals: cargador/cargadores, control/controles, lápiz/lápices.
  const forms = (w: string) => [w, ...(w.endsWith("es") ? [w.slice(0,-2)] : []), ...(w.endsWith("ces") ? [w.slice(0,-3)+"z"] : [])];
  return forms(a).some(x => forms(b).includes(x));
}

const typePrefixes = new Set(["pack", "set", "kit", "de", "del", "dos", "tres", "un", "una", "mini", "m", "pla", "pl", "bt", "nuevo", "nueva"]);

/** Build the vocabulary from inventory and ERP references; aliases only supplement that vocabulary. */
export function createCatalogIndex<T extends CatalogCandidate>(products: T[], referenceBrands: string[] = []) {
  const knownBrands = new Map<string,string>();
  for (const value of [...referenceBrands, ...products.flatMap(p => [p.brand, resolveProductBrand(p)])]) {
    const key = normalizeCatalogText(value || "");
    if (key) knownBrands.set(key, value!.trim());
  }
  const brandEntries = [...knownBrands].sort((a,b) => b[0].length-a[0].length);
  const categoryNames = new Map<string,string>();
  for (const p of products) for (const value of [p.category, p.categoryRef?.name]) {
    if (value?.trim()) categoryNames.set(normalizeCatalogText(value),value.trim());
  }
  const rows = products.map(product => {
    const name = normalizeCatalogText(product.name.replace(/^\([^)]*\)\s*/, ""));
    const explicitBrand = normalizeCatalogText(product.brand || "");
    const brandKeys = explicitBrand
      ? brandEntries.filter(([key]) => hasPhrase(explicitBrand,key)).map(([key]) => key)
      : brandEntries.filter(([key]) => hasPhrase(name,key)).map(([key]) => key);
    const displayBrand = knownBrands.get(brandKeys[0]) || product.brand || resolveProductBrand(product) || "Otras marcas";
    let typeText = ` ${name} `;
    for (const key of brandKeys) typeText = typeText.replaceAll(` ${key} `, " ");
    const type = typeText.split(/\s+/).find(w => w && !typePrefixes.has(w) && !ignored.has(w) && !/\d/.test(w)) || "";
    return { product, name, brandKeys, displayBrand, type, code: normalizeCatalogText(product.code), words: normalizeCatalogText(`${product.code} ${product.name} ${product.category || ""} ${product.categoryRef?.name || ""}`).split(" ") };
  });
  const types = [...new Set(rows.map(r => r.type).filter(Boolean))];

  function select(content: string) {
    const text = normalizeCatalogText(content);
    const queryTerms = text.split(" ").filter(t => !ignored.has(t)).join(" ");
    const exactCodes = rows.filter(r => hasPhrase(text,r.code) && (/\bcodigos?\b/.test(text) || (queryTerms === r.code && !knownBrands.has(r.code) && !/\b(?:marca|categoria)s?\b/.test(text)) || content.includes(`(${r.product.code})`)));
    // An explicit SKU remains searchable even if it is numeric, unbranded or uncategorized.
    const maxCodeLength = Math.max(0,...exactCodes.map(r => r.code.length));
    const normalizedCodeRows = exactCodes.filter(r => r.code.length === maxCodeLength);
    const literalTokens = content.toLowerCase().split(/\s+/);
    const literalCodeRows = normalizedCodeRows.filter(r => literalTokens.includes(r.product.code.toLowerCase()));
    const codeRows = literalCodeRows.length ? literalCodeRows : normalizedCodeRows;
    if (codeRows.length) return { products: codeRows.map(r => r.product), scoped: true, label: codeRows.map(r => r.product.code).join(" / "), brands: [] as string[], categories: [] as string[], types: [] as string[], terms: codeRows.map(r => r.product.code) };

    let remainder = ` ${text} `;
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
    const aliases = requestedCategories.length ? [] : categories.filter(c => tokens.some(t => aliasMatches(t,c)));
    const remaining = tokens.filter(t => !aliases.some(c => aliasMatches(t,c)));
    const requestedTypes = !aliases.length && !remaining.some(t => /\d/.test(t))
      ? remaining.slice(0,1).filter(t => types.some(kind => wordMatches(kind,t))) : [];
    const terms = remaining.filter(t => !requestedTypes.includes(t));
    const scoped = Boolean(requestedCategories.length || requestedBrands.length || aliases.length || requestedTypes.length || terms.length);
    const selected = rows.filter(r => {
      if (requestedCategories.length && !requestedCategories.some(([key]) => [r.product.category,r.product.categoryRef?.name].some(v => normalizeCatalogText(v || "") === key))) return false;
      if (requestedBrands.length && !requestedBrands.some(([key]) => r.brandKeys.includes(key))) return false;
      if (aliases.length && !aliases.some(c => c.aliases.some(a => wordMatches(r.type,a)) || matchesCategory(r.product,c))) return false;
      if (requestedTypes.length && !requestedTypes.some(t => wordMatches(r.type,t))) return false;
      return terms.every(t => r.words.some(w => wordMatches(w,t)));
    }).sort((a,b) => a.displayBrand.localeCompare(b.displayBrand,"es") || a.product.name.localeCompare(b.product.name,"es"));
    const labels = [...requestedCategories.map(([,v]) => v),...aliases.map(c => c.label),...requestedTypes];
    const label = [...labels,...requestedBrands.map(([,v]) => v),...terms].join(" ") || "productos";
    return { products: selected.map(r => r.product), scoped, label, brands: requestedBrands.map(([,v]) => v), categories: [...requestedCategories.map(([,v]) => v),...aliases.map(c => c.label)], types: requestedTypes, terms };
  }
  return { select, brands: [...knownBrands.values()], categories: [...categoryNames.values()], types,
    productType: (product: T) => rows.find(r => r.product === product)?.type || "",
    productBrand: (product: T) => rows.find(r => r.product === product)?.displayBrand || "Otras marcas" };
}

export function selectCatalogProducts<T extends CatalogCandidate>(content: string, products: T[], referenceBrands: string[] = []) {
  return createCatalogIndex(products,referenceBrands).select(content);
}
