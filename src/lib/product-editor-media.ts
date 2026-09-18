import { isRealProductPhotoUrl } from "@/lib/product-media";

type EditableMedia = { type: "IMAGE" | "VIDEO"; url: string; altText?: string; sortOrder: number };

export function preserveProductCoverInGallery(coverUrl: string | null | undefined, media: EditableMedia[]): EditableMedia[] {
  const url = coverUrl?.trim();
  if (!url || !isRealProductPhotoUrl(url)) return media;

  // ERP sync owns the cover fields but leaves the manually edited gallery intact.
  // Saving the cover there keeps uploaded photos available after any sync mode.
  const existing = media.find((item) => item.type === "IMAGE" && item.url === url);
  return [
    existing ?? { type: "IMAGE" as const, url, altText: "Foto del producto", sortOrder: 0 },
    ...media.filter((item) => item !== existing),
  ].map((item, sortOrder) => ({ ...item, sortOrder }));
}
