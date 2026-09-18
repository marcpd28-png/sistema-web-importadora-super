import { z } from "zod";
import type { RequestAgenda } from "./bc-request-agenda";
import { normalizeCommercialText } from "./commercial-query";

const aliasSchema = z.object({
  phrase: z.string().min(3).max(240), code: z.string().min(1).max(64),
  confirmedAt: z.string().datetime(), confirmations: z.number().int().positive(),
  conversationId: z.string(), sourceMessageIds: z.array(z.string()).min(1).max(100),
});
export const customerMemorySchema = z.object({
  version: z.literal(1), aliases: z.array(aliasSchema).max(100),
  questions: z.array(z.object({ kind: z.string(), fields: z.array(z.string()), count: z.number().int().positive(), lastAskedAt: z.string().datetime() })).max(50),
});
export type CustomerMemory = z.infer<typeof customerMemorySchema>;
export const emptyCustomerMemory = (): CustomerMemory => ({ version: 1, aliases: [], questions: [] });
export function readCustomerMemory(value: unknown): CustomerMemory {
  const result = customerMemorySchema.safeParse(value);
  return result.success ? result.data : emptyCustomerMemory();
}

const normalizePhrase = (value: string) => normalizeCommercialText(value).replace(/\s+/g, " ").trim();
const validPhrase = (value: string) => value.length >= 3 && value.length <= 240 && !/https?:|@|\d{7,}/.test(value);

/** Learn only a customer's explicit choice from a previously displayed list. */
export function learnCustomerMemory(input: {
  memory: CustomerMemory; previous: RequestAgenda; next: RequestAgenda;
  conversationId: string; messages: { messageId: string; content: string }[]; now?: Date;
}): CustomerMemory {
  const now = (input.now ?? new Date()).toISOString();
  const memory = structuredClone(input.memory);
  for (const topic of input.next.topics) {
    const previous = input.previous.topics.find(old => old.id === topic.id);
    const code = topic.selectedCode;
    if (!code || !previous || previous.imageReference || previous.selectedCode === code) continue;
    const phrase = normalizePhrase(previous.query);
    if (!validPhrase(phrase) || phrase === normalizePhrase(code)) continue;
    const confirmations = input.messages.filter(message => {
      const text = normalizePhrase(message.content);
      if (text === `me refiero a ${normalizePhrase(code)}`) return true;
      if (!previous.shownCodes.includes(code)) return false;
      // Exact code choices cannot accidentally learn a negation or a different product request.
      if ([normalizePhrase(code), `el ${normalizePhrase(code)}`, `quiero ${normalizePhrase(code)}`].includes(text)) return true;
      const ordinal = text.match(/^(?:el|la) (primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta|\d+)$/);
      if (!ordinal) return false;
      const groups = input.previous.topics.flatMap(old => old.shownGroups?.length ? old.shownGroups : [{ codes: old.shownCodes }]).filter(group => group.codes.length);
      if (groups.length !== 1) return false;
      const word = ["primero", "primera", "segundo", "segunda", "tercero", "tercera", "cuarto", "cuarta", "quinto", "quinta"].indexOf(ordinal[1]);
      const index = word < 0 ? Number(ordinal[1]) - 1 : Math.floor(word / 2);
      return groups[0].codes[index] === code;
    });
    if (!confirmations.length) continue;
    const existing = memory.aliases.find(alias => alias.phrase === phrase && alias.code === code);
    const evidence = { phrase, code, confirmedAt: now, confirmations: (existing?.confirmations ?? 0) + 1,
      conversationId: input.conversationId, sourceMessageIds: confirmations.map(message => message.messageId).slice(-100) };
    memory.aliases = [...memory.aliases.filter(alias => alias !== existing), evidence].slice(-100);
  }
  // Keep intent/field counts, never historical prices, answers or free-form personal data.
  const observed = new Set<string>();
  const sourceIds = new Set(input.messages.map(message => message.messageId));
  for (const job of input.next.requests) {
    if (!job.sourceMessageIds.some(id => sourceIds.has(id)) || job.status === "CANCELLED") continue;
    const fields = [...new Set(job.fields)].sort();
    const key = `${job.kind}:${fields.join(",")}`;
    if (observed.has(key)) continue;
    observed.add(key);
    const old = memory.questions.find(value => value.kind === job.kind && value.fields.join(",") === fields.join(","));
    memory.questions = [...memory.questions.filter(value => value !== old), { kind: job.kind, fields, count: (old?.count ?? 0) + 1, lastAskedAt: now }].slice(-50);
  }
  return customerMemorySchema.parse(memory);
}

/** A memory is a reference only: the caller must resolve it against today's visible catalog. */
export function recallCustomerProduct(memory: CustomerMemory, phrase: string, now = new Date()) {
  const key = normalizePhrase(phrase);
  const candidates = memory.aliases.filter(alias => alias.phrase === key &&
    now.getTime() - Date.parse(alias.confirmedAt) <= 180 * 86400000 && Date.parse(alias.confirmedAt) <= now.getTime());
  const codes = [...new Set(candidates.map(alias => alias.code))];
  return codes.length === 1 ? codes[0] : null;
}

export function frequentCustomerFields(memory: CustomerMemory, now = new Date()) {
  return [...new Set(memory.questions.filter(question => question.kind === "INFORMATION" && question.count >= 2 &&
    now.getTime() - Date.parse(question.lastAskedAt) <= 180 * 86400000 && Date.parse(question.lastAskedAt) <= now.getTime())
    .sort((a, b) => b.count - a.count).flatMap(question => question.fields))].slice(0, 3);
}
