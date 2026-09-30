export function getPublicProductName(name: string) {
  const cleaned = name
    .replace(/_x000d_/gi, " ")
    .replace(/^\s*\([^)]*\)\s*/, "")
    .replace(/\bcod\.\s*(?=\(|$)/gi, "")
    .replace(/\(([^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || name.trim();
}
