import { intents, type RockyPlan } from "./contracts";
import { redactSensitiveText } from "./guardrails";

export type ReviewedExample = { question: string; intent: RockyPlan["intent"] };
export const PLANNING_APPROVAL = "APPROVED_FOR_PLANNING";
export function exampleQuestion(value: string) {
  return redactSensitiveText(value).replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[correo]")
    .replace(/(?:\+?\d[\s().-]*){7,}/g, "[número]").slice(0, 240);
}
const words = (text: string) => new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 2 && !["para", "por", "con", "que", "una", "del", "los", "las", "hola", "favor"].includes(w)) || []);
/** Only the separately reviewed intent is reused; corrected commercial prose never enters the planner. */
export function selectReviewedExamples(query: string, rows: { status: string; outcome: string | null; question: string }[]): ReviewedExample[] {
  const tokens = words(query);
  const ranked = rows.flatMap(row => {
    const intent = row.outcome?.replace(/^PLANNER:/, "") as RockyPlan["intent"];
    if (row.status !== PLANNING_APPROVAL || !row.outcome?.startsWith("PLANNER:") || !intents.includes(intent)) return [];
    const question = exampleQuestion(row.question);
    const other = words(question);
    const overlap = [...tokens].filter(w => other.has(w)).length;
    const score = overlap / Math.max(tokens.size, other.size, 1);
    return overlap >= 2 && score >= 0.6 ? [{ question, intent, score }] : [];
  }).sort((a, b) => b.score - a.score);
  // Conflicting annotations are not silently resolved by recency.
  if (new Set(ranked.filter(r => r.score === ranked[0]?.score).map(r => r.intent)).size > 1) return [];
  return [...new Map(ranked.map(row => [row.question, row])).values()].slice(0, 3).map(({ question, intent }) => ({ question, intent }));
}
