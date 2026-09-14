import { prisma } from "@/lib/prisma";

function splitList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export type RouterV2BusinessKnowledge = {
  businessName: string;
  currencySymbol: string;
  supportHours: string;
  storeAddress: string;
  retailStoreUrl: string;
  wholesaleCatalogUrl: string | null;
  paymentMethods: string[];
  deliveryMethods: string[];
};

export async function getRouterV2BusinessKnowledge(): Promise<RouterV2BusinessKnowledge> {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: 1 },
    select: {
      businessName: true,
      currencySymbol: true,
      supportHours: true,
      storeAddress: true,
    },
  });

  return {
    businessName: settings?.businessName ?? "Importaciones Super",
    currencySymbol: settings?.currencySymbol ?? "S/",
    supportHours: settings?.supportHours ?? "",
    storeAddress: settings?.storeAddress ?? "",
    retailStoreUrl:
      process.env.ROUTER_V2_RETAIL_STORE_URL?.trim() ||
      "https://tiendavirtualsuper.com",
    wholesaleCatalogUrl:
      process.env.ROUTER_V2_WHOLESALE_CATALOG_URL?.trim() || null,
    paymentMethods: splitList(process.env.ROUTER_V2_PAYMENT_METHODS),
    deliveryMethods: splitList(process.env.ROUTER_V2_DELIVERY_METHODS),
  };
}
