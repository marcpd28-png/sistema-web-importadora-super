import { normalizeCommercialText } from "./commercial-query";

/** Grammatical boundaries, not customer-sentence exceptions. Unknown qualifiers inside
 * a product subject remain constraints; only surrounding request/discourse is removed. */
export function extractCommercialSubject(text: string, isEntity: (word: string) => boolean, phrases: string[]) {
  const words = text.split(/\s+/).filter(Boolean);
  const protectedWords = new Set<number>();
  for (const phrase of phrases) {
    const parts = phrase.split(" ");
    for (let i = 0; i <= words.length - parts.length; i++) {
      if (parts.every((part, offset) => words[i + offset] === part)) for (let j = i; j < i + parts.length; j++) protectedWords.add(j);
    }
  }
  const first = words.findIndex((word, i) => protectedWords.has(i) || isEntity(word) || /^(?:catalogos?|categorias?|marcas?|codigos?)$/.test(word));
  if (first < 0) return text;
  const prefix = words.slice(0, first).join(" ");
  // A bare unknown noun before a brand (e.g. "shaver SUPER") is NOT courtesy.
  const requestPrefix = /\b(?:me|nos|busc\w*|necesit\w*|quisier\w*|quier\w*|dese\w*|podr\w*|pued\w*|compart\w*|revis\w*|consegu\w*|facilit\w*|catalogos?)\b/.test(prefix);
  const start = requestPrefix ? first : 0;
  let end = words.length;
  for (let i = first + 1; i < words.length; i++) {
    if (protectedWords.has(i)) continue;
    const next = words[i + 1] || "";
    if (/^(?:cuando|antes|despues|gracias)$/.test(words[i]) ||
        (words[i] === "para" && (/^(?:mi|mis|nuestro|nuestra)$/.test(next) || /(?:ar|er|ir)$/.test(next) && !isEntity(next))) ||
        (words[i] === "es" && next === "para")) {
      end = words[i] === "gracias" && /^(?:muchas|muchisimas|mil)$/.test(words[i - 1]) ? i - 1 : i;
      break;
    }
  }
  return words.slice(start, end).join(" ");
}

export type CommercialMessage = { id: string; content: string; sourceMessageIds?: string[] };
export type CommercialLexicon = { fragmentKind(content: string): "subject" | "qualifier" | null };
const operation = /\b(?:catalogos?|precio|precios|cuanto|cuesta|cuestan|stock|informacion|info|garantia|envios?|envian|shalom|yape|plin|pagos?|direccion|horario|ubicacion|reintenta|cancela)\b/;

/** Join fragments only while they extend one request. Independent operations and
 * corrections stay separate, and every contributing source ID survives planning. */
export function groupCommercialFragments(messages: CommercialMessage[], lexicon?: CommercialLexicon) {
  const grouped: CommercialMessage[] = [];
  for (const message of messages) {
    const text = normalizeCommercialText(message.content);
    const last = grouped.at(-1);
    const prior = last ? normalizeCommercialText(last.content) : "";
    const kind = lexicon?.fragmentKind(message.content);
    const priorSubject = prior.replace(/\b(?:precio|precios|informacion|info|stock|catalogos?)\b/g, " ").replace(/^\s*(?:de|del)\s+/, "").trim();
    const catalogContinuation = /\bcatalogos?\b/.test(prior) && Boolean(kind);
    const fragment = !operation.test(text) && !/^(?:solo|solamente|mejor|cambia|prefiero|el|la)\b/.test(text) &&
      !/\b(?:unidades?|unds?|piezas?)$/.test(text) && !/^(?:hola|gracias|ok|si|no)$/.test(text) &&
      (/^(?:de|del|marca|modelo|tipo)\b/.test(text) || /^(?:y|e|o|u)\b/.test(text) && /\bcatalogos?\b/.test(prior) || catalogContinuation || (kind === "qualifier" && Boolean(lexicon?.fragmentKind(priorSubject))) ||
        /\b(?:catalogos?|precio|informacion|busco|necesito|quiero)(?:\s+(?:de|del|por mayor|mayorista|en pdf))*$/.test(prior));
    if (last && fragment) {
      const listJoin = catalogContinuation && kind === "subject" && !/^(?:de|del|y|e|o|u)\b/.test(text) && !/\bcatalogos?$/.test(prior);
      last.content += `${listJoin ? " y" : ""} ${message.content}`;
      last.sourceMessageIds!.push(...(message.sourceMessageIds || [message.id]));
    } else grouped.push({ ...message, sourceMessageIds: [...(message.sourceMessageIds || [message.id])] });
  }
  return grouped;
}

/** Split at a conjunction only if the following clause introduces an operation.
 * Product lists (cargadores y fuentes) and price ranges (entre 50 y 100) survive. */
export function commercialClauses(content: string) {
  const urls: string[] = [];
  let marker = "\uE000URL";
  while (content.includes(marker)) marker += "_";
  const protectedContent = content.replace(/https?:\/\/[^\s<>"']+/gi, url => `${marker}${urls.push(url) - 1}\uE001`);
  return protectedContent.split(/\n+|[?]\s*(?=\S)|(?:\s+y\s+|[,;]\s*)(?=(?:¿|(?:saber\s+)?cu[aá]nto|se\s+puede\s+pagar|puedo\s+pagar|hacen\s+env|aceptan|formas?\s+de\s+pago|medios?\s+de\s+pago|env[ií]os?|stock\b|disponibilidad\b|informaci[oó]n\b|tambi[eé]n\s+(?:quiero|dame|informaci[oó]n|precio)|(?:el\s+)?precio|d[oó]nde|horario|direcci[oó]n))/i)
    .filter(value => value.trim()).map(value => urls.reduce((text, url, i) => text.replaceAll(`${marker}${i}\uE001`, url), value));
}
