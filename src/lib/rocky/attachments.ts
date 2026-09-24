import type { RockyResult } from "./contracts";
import { isRealProductPhotoUrl } from "../product-media";

export function rockyAttachments(result: RockyResult, origin: string) {
  if (result.requiresHuman) return [];
  const attachments: Array<{ messageType: "IMAGE" | "DOCUMENT"; mediaUrl: string; content: string }> = [];
  const absolute = (value: string) => {
    if (value.startsWith("//")) return null;
    try { const url = new URL(value, origin); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
  };
  if (result.catalog?.document) {
    const mediaUrl = absolute(result.catalog.document.url);
    if (mediaUrl) attachments.push({ messageType: "DOCUMENT", mediaUrl, content: result.catalog.document.name });
  }
  if (["PRODUCT_SEARCH", "PRODUCT_DETAILS", "PRODUCT_RECOMMENDATION", "PRODUCT_COMPARISON"].includes(result.intent)) {
    for (const product of result.products.slice(0, 3)) {
      const mediaUrl = product.imageUrl && isRealProductPhotoUrl(product.imageUrl) ? absolute(product.imageUrl) : null;
      if (mediaUrl && !attachments.some(item => item.mediaUrl === mediaUrl)) attachments.push({ messageType: "IMAGE", mediaUrl, content: `${product.name} · ${product.code}` });
    }
  }
  return attachments;
}
