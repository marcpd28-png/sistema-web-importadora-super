import sharp from "sharp";

/** Messaging photos preserve the complete frame and use JPEG, not catalog WebP variants. */
export async function prepareMessageImage(input: Buffer) {
  const image = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  if (image.data.length > 5 * 1024 * 1024) throw new Error("La imagen preparada supera 5 MB.");
  return { data: image.data, width: image.info.width, height: image.info.height };
}
