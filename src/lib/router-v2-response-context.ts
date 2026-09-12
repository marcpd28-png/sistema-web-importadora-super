import type { RouterV2BusinessKnowledge } from "@/lib/router-v2-business-knowledge";
import type { RouterV2CatalogDecision } from "@/lib/router-v2-catalog-flow";
import type { RouterV2CheckoutStep } from "@/lib/router-v2-checkout-flow";
import type { RouterV2ProductInformation } from "@/lib/router-v2-product-information";
import type { RouterV2RetailProduct } from "@/lib/router-v2-retail-discovery";
import type { RouterV2ResponsePlan } from "@/lib/router-v2-response-plan";
import type { RouterV2VisualResolution } from "@/lib/router-v2-visual-product-resolver";

type SalesStateLike = {
  stage?: string | null;
  category?: string | null;
  brand?: string | null;
  purchaseIntent?: boolean;
  shownProducts?: unknown;
  selectedProductCode?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  priceTier?: string | null;
  total?: number | null;
  customerData?: unknown;
  documentData?: unknown;
  deliveryData?: unknown;
  paymentData?: unknown;
  orderNumber?: string | null;
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

type OrderStatusLike =
  | {
      orderNumber: string | null;
      status: string;
      paymentMethod: string | null;
      deliveryType: string | null;
      total: number;
      createdAt: Date;
      updatedAt: Date;
    }
  | null;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function readBoolean(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "boolean" ? field : null;
}

function readShownProducts(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => item as Record<string, unknown>)
    .filter((item) => typeof item.code === "string" && typeof item.name === "string")
    .map((item) => ({
      position: typeof item.position === "number" ? item.position : null,
      code: item.code as string,
      name: item.name as string,
      brand: typeof item.brand === "string" ? item.brand : null,
      slug: typeof item.slug === "string" ? item.slug : null,
      unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    }));
}

export function buildRouterV2ResponseContext(input: {
  customerMessage: string;
  responsePlan: RouterV2ResponsePlan;
  state: SalesStateLike | null;
  commercialPrice: CommercialPriceLike;
  productInformation?: RouterV2ProductInformation | null;
  productSpecification?: { name: string; value: string } | null;
  visualResolution?: RouterV2VisualResolution | null;
  businessKnowledge?: RouterV2BusinessKnowledge | null;
  catalogDecision?: RouterV2CatalogDecision | null;
  retailProducts?: RouterV2RetailProduct[];
  checkoutStep?: RouterV2CheckoutStep;
  orderStatus?: OrderStatusLike;
}) {
  const price =
    input.commercialPrice?.status === "READY"
      ? input.commercialPrice
      : null;
  const product = input.productInformation ?? null;
  const business = input.businessKnowledge ?? null;

  return {
    customerMessage: input.customerMessage,
    answerType: input.responsePlan.answerType,
    resumeAction: input.responsePlan.resumeAction,
    checkoutStep: input.checkoutStep ?? null,

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
      shownProducts: readShownProducts(input.state?.shownProducts),
      customerName: readString(input.state?.customerData, "name"),
      customerPhone: readString(input.state?.customerData, "phone"),
      customerCity: readString(input.state?.customerData, "city"),
      shoppingMode: readString(input.state?.customerData, "shoppingMode"),
      catalogPending: readBoolean(input.state?.customerData, "catalogPending"),
      documentType: readString(input.state?.documentData, "type"),
      documentNumber: readString(input.state?.documentData, "number"),
      deliveryMethod: readString(input.state?.deliveryData, "method"),
      deliveryDetails: readString(input.state?.deliveryData, "details"),
      paymentMethod: readString(input.state?.paymentData, "method"),
      paymentEvidenceReceived:
        readBoolean(input.state?.paymentData, "evidenceReceived") ?? false,
      paymentVerified:
        readBoolean(input.state?.paymentData, "verified") ?? false,
      orderNumber: input.state?.orderNumber ?? null,
    },

    product: product
      ? {
          slug: product.slug,
          imageUrl: product.imageUrl,
          media: product.media,
          description: product.description,
          descriptionShort: product.descriptionShort,
          descriptionFull: product.descriptionFull,
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

    catalog: {
      decision: input.catalogDecision?.action ?? "NONE",
      shoppingMode: input.catalogDecision?.mode ?? null,
      wholesaleCatalogUrl: business?.wholesaleCatalogUrl ?? null,
      retailStoreUrl: business?.retailStoreUrl ?? null,
      retailProducts: input.retailProducts ?? [],
    },

    business: business
      ? {
          businessName: business.businessName,
          currencySymbol: business.currencySymbol,
          supportHours: business.supportHours,
          storeAddress: business.storeAddress,
          paymentMethods: business.paymentMethods,
          deliveryMethods: business.deliveryMethods,
        }
      : null,

    order: input.orderStatus
      ? {
          orderNumber: input.orderStatus.orderNumber,
          status: input.orderStatus.status,
          paymentMethod: input.orderStatus.paymentMethod,
          deliveryType: input.orderStatus.deliveryType,
          total: input.orderStatus.total,
          createdAt: input.orderStatus.createdAt.toISOString(),
          updatedAt: input.orderStatus.updatedAt.toISOString(),
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
      doNotInventBusinessPolicies: true,
      doNotAssumeImageIdentity: true,
      doNotMarkPaymentVerifiedFromVoucher: true,
      preserveSelectedProduct: true,
      followResumeActionExactly: true,
    },
  };
}
