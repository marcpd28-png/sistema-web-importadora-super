import type { RouterV2Analysis } from "@/lib/conversation-router-v2";

export function applyRouterV2ContextualSlots(input: {
  analysis: RouterV2Analysis;
  content: string;
  stage?: string | null;
}): RouterV2Analysis {
  if (input.analysis.slots.quantity !== undefined) {
    return input.analysis;
  }

  if (input.stage !== "AWAITING_QUANTITY") {
    return input.analysis;
  }

  const match = input.content
    .trim()
    .match(
      /^(\d{1,6})(?:\s*(?:unidad(?:es)?|und(?:s)?|uds?))?$/i,
    );

  if (!match) {
    return input.analysis;
  }

  const quantity = Number(match[1]);

  if (
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 100000
  ) {
    return input.analysis;
  }

  return {
    ...input.analysis,

    intents: input.analysis.intents.includes("QUANTITY")
      ? input.analysis.intents
      : [...input.analysis.intents, "QUANTITY"],

    slots: {
      ...input.analysis.slots,
      quantity,
    },
  };
}
