import sharp, { type Metadata, type Sharp } from "sharp";

const PRODUCT_IMAGE_TRIM_THRESHOLD = 10;

function shouldTrimImage(metadata: Metadata) {
  const pages = metadata.pages ?? 1;
  const format = metadata.format ?? "";

  return pages === 1 && format !== "svg";
}

export async function createNormalizedProductImage(buffer: Buffer): Promise<Sharp> {
  let image = sharp(buffer, { animated: true }).rotate();
  const metadata = await image.metadata();

  if (shouldTrimImage(metadata)) {
    try {
      image = image.trim({ threshold: PRODUCT_IMAGE_TRIM_THRESHOLD });
    } catch {
      // If trimming is not possible for a specific image, keep the original pipeline.
    }
  }

  return image;
}
