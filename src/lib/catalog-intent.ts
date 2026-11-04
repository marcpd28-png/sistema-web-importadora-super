const CATALOG_SHORT_FORMS = new Set([
  "cat",
  "cata",
  "catal",
  "catalo",
  "catalog",
]);

const COMMON_CATALOG_MISSPELLINGS = new Set([
  "catalgo",
  "catalgoo",
  "cataglafo",
  "catallg",
  "catallgo",
]);

const CATALOG_SCOPE_NOISE = new Set([
  "pdf",
  "archivo",
  "archivos",
  "documento",
  "documentos",
  "especifico",
  "especificos",
  "especifica",
  "especificas",
]);

function normalizedWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasCatalogTypo(word: string) {
  const singular = word.endsWith("s") ? word.slice(0, -1) : word;
  const target = "catalogo";
  const maximumDistance = 2;

  if (
    singular.length < 5 ||
    singular.length > target.length + maximumDistance ||
    Math.abs(singular.length - target.length) > maximumDistance
  ) {
    return false;
  }

  let previous = Array.from({ length: target.length + 1 }, (_, index) => index);

  for (let row = 1; row <= singular.length; row += 1) {
    const current = [row];
    let rowMinimum = current[0];

    for (let column = 1; column <= target.length; column += 1) {
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (singular[row - 1] === target[column - 1] ? 0 : 1),
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maximumDistance) {
      return false;
    }

    previous = current;
  }

  return previous[target.length] <= maximumDistance;
}

/** Recognizes full, abbreviated, plural, extended and common misspelled forms
 * of “catálogo”, without tying the behavior to a particular product family. */
export function isCatalogKeyword(word: string) {
  const normalized = word.trim().toLowerCase();
  const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;

  return (
    CATALOG_SHORT_FORMS.has(normalized) ||
    COMMON_CATALOG_MISSPELLINGS.has(singular) ||
    normalized.includes("catalog") ||
    hasCatalogTypo(normalized)
  );
}

/** Returns the portion after the catalogue keyword. An empty string means the
 * customer requested the general catalogue rather than a specific one. */
export function getCatalogRequestScope(content: string): string | null {
  const words = normalizedWords(content);
  const index = words.findIndex(isCatalogKeyword);

  if (index < 0) {
    return null;
  }

  return words
    .slice(index + 1)
    .filter((word) => !CATALOG_SCOPE_NOISE.has(word))
    .join(" ");
}

export function isCatalogRequest(content: string) {
  return getCatalogRequestScope(content) !== null;
}
