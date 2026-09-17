import { resolveProductBrand } from "./product-discovery";
import { inferStoreCategoryName } from "./product-category-classifier";

export type CatalogCandidate = { code: string; name: string; brand: string | null; category: string | null };
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
  { label: "relojes inteligentes", stored: "SMART WATCH", aliases: ["smartwatch", "smartwatches", "reloj", "relojes"] },
];
const ignored = new Set(normalizeCatalogText("hola buenas buenos dias tardes noches por favor porfa gracias me nos dan das da dar dame pasa pasan pasas pasame pasar manda mandan mandas mandame envia envian envias enviame enviarme darme pasarme mandarme enviar mostrar muestra muestrame mostrarme quisiera quiero necesito deseo puedes pueden podria podrias tienen tendran catalogo catalogos de del el la los las un una unos unas tus sus su tu ustedes sus todos todas todo productos producto articulos articulo ver y o para con en pdf por mayor al menor unidades unidad mayorista minorista compra comprar completo completa completos completas general disponible disponibles stock precio precios lista listado este esta esos esas" ).split(" "));
function hasPhrase(text: string, phrase: string) { return (` ${text} `).includes(` ${phrase} `); }
for (const word of ["marca", "marcas", "categoria", "categorias", "tipo", "tipos", "porfavor"]) ignored.add(word);
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
  if (["AURICULARES", "PARLANTES", "PROYECTORES"].includes(category.stored) && /^(?:funda|estuche|soporte|cable|adaptador|microfono|bateria)\b/.test(name)) return false;
  const stored=normalizeCatalogText(product.category || "");
  if(category.stored === "PROYECTORES") return /\bproyectores?\b/.test(name) || stored === "proyectores";
  if(category.stored === "SMART WATCH") return stored.startsWith("smart watch") || /\bsmart ?watch\b/.test(name);
  const inferred=inferStoreCategoryName(product);
  return stored===normalizeCatalogText(category.stored) || inferred===category.stored;
}

/** Explicit request scope is evaluated afresh: a previous brand never leaks into a new category request. */
export function selectCatalogProducts<T extends CatalogCandidate>(content: string, products: T[]) {
  const text=normalizeCatalogText(content);
  const knownBrands=new Map<string,string>();
  for(const p of products) {const brand=resolveProductBrand(p);if(brand)knownBrands.set(normalizeCatalogText(brand),brand);}
  const brands=[...knownBrands].filter(([key])=>hasPhrase(text,key)).sort((a,b)=>b[0].length-a[0].length);
  let remainder=` ${text} `;
  for(const [key] of brands) remainder=remainder.replaceAll(` ${key} `," ");
  const tokens=remainder.trim().split(/\s+/).filter(Boolean);
  const requestedCategories=categories.filter(c=>tokens.some(t=>c.aliases.includes(t) || c.aliases.some(a=>nearWord(t,a))));
  const terms=tokens.filter(t=>!ignored.has(t) && !requestedCategories.some(c=>c.aliases.includes(t) || c.aliases.some(a=>nearWord(t,a))));
  const scoped=brands.length>0 || requestedCategories.length>0 || terms.length>0;
  const selected=products.filter(p=>{
    if(brands.length && !brands.some(([key])=>normalizeCatalogText(resolveProductBrand(p)||"")===key)) return false;
    if(requestedCategories.length && !requestedCategories.some(c=>matchesCategory(p,c))) return false;
    const words=normalizeCatalogText(`${p.code} ${p.name} ${p.category||""}`).split(" ");
    return terms.every(t=>words.some(w=>singular(w)===singular(t)));
  }).sort((a,b)=> (resolveProductBrand(a)||"Otras marcas").localeCompare(resolveProductBrand(b)||"Otras marcas","es") || a.name.localeCompare(b.name,"es"));
  const label=[requestedCategories.map(c=>c.label).join(" y "),brands.map(([,v])=>v).join(" y "),terms.join(" ")].filter(Boolean).join(" ");
  return { products:selected, scoped, label:label||"productos", brands:brands.map(([,v])=>v), categories:requestedCategories.map(c=>c.label), terms };
}
