export type ImageNameText = { text: string; confidence: number; view: string };
const ignored = new Set("DE DEL LA EL LOS LAS UN UNA PARA CON POR Y EN AL COD CODIGO M SUPER TIPO MODELO COLOR NEGRO NEGRA BLANCO BLANCA AZUL VERDE ROJO ROJA ORIGINAL NUEVO NUEVA".split(" "));
export function imageNameWords(text: string) {
  return [...new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\([^)]*\)/g, " ").match(/[A-Z0-9]+/g) || [])]
    .filter(word => word.length >= 3 && !ignored.has(word) && /[A-Z]/.test(word))
    .map(word => /^[A-Z]{4,}S$/.test(word) ? word.slice(0, -1) : word);
}
export function matchCatalogImageName(text: ImageNameText[], products: readonly { code: string; name?: string }[]) {
  const byView = new Map<string, Set<string>>();
  for (const line of text) {
    if (line.confidence < 70 || !Number.isFinite(line.confidence)) continue;
    const words = byView.get(line.view) || new Set<string>();
    imageNameWords(line.text).forEach(word => words.add(word)); byView.set(line.view, words);
  }
  const matches = products.flatMap(product => {
    const expected = imageNameWords(product.name || "");
    if (expected.length < 3) return [];
    const supportedViews = [...byView.values()].filter(observed => {
      const matched = expected.filter(word => observed.has(word));
      const exactModel = matched.some(word => /[A-Z]/.test(word) && /\d/.test(word));
      return matched.length >= 3 && matched.length / expected.length >= .75 && (exactModel || matched.length >= 5 && matched.length / expected.length >= .85);
    });
    return supportedViews.length >= 2 ? [product.code] : [];
  });
  return [...new Set(matches)];
}
