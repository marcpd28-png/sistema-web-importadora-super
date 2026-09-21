import type { RockyResult } from "./contracts";

export function aggregateRuns(runs: RockyResult[]) {
  const counts = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((all, value) => { all[value] = (all[value] || 0) + 1; return all; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 30);
  return {
    evaluatedRuns: runs.length,
    intents: counts(runs.map(r => r.intent)), products: counts(runs.flatMap(r => r.products.map(p => p.code))),
    comparisons: counts(runs.filter(r => r.intent === "PRODUCT_COMPARISON").map(r => r.products.map(p => p.code).sort().join(" / "))),
    noResults: counts(runs.filter(r => r.toolsRequested.includes("searchProducts") && !r.products.length).map(r => r.memory.query)),
    unresolved: counts(runs.filter(r => r.requiresHuman).map(r => r.reasonCode || "UNKNOWN")),
    vocabulary: counts(runs.flatMap(r => r.memory.query.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/\d|@|https?:/.test(w)))),
    phrases: counts(runs.map(r => r.memory.query).filter(q => q.length > 3 && !/\d{7,}|@|https?:/.test(q))),
    objections: counts(runs.filter(r => r.intent.endsWith("OBJECTION")).map(r => r.intent)),
    recommendedProducts: counts(runs.filter(r => r.intent === "PRODUCT_RECOMMENDATION").flatMap(r => r.products.map(p => p.code))),
  };
}
