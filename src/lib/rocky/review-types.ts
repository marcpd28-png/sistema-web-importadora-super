/** Evidence from the current deterministic planner; no fabricated confidence score. */
export type ReviewResult = {
  rockyRequestId: string;
  reply: string;
  intent: string;
  requiresHuman: boolean;
  products: Array<{ code: string }>;
};
