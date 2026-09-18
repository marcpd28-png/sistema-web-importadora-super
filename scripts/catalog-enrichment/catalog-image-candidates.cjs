/* eslint-disable @typescript-eslint/no-require-imports -- Offline OCR evidence preparation. */
const { normalized } = require('./catalog-facts.cjs');
// OCR is a candidate finder. Nothing returned here is automatically published.
function imageCandidates(product, ocr) {
  if (!ocr || ocr.error) return [];
  const all = normalized(ocr.lines.map(l => l.text).join(' '));
  const title = normalized(product.name);
  const modelTokens = (title.match(/[A-Z]{1,8}[- ]?[A-Z]*\d[A-Z0-9.-]{1,18}/g) || [])
    .filter(s => s.length >= 4 && !s.startsWith(product.code) && !/^(?:[A-Z]?\d+(?:W|GB|MAH|HRS)|[A-Z]\d{4,})$/.test(s));
  const modelMatch = modelTokens.some(s => all.includes(s));
  const codeMatch = all.includes(normalized(product.code));
  if (!modelMatch && !codeMatch) return [];
  return ocr.lines.filter(l => l.confidence >= 88 && l.minConfidence >= 75 && l.text.length <= 170)
    .filter(l => !/PRECIO|S[/.]|IGV|MAYOR|VENTA|DELIVERY|GARANT|\bPACK\b/i.test(l.text))
    .filter(l => /(?:BLUETOOTH|WIRELESS)\s*(?:V(?:ERSION)?\s*)?\d[.,]\d|\d\s*(?:mAh|Wh|Watts|W\b|HORAS|HRS|H\b|LITROS|GB\b|ANSI|LUMEN)|\b(?:ENTRADA|SALIDA|INPUT|OUTPUT|RESOLUCION|POTENCIA|CAPACIDAD|BATERIA|AUTONOMIA|TIEMPO|MEDIDAS|DIMENSIONES)\b.*\d/i.test(l.text))
    .map(l => ({ text: l.text, confidence: l.confidence, modelMatch, codeMatch }));
}
module.exports = { imageCandidates };
