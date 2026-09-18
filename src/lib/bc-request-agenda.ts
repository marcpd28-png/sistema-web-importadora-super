import { z } from "zod";
import { describeCommercialConstraints, normalizeCommercialText, parseCommercialQuery } from "./commercial-query";
import { commercialClauses, groupCommercialFragments, type CommercialLexicon } from "./commercial-language";

export const agendaRequestSchema = z.object({
  id: z.string(), kind: z.enum(["CATALOG", "SEARCH", "INFORMATION", "PRICE", "STOCK", "SHIPPING", "PAYMENT", "STORE"]),
  topicId: z.string().nullable(), question: z.string(), fields: z.array(z.string()), quantity: z.number().int().positive().nullable(),
  sourceMessageIds: z.array(z.string()), status: z.enum(["PENDING", "NEEDS_CLARIFICATION", "ANSWERED", "CANCELLED"]),
  answeredBy: z.string().nullable(), evidence: z.array(z.string()).default([]),
});
export const agendaSchema = z.object({
  version: z.literal(1), lastTopicId: z.string().nullable(),
  topics: z.array(z.object({ id: z.string(), query: z.string(), selectedCode: z.string().nullable(), shownCodes: z.array(z.string()),
    shownGroups: z.array(z.object({ query: z.string(), codes: z.array(z.string()) })).optional() })).max(100),
  requests: z.array(agendaRequestSchema).max(200),
});
export type RequestAgenda = z.infer<typeof agendaSchema>;
export type AgendaRequest = z.infer<typeof agendaRequestSchema>;
export type AgendaTopic = RequestAgenda["topics"][number];
export const emptyAgenda = (): RequestAgenda => ({ version: 1, lastTopicId: null, topics: [], requests: [] });

export const SPECIFICATION_FIELDS = [
  { key: "autonomia", label: "Autonomía", pattern: /\b(?:autonomia|duracion|dura|horas)\b/, names: /autonomia|duracion|horas/ },
  { key: "bateria", label: "Batería", pattern: /\bbateria\b/, names: /bateria/ },
  { key: "potencia", label: "Potencia", pattern: /\b(?:potencia|watts?|rms|pmpo)\b/, names: /potencia|watts?|rms|pmpo/ },
  { key: "garantia", label: "Garantía", pattern: /\bgarantia\b/, names: /garantia/ },
  { key: "incluye", label: "Contenido de la caja", pattern: /\b(?:incluye|incluido|accesorios|que trae)\b/, names: /incluye|contenido|accesorios/ },
  { key: "sistema", label: "Sistema operativo", pattern: /\b(?:android|sistema operativo|google tv)\b/, names: /sistema|android/ },
  { key: "resolucion", label: "Resolución", pattern: /\b(?:resolucion|4k|1080p|720p)\b/, names: /resolucion/ },
  { key: "compatibilidad", label: "Compatibilidad", pattern: /\b(?:compatible|compatibilidad|funciona con)\b/, names: /compatibilidad|compatible/ },
  { key: "conectividad", label: "Conectividad", pattern: /\b(?:bluetooth|wifi|wi fi|conectividad)\b/, names: /bluetooth|wifi|wi fi|conectividad/ },
  { key: "carga", label: "Carga y conectores", pattern: /\b(?:carga|cargador|conectores|puertos|tipo c|usb)\b/, names: /carga|conector|puerto|usb/ },
  { key: "medidas", label: "Medidas", pattern: /\b(?:medidas|dimensiones|tamano|peso)\b/, names: /medida|dimension|tamano|peso/ },
  { key: "resistencia", label: "Resistencia al agua", pattern: /\b(?:agua|impermeable|ip67|ip68|ipx)\b/, names: /agua|impermeable|resistencia|ip67|ip68|ipx/ },
];

export function requestedSpecificationFields(question: string) {
  const text = normalizeCommercialText(question);
  const fields = SPECIFICATION_FIELDS.filter(field => field.pattern.test(text)).map(field => field.key);
  return fields.includes("autonomia") ? fields.filter(field => field !== "bateria") : fields;
}

const NUMBERS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12 };
export function requestedQuantity(content: string) {
  const text = normalizeCommercialText(content);
  const match = text.match(/\b(?:por|para|quiero|necesito|salen|cuestan|cotiza|cotizar|mejor)\s+(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\b/) || text.match(/\b(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\s+(?:unidades|unds|piezas)\b/);
  if (match && /^(?:w|watts?|v|voltios?|gb|tb|mb|mah|cm|mm|kg|rpm|pulgadas?|soles?)\b/.test(text.slice(match.index! + match[0].length).trim())) return null;
  const value = match ? NUMBERS[match[1]] ?? Number(match[1]) : null;
  return value && value <= 100000 ? value : null;
}

/** Keep model punctuation intact; remove question wording before querying the catalog. */
export function productSubject(content: string, preserveAttributes = false) {
  // Browsing vocabulary belongs to the catalog index. Removing attribute words here
  // destroys categories such as ACCESORIOS DE CUIDADO PERSONAL or CARGA PORTATIL.
  const browsing = /\b(?:busco|buscando|catalogos?|categorias?|marcas?|modelos|productos|articulos|tienes|tienen|venden|manejan|accesorios (?:de|para))\b/.test(normalizeCommercialText(content));
  if (browsing && !/\b(?:cuanto dura|que incluye|que trae|que garantia|que potencia)\b/.test(normalizeCommercialText(content))) {
    return content.replace(/[¿?!,;]+/g, " ").replace(/\s+/g, " ").trim();
  }
  let subject = content
    .replace(/\b(?:fotos?|im[aá]genes?|fotograf[ií]as?)\b/gi, " ")
    .replace(/\b(?:salen|cuestan|quiero|necesito|cotiza|cotizar)\s+\d+\s*(?:unidades?|unds?|piezas?)?\b/gi, " ")
    .replace(/\b(?:cu[aá]nto\s+(?:dura|cuesta|cuestan|sale|salen)|qu[eé]\s+(?:incluye|trae)|funciona\s+con|sistema\s+operativo)\b/gi, " ")
    .replace(/\b(?:para|por)\s+(?:\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\s*(?:unidades?|unds?|piezas?)?\b/gi, " ")
    .replace(/\b(?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\b/gi, " ")
    .replace(/\b(?:tambi[eé]n|adem[aá]s|informaci[oó]n|informes|info|detalles|caracter[ií]sticas|especificaciones|sobre|acerca|precio|precios|cu[aá]nto|cu[aá]ntos|cuesta|cuestan|sale|salen|stock|disponibilidad|disponible|disponibles|trae|tiene|ese|esa|este|esta|eso|del|el|la|los|las|de|que|cu[aá]l|cu[aá]les|es|son|dime|saber|quisiera|quiero|necesito|busco|tienes|tienen|hay|por|favor|me|puedes|dar|pasame|p[aá]same|pasa|manda|mandame|env[ií]ame|ver|cat[aá]logos?|pdf)\b/gi, " ");
  if (!preserveAttributes) subject = subject.replace(/\b(?:bater[ií]a|autonom[ií]a|duraci[oó]n|dura|horas|potencia|garant[ií]a|incluye|incluido|accesorios|android|resoluci[oó]n|compatible|compatibilidad|conectividad|bluetooth|wifi|carga|puertos|medidas|dimensiones|peso)\b/gi, " ");
  return subject
    .replace(/[¿?!,;]+/g, " ").replace(/\s+/g, " ").trim().replace(/^(?:y|e|o|u)\s+|\s+(?:y|e|o|u)$/gi, "").replace(/^(?:y|e|o|u)$/i, "");
}

function commonTopic(query: string, topic: AgendaTopic) {
  const tokens = normalizeCommercialText(query).split(" ").filter(Boolean);
  const words = normalizeCommercialText(topic.query).split(" ");
  return tokens.length > 0 && tokens.every(token => words.includes(token) || words.includes(token.replace(/s$/, "")));
}

export function planRequests(previous: RequestAgenda, messages: { id: string; content: string }[], lexicon?: CommercialLexicon) {
  const agenda = structuredClone(previous);
  const touched = new Set<string>();
  let recognized = false;
  let unsupported = false;
  for (const message of groupCommercialFragments(messages, lexicon)) {
    const sourceIds = message.sourceMessageIds!;
    const clauses = commercialClauses(message.content);
    for (const clause of clauses) {
      const text = normalizeCommercialText(clause);
      if (/^(?:hola|gracias|ok|buenos dias|buenas tardes|buenas noches)$/.test(text)) continue;
      if (/\b(?:reintenta|reintentar|intenta otra vez|consulta pendiente)\b/.test(text)) {
        for (const job of agenda.requests.filter(value => value.status === "PENDING" || value.status === "NEEDS_CLARIFICATION")) touched.add(job.id);
        recognized = touched.size > 0;
        continue;
      }
      if (/\b(?:cancela|cancelar|olvida|ya no quiero)\b/.test(text)) {
        const targets = agenda.requests.filter(value => value.topicId === agenda.lastTopicId && value.status !== "ANSWERED");
        for (const job of targets) { job.status = "CANCELLED"; touched.add(job.id); }
        recognized = targets.length > 0;
        continue;
      }
      const fields = requestedSpecificationFields(clause);
      const kinds: AgendaRequest["kind"][] = [];
      const quantityOnly = /^(?:mejor\s+)?(?:\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\s+(?:unidades?|unds?|piezas?)$/.test(text);
      if (quantityOnly) kinds.push("PRICE");
      const catalog = /\bcatalogos?\b/.test(text);
      if (catalog) kinds.push("CATALOG");
      if (/\b(?:envios?|envian|envias|hacen delivery|shalom|olva|entrega|demora|flete)\b/.test(text) && !catalog) kinds.push("SHIPPING");
      if (/\b(?:pago|pagos|yape|plin|transferencia|aceptan tarjetas?)\b/.test(text)) kinds.push("PAYMENT");
      if (/\b(?:direccion|horario|ubicacion|donde estan|donde queda)\b/.test(text)) kinds.push("STORE");
      const business = kinds.some(kind => ["SHIPPING", "PAYMENT", "STORE"].includes(kind));
      if (!business && /\b(?:precio|precios|cuesta|cuestan|salen|cotiza|cotizar|cuanto sale|cuanto por)\b/.test(text)) kinds.push("PRICE");
      if (!business && /\b(?:stock|disponibilidad|cuantas unidades|hay disponibles)\b/.test(text)) kinds.push("STOCK");
      const information = /\b(?:informacion|info|detalles|caracteristicas|especificaciones)\b/.test(text) || fields.length > 0 && /\b(?:cuanto dura|que|cual|tiene|trae|incluye|garantia|potencia|autonomia|medidas|dimensiones)\b/.test(text);
      if (!business && !catalog && information) kinds.push("INFORMATION");
      const query = business || quantityOnly ? "" : productSubject(clause, !information);
      const filter = parseCommercialQuery(query);
      const isCorrection = !kinds.length && (/^(?:mejor|solo|solamente|cambia)\b/.test(text) || (filter.constraints.colors.length > 0 && !filter.text.trim()));
      let topic: AgendaTopic | undefined;
      const referenced = clause.match(/\b(?:el|la)\s+(primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta|\d+)\b/i);
      if (referenced) {
        const scope = productSubject(clause.replace(referenced[0], ""));
        const candidates = agenda.topics.flatMap(value => (value.shownGroups?.length ? value.shownGroups : [{ query: value.query, codes: value.shownCodes }])
          .filter(group => group.codes.length && (!scope || commonTopic(scope, { ...value, query: group.query }))).map(group => ({ topic: value, codes: group.codes })));
        if (candidates.length === 1) {
          topic = candidates[0].topic;
          const position = ["primero", "primera", "segundo", "segunda", "tercero", "tercera", "cuarto", "cuarta", "quinto", "quinta"].indexOf(referenced[1].toLowerCase());
          const index = position >= 0 ? Math.floor(position / 2) : Number(referenced[1]) - 1;
          topic.selectedCode = candidates[0].codes[index] ?? null;
          if (topic.selectedCode) topic.query = topic.selectedCode;
        }
        if (!topic && !kinds.length) kinds.push("SEARCH");
      } else if (query && !isCorrection) {
        topic = [...agenda.topics].reverse().find(value => value.selectedCode?.toLowerCase() === query.toLowerCase() || commonTopic(query, value));
        if (!topic) {
          topic = { id: `${message.id}:topic:${agenda.topics.length}`, query, selectedCode: null, shownCodes: [] };
          agenda.topics.push(topic);
        }
      } else if (!business) {
        const correctionSubject = filter.text.replace(/\b(?:mejor|cambia|cambialo|prefiero)\b/gi, "").trim();
        topic = isCorrection && correctionSubject ? [...agenda.topics].reverse().find(value => commonTopic(correctionSubject, value)) : undefined;
        topic ??= agenda.topics.find(value => value.id === agenda.lastTopicId);
      }
      if (isCorrection && topic) {
        const cleaned = query.replace(/\b(?:mejor|cambia|cambialo|prefiero)\b/gi, "").trim();
        const old = parseCommercialQuery(topic.query);
        const preserved = describeCommercialConstraints({ ...old.constraints, colors: filter.constraints.colors.length ? [] : old.constraints.colors });
        topic.query = filter.constraints.colors.length ? `${old.text} ${cleaned} ${preserved}`.trim() : `${topic.query} ${cleaned}`.trim();
        topic.selectedCode = null;
        for (const request of agenda.requests.filter(value => value.topicId === topic!.id && value.status !== "CANCELLED")) {
          request.status = "PENDING"; request.sourceMessageIds = [...new Set([...request.sourceMessageIds, ...sourceIds])]; touched.add(request.id);
        }
        recognized = true;
        continue;
      }
      if (topic) agenda.lastTopicId = topic.id;
      if (!kinds.length && topic && (query || referenced)) {
        const pending = agenda.requests.filter(value => value.topicId === topic!.id && value.status === "NEEDS_CLARIFICATION");
        if (pending.length) for (const request of pending) { request.status = "PENDING"; request.sourceMessageIds = [...new Set([...request.sourceMessageIds, ...sourceIds])]; touched.add(request.id); }
        else kinds.push("SEARCH");
      }
      if (!kinds.length && !touched.size && !/^(?:hola|gracias|ok|buenos dias|buenas tardes|buenas noches)$/.test(text)) unsupported = true;
      for (const kind of kinds) {
        // A quantity fragment in the same burst refines the quote; it must not produce
        // an initial one-unit quote followed by a contradictory second quote.
        const refining = quantityOnly && topic ? agenda.requests.findLast(job => touched.has(job.id) && job.topicId === topic.id && job.kind === "PRICE") : undefined;
        if (refining) {
          refining.quantity = requestedQuantity(clause);
          refining.sourceMessageIds = [...new Set([...refining.sourceMessageIds, ...sourceIds])];
          refining.question += `; ${clause.trim()}`;
          continue;
        }
        const id = `${message.id}:${agenda.requests.length}:${kind}`;
        agenda.requests.push({ id, kind, topicId: business ? null : topic?.id ?? null, question: clause.trim(), fields: kind === "INFORMATION" ? fields : [],
          quantity: requestedQuantity(clause), sourceMessageIds: [...sourceIds], status: "PENDING", answeredBy: null, evidence: [] });
        touched.add(id); recognized = true;
      }
    }
  }
  // Retain every unresolved request; bounded completed history never silently evicts pending work.
  const completed = agenda.requests.filter(value => ["ANSWERED", "CANCELLED"].includes(value.status)).slice(-50);
  agenda.requests = [...completed, ...agenda.requests.filter(value => !["ANSWERED", "CANCELLED"].includes(value.status))];
  const retainedTopics = new Set(agenda.requests.map(job => job.topicId));
  agenda.topics = agenda.topics.filter(topic => retainedTopics.has(topic.id) || topic.id === agenda.lastTopicId);
  return { agenda, touched: [...touched], recognized, unsupported };
}
