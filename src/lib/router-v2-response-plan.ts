import type { RouterV2CatalogDecision } from "@/lib/router-v2-catalog-flow";
import type { RouterV2CheckoutStep } from "@/lib/router-v2-checkout-flow";
import type { RouterV2ProductQuestionKind } from "@/lib/router-v2-product-question";

export type RouterV2AnswerType =
  | "HUMAN_HANDOFF"
  | "CATALOG_PURCHASE_MODE"
  | "WHOLESALE_CATALOG"
  | "RETAIL_DISCOVERY"
  | "CATALOG"
  | "LOGISTICS"
  | "PAYMENT"
  | "DOCUMENT"
  | "ORDER_STATUS"
  | "PRODUCT_CLARIFICATION"
  | "IMAGE_PRODUCT_CLARIFICATION"
  | "VARIANT_OPTIONS"
  | "VARIANT_CLARIFICATION"
  | "PRODUCT_CONFIRMED"
  | "PRODUCT_DETAILS"
  | "PRODUCT_SPECIFICATION"
  | "PRODUCT_PRICE"
  | "PRODUCT_STOCK"
  | "PRODUCT_WHOLESALE"
  | "PRICE_SUMMARY"
  | "PURCHASE_DECLINED"
  | "CHECKOUT_PRICE_CONFIRMATION"
  | "PRICE_CHANGES_REQUESTED"
  | "CHECKOUT_CUSTOMER_DATA"
  | "CHECKOUT_CUSTOMER_PHONE"
  | "CHECKOUT_DOCUMENT_TYPE"
  | "CHECKOUT_DOCUMENT_DATA"
  | "CHECKOUT_DELIVERY_METHOD"
  | "CHECKOUT_DELIVERY_DETAILS"
  | "DELIVERY_METHOD_UNAVAILABLE"
  | "DELIVERY_CONFIGURATION_MISSING"
  | "CHECKOUT_ORDER_CONFIRMATION"
  | "ORDER_CHANGES_REQUESTED"
  | "CHECKOUT_PAYMENT_METHOD"
  | "CHECKOUT_PAYMENT_EVIDENCE"
  | "PAYMENT_EVIDENCE_RECEIVED"
  | "PAYMENT_METHOD_UNAVAILABLE"
  | "PAYMENT_CONFIGURATION_MISSING"
  | "SALES_CONTINUE";

export type RouterV2ResumeAction =
  | "NONE"
  | "ASK_PURCHASE_MODE"
  | "ASK_PRODUCT"
  | "ASK_VARIANT"
  | "ASK_QUANTITY"
  | "ASK_PURCHASE_CONFIRMATION"
  | "ASK_PRICE_CONFIRMATION"
  | "ASK_CUSTOMER_DATA"
  | "ASK_CUSTOMER_PHONE"
  | "ASK_DOCUMENT_TYPE"
  | "ASK_DOCUMENT_DATA"
  | "ASK_DELIVERY_METHOD"
  | "ASK_DELIVERY_DETAILS"
  | "ASK_ORDER_CONFIRMATION"
  | "ASK_PAYMENT_METHOD"
  | "ASK_PAYMENT_EVIDENCE"
  | "CONTINUE_SALES_FLOW";

export type RouterV2ResponsePlan = {
  answerType: RouterV2AnswerType;
  resumeAction: RouterV2ResumeAction;
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
): RouterV2ResumeAction {
  if (!state) return "CONTINUE_SALES_FLOW";

  if (state.stage === "AWAITING_PRODUCT_QUERY") return "ASK_PRODUCT";
  if (state.stage === "AWAITING_MODEL_SELECTION") return "ASK_VARIANT";
  if (state.stage === "AWAITING_QUANTITY") return "ASK_QUANTITY";
  if (state.stage === "AWAITING_PURCHASE_CONFIRMATION") {
    return "ASK_PURCHASE_CONFIRMATION";
  }
  if (state.stage === "AWAITING_PRICE_CONFIRMATION") {
    return "ASK_PRICE_CONFIRMATION";
  }
  if (state.stage === "AWAITING_CUSTOMER_DATA") return "ASK_CUSTOMER_DATA";
  if (state.stage === "AWAITING_DOCUMENT_TYPE") return "ASK_DOCUMENT_TYPE";
  if (state.stage === "AWAITING_DOCUMENT_DATA") return "ASK_DOCUMENT_DATA";
  if (state.stage === "AWAITING_DELIVERY_METHOD") return "ASK_DELIVERY_METHOD";
  if (state.stage === "AWAITING_DELIVERY_DETAILS") return "ASK_DELIVERY_DETAILS";
  if (state.stage === "AWAITING_ORDER_CONFIRMATION") {
    return "ASK_ORDER_CONFIRMATION";
  }
  if (state.stage === "AWAITING_PAYMENT_METHOD") return "ASK_PAYMENT_METHOD";
  if (state.stage === "AWAITING_PAYMENT_CONFIRMATION") {
    return "ASK_PAYMENT_EVIDENCE";
  }
  if (state.stage === "ORDER_CREATED" || state.stage === "COMPLETED") {
    return "NONE";
  }

  return "CONTINUE_SALES_FLOW";
}

function productQuestionAnswerType(
  question: RouterV2ProductQuestionKind,
): RouterV2AnswerType | null {
  if (question === "DETAILS") return "PRODUCT_DETAILS";
  if (question === "SPECIFICATION") return "PRODUCT_SPECIFICATION";
  if (question === "PRICE") return "PRODUCT_PRICE";
  if (question === "STOCK") return "PRODUCT_STOCK";
  if (question === "WHOLESALE") return "PRODUCT_WHOLESALE";
  return null;
}

function checkoutAnswerType(step: RouterV2CheckoutStep): RouterV2AnswerType | null {
  if (step === "PURCHASE_DECLINED") return "PURCHASE_DECLINED";
  if (step === "ASK_PRICE_CONFIRMATION") return "CHECKOUT_PRICE_CONFIRMATION";
  if (step === "PRICE_CHANGES_REQUESTED") return "PRICE_CHANGES_REQUESTED";
  if (step === "ASK_CUSTOMER_DATA") return "CHECKOUT_CUSTOMER_DATA";
  if (step === "ASK_CUSTOMER_PHONE") return "CHECKOUT_CUSTOMER_PHONE";
  if (step === "ASK_DOCUMENT_TYPE") return "CHECKOUT_DOCUMENT_TYPE";
  if (step === "ASK_DOCUMENT_DATA") return "CHECKOUT_DOCUMENT_DATA";
  if (step === "ASK_DELIVERY_METHOD") return "CHECKOUT_DELIVERY_METHOD";
  if (step === "ASK_DELIVERY_DETAILS") return "CHECKOUT_DELIVERY_DETAILS";
  if (step === "DELIVERY_METHOD_UNAVAILABLE") return "DELIVERY_METHOD_UNAVAILABLE";
  if (step === "DELIVERY_CONFIGURATION_MISSING") {
    return "DELIVERY_CONFIGURATION_MISSING";
  }
  if (step === "ASK_ORDER_CONFIRMATION") return "CHECKOUT_ORDER_CONFIRMATION";
  if (step === "ORDER_CHANGES_REQUESTED") return "ORDER_CHANGES_REQUESTED";
  if (step === "ASK_PAYMENT_METHOD") return "CHECKOUT_PAYMENT_METHOD";
  if (step === "ASK_PAYMENT_EVIDENCE") return "CHECKOUT_PAYMENT_EVIDENCE";
  if (step === "PAYMENT_EVIDENCE_RECEIVED") return "PAYMENT_EVIDENCE_RECEIVED";
  if (step === "PAYMENT_METHOD_UNAVAILABLE") return "PAYMENT_METHOD_UNAVAILABLE";
  if (step === "PAYMENT_CONFIGURATION_MISSING") {
    return "PAYMENT_CONFIGURATION_MISSING";
  }
  return null;
}

export function buildRouterV2ResponsePlan(input: {
  finalAction: string;
  state: SalesStateLike | null;
  productQuestion?: RouterV2ProductQuestionKind;
  productInformationAvailable?: boolean;
  visualResolutionStatus?: string | null;
  catalogDecision?: RouterV2CatalogDecision | null;
  checkoutStep?: RouterV2CheckoutStep;
  checkoutConsumed?: boolean;
}): RouterV2ResponsePlan {
  const resumeAction = salesResumeAction(input.state);

  if (input.finalAction === "HUMAN_HANDOFF") {
    return { answerType: "HUMAN_HANDOFF", resumeAction: "NONE" };
  }

  if (input.catalogDecision?.action === "ASK_PURCHASE_MODE") {
    return {
      answerType: "CATALOG_PURCHASE_MODE",
      resumeAction: "ASK_PURCHASE_MODE",
    };
  }

  if (input.catalogDecision?.action === "SEND_WHOLESALE_CATALOG") {
    return {
      answerType: "WHOLESALE_CATALOG",
      resumeAction: "CONTINUE_SALES_FLOW",
    };
  }

  if (input.catalogDecision?.action === "START_RETAIL_DISCOVERY") {
    return {
      answerType: "RETAIL_DISCOVERY",
      resumeAction:
        input.state?.stage === "AWAITING_MODEL_SELECTION"
          ? "ASK_VARIANT"
          : "ASK_PRODUCT",
    };
  }

  const productAnswerType = productQuestionAnswerType(
    input.productQuestion ?? null,
  );

  if (productAnswerType && input.productInformationAvailable) {
    return {
      answerType: productAnswerType,
      resumeAction,
    };
  }

  const checkoutType = checkoutAnswerType(input.checkoutStep ?? null);
  if (checkoutType && input.checkoutConsumed) {
    return {
      answerType: checkoutType,
      resumeAction:
        input.checkoutStep === "ASK_CUSTOMER_PHONE"
          ? "ASK_CUSTOMER_PHONE"
          : resumeAction,
    };
  }

  if (input.finalAction === "ANSWER_LOGISTICS") {
    return { answerType: "LOGISTICS", resumeAction };
  }

  if (input.finalAction === "ANSWER_PAYMENT") {
    return { answerType: "PAYMENT", resumeAction };
  }

  if (input.finalAction === "ANSWER_DOCUMENT") {
    return { answerType: "DOCUMENT", resumeAction };
  }

  if (input.finalAction === "ANSWER_ORDER_STATUS") {
    return { answerType: "ORDER_STATUS", resumeAction: "NONE" };
  }

  if (input.finalAction === "SEND_CATALOG") {
    return { answerType: "CATALOG", resumeAction };
  }

  if (checkoutType) {
    return {
      answerType: checkoutType,
      resumeAction:
        input.checkoutStep === "ASK_CUSTOMER_PHONE"
          ? "ASK_CUSTOMER_PHONE"
          : resumeAction,
    };
  }

  if (input.finalAction === "ASK_PRODUCT_CLARIFICATION") {
    const fromImage =
      input.visualResolutionStatus === "NO_IMAGE_HINTS" ||
      input.visualResolutionStatus === "LOW_CONFIDENCE" ||
      input.visualResolutionStatus === "NOT_FOUND";

    return {
      answerType: fromImage
        ? "IMAGE_PRODUCT_CLARIFICATION"
        : "PRODUCT_CLARIFICATION",
      resumeAction: "ASK_PRODUCT",
    };
  }

  if (input.finalAction === "ASK_VARIANT") {
    return { answerType: "VARIANT_OPTIONS", resumeAction: "ASK_VARIANT" };
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

  if (input.state?.stage === "AWAITING_PRICE_CONFIRMATION") {
    return { answerType: "PRICE_SUMMARY", resumeAction };
  }

  return { answerType: "SALES_CONTINUE", resumeAction };
}
