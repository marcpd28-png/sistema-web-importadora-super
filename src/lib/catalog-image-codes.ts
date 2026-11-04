// Formatting only: never substitute O/0, I/1, or change model digits.
export const imageCodeKey = (code: string) => code
  .toUpperCase()
  .trim()
  .replace(/[()]/g, "")
  .replace(/\s+/g, "")
  .replace(/[.,;:]+$/, "");

export type CatalogImageReference = { code: string; name?: string };

export function catalogImageAliases(product: CatalogImageReference): string[] {
  const aliases = [imageCodeKey(product.code)];
  const name = product.name || "";
  const leading = name.match(/^\s*\(([A-Z0-9][A-Z0-9 ._-]{0,30})\)/i)?.[1];
  const labeled = [...name.matchAll(/\bCOD(?:IGO)?\.?\s*[:.]?\s*\(?([A-Z0-9]+(?:[-_][A-Z0-9]+)*)\b/gi)].map((match) => match[1]);
  for (const value of [leading, ...labeled]) {
    if (value && /[a-z]/i.test(value) && /\d/.test(value)) aliases.push(imageCodeKey(value));
  }
  return [...new Set(aliases)];
}
