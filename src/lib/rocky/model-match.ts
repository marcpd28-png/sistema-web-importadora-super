// Numeric models and explicit variants must survive fuzzy search and RAG.
export function matchesRequestedModel(query: string, product: { name: string; code: string }) {
  const tokens = (value: string): string[] => value.toLowerCase().replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").match(/[a-z]+|\d+/g) || [];
  const required = tokens(query).filter(token => /^\d+$/.test(token) || ["pro", "plus", "max", "ultra"].includes(token));
  const actual = tokens(`${product.name} ${product.code}`);
  return required.every(token => actual.includes(token));
}
