import type { RouterV2ProductInformation } from "@/lib/router-v2-product-information";
import type { RouterV2ResponsePlan } from "@/lib/router-v2-response-plan";
import type { RouterV2VisualResolution } from "@/lib/router-v2-visual-product-resolver";

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

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

export function buildRouterV2ResponseContext(input: {
  customerMessage: string;
  responsePlan: RouterV2ResponsePlan;
  state: SalesStateLike | null;
  commercialPrice: CommercialPriceLike;
  productInformation?: RouterV2ProductInformation | null;
  productSpecification?: { name: string; value: string } | null;
  visualResolution?: RouterV2VisualResolution | null;
}) {
  const price =
    input.commercialPrice?.status === "READY"
      ? input.commercialPrice
      : null;
  const product = input.productInformation ?? null;

  return {
    customerMessage: input.customerMessage,
    answerType: input.responsePlan.answerType,
    resumeAction: input.responsePlan.resumeAction,

    sales: {
      stage: input.state?.stage ?? null,
      purchaseIntent: input.state?.purchaseIntent ?? false,
      productCode:
        product?.code ??
        price?.product.code ??
        input.state?.selectedProductCode ??
        null,
      productName: product?.name ?? price?.product.name ?? null,
      category:
        product?.category ??
        price?.product.category ??
        input.state?.category ??
        null,
      brand:
        product?.brand ??
        price?.product.brand ??
        input.state?.brand ??
        null,
      quantity: price?.quantity ?? input.state?.quantity ?? null,
      unitPrice:
        price?.unitPrice ??
        input.state?.unitPrice ??
        product?.unitPrice ??
        null,
      priceTier: price?.priceTier ?? input.state?.priceTier ?? null,
      total: price?.total ?? input.state?.total ?? null,
      customerCity: readString(input.state?.customerData, "city"),
      deliveryMethod: readString(input.state?.deliveryData, "method"),
    },

    product: product
      ? {
          description: product.description,
          technicalSpecs: product.technicalSpecs,
          available: product.available,
          wholesalePrice: product.wholesalePrice,
          wholesaleMinQty: product.wholesaleMinQty,
          specifications: product.specifications,
          matchedSpecification: input.productSpecification ?? null,
          variants: product.variants,
          documents: product.documents,
        }
      : null,

    visual: input.visualResolution
      ? {
          status: input.visualResolution.status,
          hints:
            "hints" in input.visualResolution
              ? input.visualResolution.hints
              : null,
        }
      : null,

    constraints: {
      answerCustomerQuestionFirst: true,
      doNotInventPrices: true,
      doNotInventStock: true,
      doNotExposeStockQuantity: true,
      doNotInventSpecifications: true,
      doNotAssumeImageIdentity: true,
      preserveSelectedProduct: true,
      followResumeActionExactly: true,
    },
  };
}
