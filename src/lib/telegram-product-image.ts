import { isGenericProductMediaUrl } from "@/lib/product-media";

/**
 * Public image URLs emitted to the Telegram adapter must always resolve to
 * this exact route. Keeping the product code in the path lets the route look
 * up the product again instead of trusting a URL supplied by a model or an
 * external catalogue.
 */
export const TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX = "/api/telegram/product-image/";

const PRODUCT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const LOCAL_PRODUCT_IMAGE_PATTERN = /^\/uploads\/products\/([A-Za-z0-9][A-Za-z0-9._-]{0,239}\.(?:jpe?g|png|webp))$/i;

export type TelegramProductImageSource = {
  localImageUrl?: string | null;
  media?: Array<{
    type?: string;
    url: string;
  }>;
};

/** Returns a canonical code only when it is safe as one URL path segment. */
export function normalizeTelegramProductImageCode(value: string | null | undefined) {
  const code = value?.trim() ?? "";
  return PRODUCT_CODE_PATTERN.test(code) ? code : null;
}

/**
 * Product photos mirrored by the storefront use a deliberately narrow file
 * name grammar. This prevents the image route from becoming a filesystem
 * proxy, even if a bad catalogue record is ever imported.
 */
export function getVerifiedLocalProductImageFileName(value: string | null | undefined) {
  const raw = value?.trim() ?? "";

  if (!raw || isGenericProductMediaUrl(raw)) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  return LOCAL_PRODUCT_IMAGE_PATTERN.exec(decoded)?.[1] ?? null;
}

/** Select only a real local product image; remote originals never qualify. */
export function getVerifiedLocalProductImageFileNameFromProduct(
  product: TelegramProductImageSource,
) {
  const candidates = [
    product.localImageUrl,
    ...(product.media ?? [])
      .filter((item) => item.type === "IMAGE")
      .map((item) => item.url),
  ];

  for (const candidate of candidates) {
    const fileName = getVerifiedLocalProductImageFileName(candidate);
    if (fileName) return fileName;
  }

  return null;
}

/**
 * Build a relative, own-origin URL only for a catalog product that has a
 * verified local image. The Telegram bridge expands this relative URL to the
 * fixed public storefront host and rejects all other API paths.
 */
export function getTelegramProductImageUrl(
  code: string | null | undefined,
  product: TelegramProductImageSource,
) {
  const normalizedCode = normalizeTelegramProductImageCode(code);

  if (!normalizedCode || !getVerifiedLocalProductImageFileNameFromProduct(product)) {
    return null;
  }

  return `${TELEGRAM_PRODUCT_IMAGE_PATH_PREFIX}${encodeURIComponent(normalizedCode)}`;
}
