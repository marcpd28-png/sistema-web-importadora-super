export type ImageNameText = { text: string; confidence: number; view: string };
const ignored = new Set("DE DEL LA EL LOS LAS UN UNA PARA CON POR Y EN AL COD CODIGO TIPO MODELO COLOR".split(" "));
const colors = new Set("NEGRO NEGRA BLANCO BLANCA AZUL VERDE ROJO ROJA ROSADO ROSADA AMARILLO AMARILLA GRIS DORADO PLATEADO".split(" "));
export function imageNameWords(text: string) {
  return [...new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().match(/[A-Z0-9]+(?:[.,]\d+)?/g) || [])]
    .filter(word => !ignored.has(word))
    .map(word => /^[A-Z]{4,}S$/.test(word) ? word.slice(0, -1) : word);
}
export function identifyCatalogImageNames(text: ImageNameText[], products: readonly { code: string; name?: string }[]) {
  const byView = new Map<string, Map<string, number>>();
  for (const line of text) {
    if (line.confidence < 70 || line.confidence > 100 || !Number.isFinite(line.confidence)) continue;
    const words = byView.get(line.view) || new Map<string, number>();
    imageNameWords(line.text).forEach(word => words.set(word, Math.max(words.get(word) || 0, line.confidence))); byView.set(line.view, words);
  }
  const matches = products.flatMap(product => {
    // Remove explicit code metadata only; preserve parenthesized specifications.
    const name = (product.name || "").replace(/\bCOD(?:IGO)?\.?\s*[:.]?\s*[A-Z0-9_-]+/gi, " ")
      .replace(/^\s*\(([A-Z0-9_-]+)\)/i, (original, value: string) => {
        const code = product.code.toUpperCase().replace(/[()]/g, "");
        const label = value.toUpperCase();
        return code === label || code.startsWith(`${label}-`) || code.startsWith(`${label}_`) ? " " : original;
      });
    const expected = imageNameWords(name);
    if (expected.filter(word => /[A-Z]/.test(word) && !colors.has(word)).length < 2) return [];
    const supportedViews = [...byView.values()].flatMap(observed => {
      const matched = expected.filter(word => observed.has(word));
      const complete = matched.length === expected.length;
      const expectedColors = expected.filter(word => colors.has(word));
      if (expectedColors.length && [...observed.keys()].some(word => colors.has(word)) && !expectedColors.every(word => observed.has(word))) return [];
      const core = expected.filter(word => !colors.has(word));
      const coreMatched = core.filter(word => observed.has(word));
      const partial = coreMatched.length >= 3 && coreMatched.length / core.length >= .75 && coreMatched.some(word => /[A-Z]/.test(word) && /\d/.test(word));
      if (!complete && !partial) return [];
      return [{ complete, confidence: Math.min(...matched.map(word => observed.get(word)!)) / 100 }];
    });
    if (supportedViews.length < 2) return [];
    const full = supportedViews.filter(view => view.complete).sort((a, b) => b.confidence - a.confidence);
    const complete = full.length >= 2;
    const evidence = complete ? full : supportedViews.sort((a, b) => b.confidence - a.confidence);
    return [{ code: product.code, complete, confidence: Math.min(complete ? .95 : .8, evidence[1].confidence) }];
  });
  return matches;
}
export function matchCatalogImageName(text: ImageNameText[], products: readonly { code: string; name?: string }[]) {
  return [...new Set(identifyCatalogImageNames(text, products).map(match => match.code))];
}
