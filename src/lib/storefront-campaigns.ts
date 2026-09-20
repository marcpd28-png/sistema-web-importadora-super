import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { buildSellableProductWhere } from "@/lib/store-shared";

export const CAMPAIGN_SLUGS = ["ofertas", "preventa"] as const;
export function parseCampaignCodes(value: string) {
  return [...new Set(value.split(/[\n,;]+/).map(code => code.trim()).filter(Boolean))];
}
export const getStorefrontCampaigns = cache(async () => {
  const campaigns = await prisma.storefrontCampaign.findMany();
  return Promise.all(CAMPAIGN_SLUGS.map(async slug => {
    const row = campaigns.find(item => item.slug === slug);
    const codes = row?.productCodes ?? [];
    const products = codes.length ? await prisma.product.findMany({
      where: { AND: [buildSellableProductWhere(), { code: { in: codes } }] }, select: { id: true, code: true },
    }) : [];
    return { slug, enabled: Boolean(row?.enabled), description: row?.description ?? "", productCodes: codes,
      productIds: products.map(p => p.id), visible: Boolean(row?.enabled && products.length), updatedAt: row?.updatedAt.toISOString() ?? "" };
  }));
});
