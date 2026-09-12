import type { RouterV2Analysis } from "@/lib/conversation-router-v2";

function parseContextualQuantity(content: string) {
  const text = content.trim();
  const exact = text.match(
    /^(\d{1,6})(?:\s*(?:unidad(?:es)?|und(?:s)?|uds?))?$/i,
  );
  const conversational = text.match(
    /^(?:mejor|cambia(?:lo)?\s+a|pon(?:me)?|serian|serían|quiero|dame)\s+(\d{1,6})(?:\s*(?:unidad(?:es)?|und(?:s)?|uds?))?[.!]?$/i,
  );
  const match = exact ?? conversational;
  if (!match) return null;

  const quantity = Number(match[1]);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100000) {
    return null;
  }

  return quantity;
}

export function applyRouterV2ContextualSlots(input: {
  analysis: RouterV2Analysis;
  content: string;
  stage?: string | null;
}): RouterV2Analysis {
  if (input.analysis.slots.quantity !== undefined) {
    return input.analysis;
  }

  if (
    input.stage !== "AWAITING_QUANTITY" &&
    input.stage !== "AWAITING_PRICE_CONFIRMATION"
  ) {
    return input.analysis;
  }

  const quantity = parseContextualQuantity(input.content);
  if (quantity === null) return input.analysis;

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
