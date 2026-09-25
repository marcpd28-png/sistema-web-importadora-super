// Numeric models and explicit variants must survive fuzzy search and RAG.
export function matchesRequestedModel(query: string, product: { name: string; code: string }) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const requested = normalize(query);
  const name = normalize(product.name.replace(/^\([^)]*\)\s*/, ""));
  const accessory = /\b(?:cable|funda|estuche|soporte|protector|mica|cargador|adaptador|repuesto)s?\b/;
  const phone = /\b(?:celular(?:es)?|smartphones?|iphone|galaxy|s\d{2}\s*(?:ultra|plus|fe)?|redmi\s+(?:note\s+)?\d+)\b/;
  if (phone.test(requested) && !accessory.test(requested) && accessory.test(name.split(/\b(?:para|compatible)\b/)[0])) return false;
  const tokens = (value: string): string[] => value.toLowerCase().replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").match(/[a-z]+|\d+/g) || [];
  const required = tokens(query).filter(token => /^\d+$/.test(token) || ["pro", "plus", "max", "ultra"].includes(token));
  const actual = tokens(`${product.name} ${product.code}`);
  return required.every(token => actual.includes(token));
}
