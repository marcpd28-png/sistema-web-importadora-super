import { createHash } from "node:crypto";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Exact source-photo reuse only. A screenshot, crop or recompression needs visual analysis. */
export function catalogImageContentHash(imageUrl: string) {
  if (imageUrl.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 100) return null;
  const match = imageUrl.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[1].length % 4 !== 0) return null;
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return jpeg || png || webp ? createHash("sha256").update(bytes).digest("hex") : null;
}

export async function matchCatalogSourceImage(
  imageUrl: string,
  findVisibleCodes: (hash: string) => Promise<{ code: string }[]>,
) {
  const hash = catalogImageContentHash(imageUrl);
  if (!hash) return null;
  const matches = await findVisibleCodes(hash);
  // Shared supplier photos cannot disambiguate two different models or variants.
  if (matches.length !== 1) return null;
  return { status: "READY" as const, model: "catalog-source-image-sha256", hints: {
    code: matches[0].code, confidence: 1, visibleText: [] as string[],
  } };
}
