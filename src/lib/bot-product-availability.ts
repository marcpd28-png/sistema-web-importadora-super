import { isGenericProductMediaUrl } from "./product-media";

export type BotProductAvailability = {
  isVisible: boolean;
  stockUnits: number;
  localImageUrl?: string | null;
  sourceImageUrl?: string | null;
  imageUrl?: string | null;
  media?: Array<{ url: string; type?: string }>;
};

/** Only actual product photos count; video and placeholder URLs are not photos. */
export function getBotProductImageUrls(product: Omit<BotProductAvailability, "isVisible" | "stockUnits">) {
  return [...new Set([
    product.localImageUrl,
    ...(product.media ?? []).filter(item => !item.type || item.type === "IMAGE").map(item => item.url),
    product.sourceImageUrl,
    product.imageUrl,
  ].map(value => value?.trim()).filter((value): value is string => Boolean(value) && !isGenericProductMediaUrl(value)))];
}

export function isBotProductAvailable(product: BotProductAvailability) {
  return product.isVisible && product.stockUnits > 0 && getBotProductImageUrls(product).length > 0;
}
