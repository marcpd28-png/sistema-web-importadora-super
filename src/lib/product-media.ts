export const GENERIC_PRODUCT_PHOTO_MARKERS = [
  "imagen-no-disponible",
  "no-image",
  "placeholder",
  "sin-foto",
];

export function isGenericProductMediaUrl(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  return GENERIC_PRODUCT_PHOTO_MARKERS.some((marker) => normalized.includes(marker));
}

export type ProductMediaSource = {
  localImageUrl?: string | null;
  imageUrl?: string | null;
  media?: Array<{ url: string; type?: string }>;
};

export function isRealProductPhotoUrl(value: string | null | undefined) {
  // Accept the same URL prefixes as the database filters. Blank values, generic
  // ERP artwork and video-only galleries must never unlock public visibility.
  return Boolean(value && /^(https?:\/\/|\/)/i.test(value) && !isGenericProductMediaUrl(value));
}

export function hasRealProductPhoto(product: ProductMediaSource) {
  return Boolean(getPreferredProductImageUrl(product));
}

export function getPreferredProductImageUrl(product: ProductMediaSource) {
  const localImageUrl = product.localImageUrl ?? "";

  if (isRealProductPhotoUrl(localImageUrl)) {
    return localImageUrl.trim();
  }

  const mediaUrl = product.media?.find((item) => {
    return item.type !== "VIDEO" && isRealProductPhotoUrl(item.url);
  })?.url;

  if (mediaUrl) {
    return mediaUrl.trim();
  }

  const imageUrl = product.imageUrl ?? "";

  if (isRealProductPhotoUrl(imageUrl)) {
    return imageUrl.trim();
  }

  return null;
}
