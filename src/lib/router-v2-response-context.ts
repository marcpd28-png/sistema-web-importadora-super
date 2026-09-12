import type { RouterV2ResponsePlan } from "@/lib/router-v2-response-plan";

type SalesStateLike = {
  stage?: string | null;
  category?: string | null;
  brand?: string | null;
  purchaseIntent?: boolean;
  selectedProductCode?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  priceTier?: string | null;
  total?: number | null;
  customerData?: unknown;
  deliveryData?: unknown;
};

type CommercialPriceLike =
  | {
      status: "READY";
      product: {
        code: string;
        name: string;
        brand?: string | null;
        category?: string | null;
      };
      quantity: number;
      priceTier: string;
      unitPrice: number;
      total: number;
      wholesaleMinQty: number;
    }
  | {
      status: "NOT_FOUND";
      productCode: string;
      quantity: number;
    }
  | null;

function readString(
  value: unknown,
  key: string,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const field =
    (value as Record<string, unknown>)[key];

  return typeof field === "string"
    ? field
    : null;
}

export function buildRouterV2ResponseContext(input: {
  customerMessage: string;
  responsePlan: RouterV2ResponsePlan;
  state: SalesStateLike | null;
  commercialPrice: CommercialPriceLike;
}) {
  const price =
    input.commercialPrice?.status === "READY"
      ? input.commercialPrice
      : null;

  return {
    customerMessage: input.customerMessage,

    answerType:
      input.responsePlan.answerType,

    resumeAction:
      input.responsePlan.resumeAction,

    sales: {
      stage: input.state?.stage ?? null,
      purchaseIntent:
        input.state?.purchaseIntent ?? false,

      productCode:
        price?.product.code ??
        input.state?.selectedProductCode ??
        null,

      productName:
        price?.product.name ?? null,

      category:
        price?.product.category ??
        input.state?.category ??
        null,

      brand:
        price?.product.brand ??
        input.state?.brand ??
        null,

      quantity:
        price?.quantity ??
        input.state?.quantity ??
        null,

      unitPrice:
        price?.unitPrice ??
        input.state?.unitPrice ??
        null,

      priceTier:
        price?.priceTier ??
        input.state?.priceTier ??
        null,

      total:
        price?.total ??
        input.state?.total ??
        null,

      customerCity:
        readString(
          input.state?.customerData,
          "city",
        ),

      deliveryMethod:
        readString(
          input.state?.deliveryData,
          "method",
        ),
    },

    constraints: {
      answerCustomerQuestionFirst: true,
      doNotInventPrices: true,
      doNotInventStock: true,
      doNotExposeStockQuantity: true,
      preserveSelectedProduct: true,
      followResumeActionExactly: true,
    },
  };
}
