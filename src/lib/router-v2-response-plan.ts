export type RouterV2ResponsePlan = {
  answerType:
    | "HUMAN_HANDOFF"
    | "CATALOG"
    | "LOGISTICS"
    | "PAYMENT"
    | "ORDER_STATUS"
    | "PRODUCT_CLARIFICATION"
    | "VARIANT_OPTIONS"
    | "VARIANT_CLARIFICATION"
    | "PRODUCT_CONFIRMED"
    | "PRICE_SUMMARY"
    | "SALES_CONTINUE";

  resumeAction:
    | "NONE"
    | "ASK_PRODUCT"
    | "ASK_VARIANT"
    | "ASK_QUANTITY"
    | "ASK_PURCHASE_CONFIRMATION"
    | "OFFER_PAYMENT_METHODS"
    | "CONTINUE_SALES_FLOW";
};

type SalesStateLike = {
  stage?: string | null;
  purchaseIntent?: boolean;
  selectedProductCode?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  priceTier?: string | null;
  total?: number | null;
};

function salesResumeAction(
  state: SalesStateLike | null,
): RouterV2ResponsePlan["resumeAction"] {
  if (!state) return "CONTINUE_SALES_FLOW";

  if (state.stage === "AWAITING_PRODUCT_QUERY")
    return "ASK_PRODUCT";

  if (state.stage === "AWAITING_MODEL_SELECTION")
    return "ASK_VARIANT";

  if (state.stage === "AWAITING_QUANTITY")
    return "ASK_QUANTITY";

  if (state.stage === "AWAITING_PURCHASE_CONFIRMATION")
    return "ASK_PURCHASE_CONFIRMATION";

  if (
    state.stage === "AWAITING_PRICE_CONFIRMATION" &&
    state.purchaseIntent === true &&
    state.selectedProductCode &&
    state.quantity &&
    state.unitPrice !== null &&
    state.unitPrice !== undefined &&
    state.total !== null &&
    state.total !== undefined
  ) {
    return "OFFER_PAYMENT_METHODS";
  }

  return "CONTINUE_SALES_FLOW";
}

export function buildRouterV2ResponsePlan(input: {
  finalAction: string;
  state: SalesStateLike | null;
}): RouterV2ResponsePlan {
  const resumeAction = salesResumeAction(input.state);

  if (input.finalAction === "HUMAN_HANDOFF") {
    return {
      answerType: "HUMAN_HANDOFF",
      resumeAction: "NONE",
    };
  }

  if (input.finalAction === "SEND_CATALOG") {
    return {
      answerType: "CATALOG",
      resumeAction,
    };
  }

  if (input.finalAction === "ANSWER_LOGISTICS") {
    return {
      answerType: "LOGISTICS",
      resumeAction,
    };
  }

  if (input.finalAction === "ANSWER_PAYMENT") {
    return {
      answerType: "PAYMENT",
      resumeAction,
    };
  }

  if (input.finalAction === "ANSWER_ORDER_STATUS") {
    return {
      answerType: "ORDER_STATUS",
      resumeAction: "NONE",
    };
  }

  if (input.finalAction === "ASK_PRODUCT_CLARIFICATION") {
    return {
      answerType: "PRODUCT_CLARIFICATION",
      resumeAction: "ASK_PRODUCT",
    };
  }

  if (input.finalAction === "ASK_VARIANT") {
    return {
      answerType: "VARIANT_OPTIONS",
      resumeAction: "ASK_VARIANT",
    };
  }

  if (input.finalAction === "ASK_VARIANT_CLARIFICATION") {
    return {
      answerType: "VARIANT_CLARIFICATION",
      resumeAction: "ASK_VARIANT",
    };
  }

  if (input.finalAction === "PRODUCT_CONFIRMED") {
    return {
      answerType:
        input.state?.stage === "AWAITING_PRICE_CONFIRMATION"
          ? "PRICE_SUMMARY"
          : "PRODUCT_CONFIRMED",
      resumeAction,
    };
  }

  if (
    input.state?.stage === "AWAITING_PRICE_CONFIRMATION" &&
    resumeAction === "OFFER_PAYMENT_METHODS"
  ) {
    return {
      answerType: "PRICE_SUMMARY",
      resumeAction,
    };
  }

  return {
    answerType: "SALES_CONTINUE",
    resumeAction,
  };
}
