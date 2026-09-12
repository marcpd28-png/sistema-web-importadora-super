const interruptActions = new Set([
  "HUMAN_HANDOFF",
  "SEND_CATALOG",
  "ANSWER_LOGISTICS",
  "ANSWER_PAYMENT",
  "ANSWER_DOCUMENT",
  "ANSWER_ORDER_STATUS",
]);

export function determineRouterV2FinalAction(input: {
  botEnabled: boolean;
  analysisNextAction: string;
  productDecision?: { action: string } | null;
  productReference?: { status: string } | null;
  canResolveProductReference: boolean;
}) {
  if (!input.botEnabled)
    return "HUMAN_HANDOFF";

  if (interruptActions.has(input.analysisNextAction))
    return input.analysisNextAction;

  if (input.productReference?.status === "SELECTED")
    return "PRODUCT_CONFIRMED";

  if (input.productReference?.status === "AMBIGUOUS")
    return "ASK_VARIANT_CLARIFICATION";

  if (
    input.productReference?.status === "NO_MATCH" &&
    input.canResolveProductReference
  )
    return "ASK_VARIANT";

  if (input.productDecision)
    return input.productDecision.action;

  return input.analysisNextAction;
}
