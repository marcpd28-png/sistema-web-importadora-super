import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  getVerifiedLocalProductImageFileNameFromProduct,
  normalizeTelegramProductImageCode,
  type TelegramProductImageSource,
} from "@/lib/telegram-product-image";

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_OUTPUT_DIMENSION = 1_280;

export type TelegramProductImageRecord = TelegramProductImageSource;

export type TelegramProductImageRouteDependencies = {
  findVisibleProductByCode: (code: string) => Promise<TelegramProductImageRecord | null>;
  productImageRoot?: string;
  readFile?: (filePath: string) => Promise<Buffer>;
  stat?: (filePath: string) => Promise<{
    isFile: () => boolean;
    mtimeMs: number;
    size: number;
  }>;
};

type TelegramProductImageContext = {
  params: Promise<{ code: string }>;
};

function defaultProductImageRoot() {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "public",
    "uploads",
    "products",
  );
}

function notFound() {
  // Do not distinguish a missing product, a malformed catalogue image, or a
  // missing local mirror. Telegram can then continue with the text reply.
  return new Response("Not found", { status: 404 });
}

function imageHeaders(etag: string, size?: number) {
  const headers: Record<string, string> = {
    "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    "Content-Type": "image/jpeg",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (typeof size === "number") {
    headers["Content-Length"] = String(size);
  }

  return headers;
}

async function renderTelegramJpeg(source: Buffer) {
  return sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: MAX_OUTPUT_DIMENSION,
      height: MAX_OUTPUT_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ mozjpeg: true, quality: 82 })
    .toBuffer();
}

/**
 * Creates the public derivative handler used exclusively by Telegram. A
 * caller can never name a filesystem path or an upstream URL: it can only
 * name a visible product code, which is resolved back to that product's own
 * local catalogue image.
 */
export function createTelegramProductImageHandler(
  dependencies: TelegramProductImageRouteDependencies,
) {
  const imageRoot = path.resolve(dependencies.productImageRoot ?? defaultProductImageRoot());
  const getStat = dependencies.stat ?? stat;
  const getFile = dependencies.readFile ?? readFile;

  return async function GET(request: Request, context: TelegramProductImageContext) {
    const { code: rawCode } = await context.params;
    const code = normalizeTelegramProductImageCode(rawCode);
    if (!code) return notFound();

    let product: TelegramProductImageRecord | null;
    try {
      product = await dependencies.findVisibleProductByCode(code);
    } catch {
      return notFound();
    }

    if (!product) return notFound();

    const fileName = getVerifiedLocalProductImageFileNameFromProduct(product);
    if (!fileName) return notFound();

    const filePath = path.resolve(imageRoot, fileName);
    if (!filePath.startsWith(`${imageRoot}${path.sep}`)) return notFound();

    try {
      const metadata = await getStat(filePath);
      if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_SOURCE_IMAGE_BYTES) {
        return notFound();
      }

      const etag = `W/\"${metadata.size.toString(16)}-${Math.trunc(metadata.mtimeMs).toString(16)}\"`;
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, {
          status: 304,
          headers: imageHeaders(etag),
        });
      }

      const jpeg = await renderTelegramJpeg(await getFile(filePath));
      if (!jpeg.length || jpeg.length > MAX_OUTPUT_IMAGE_BYTES) return notFound();

      return new Response(jpeg, {
        headers: imageHeaders(etag, jpeg.length),
      });
    } catch {
      return notFound();
    }
  };
}
