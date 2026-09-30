import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { buildPublicUrl } from "./site-url";
import { loadCatalogImage } from "./catalog-pdf";

/** Generated from a catalogue record, never from a client-supplied URL. */
export async function productWhatsAppImage(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: {
    isVisible: true, stockUnits: true, imageUrl: true, sourceImageUrl: true, localImageUrl: true, updatedAt: true,
    media: { where: { type: "IMAGE" }, orderBy: { sortOrder: "asc" }, select: { url: true } },
  } });
  if (!product?.isVisible || product.stockUnits <= 0) return null;
  const urls = [...new Set([product.localImageUrl, ...product.media.map(m => m.url), product.sourceImageUrl, product.imageUrl].filter((url): url is string => Boolean(url)))];
  const hash = createHash("sha256").update(JSON.stringify([productId, product.updatedAt, urls])).digest("hex").slice(0, 24);
  const relative = `/uploads/communications/product-${hash}.jpg`;
  const output = path.join(process.cwd(), "public", relative);
  try { await access(output); return buildPublicUrl(relative); } catch { /* Cache miss. */ }
  for (const url of urls) {
    try {
      const image = await loadCatalogImage(url);
      if (image.length > 5 * 1024 * 1024) continue;
      await mkdir(path.dirname(output), { recursive: true });
      const temporary = `${output}.${randomUUID()}.tmp`;
      await writeFile(temporary, image, { flag: "wx" });
      await rename(temporary, output);
      return buildPublicUrl(relative);
    } catch { /* Try the next catalog source, never send a broken image URL. */ }
  }
  return null;
}
