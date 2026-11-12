import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { isRealProductPhotoUrl } from "@/lib/product-media";

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_PATTERN = /^[a-f0-9]{16}$/i;
// ERP originals can legitimately be around 11 MB even though the storefront
// keeps a smaller WebP mirror. The bounded index job runs with low
// concurrency, so accepting up to 16 MB covers those source images safely.
const MAX_REMOTE_IMAGE_BYTES = 16 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 15_000;
const NIBBLE_BIT_COUNTS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

type VisualIndexableProduct = {
  id: string;
  imageUrl: string | null;
  imageVisualHash: string | null;
  imageVisualSourceKey: string | null;
  localImageUrl: string | null;
  sourceImageContentHash: string | null;
  sourceImageFingerprint: string | null;
  sourceImageUrl: string | null;
};

export type RankedVisualMatch<T> = {
  distance: number;
  record: T;
};

export type RefreshProductVisualImageIndexOptions = {
  codes?: string[];
  concurrency?: number;
  force?: boolean;
};

export type ProductVisualImageIndexSummary = {
  failed: number;
  indexed: number;
  skipped: number;
  total: number;
};

function normalizedLocalPath(value: string) {
  const pathname = value.split(/[?#]/, 1)[0] ?? "";
  if (!pathname.startsWith("/uploads/products/")) return null;

  const root = path.resolve(process.cwd(), "public", "uploads", "products");
  const target = path.resolve(process.cwd(), "public", pathname.slice(1));
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

function visualImageSources(product: Pick<VisualIndexableProduct, "localImageUrl" | "imageUrl" | "sourceImageUrl">) {
  return [...new Set([product.localImageUrl, product.imageUrl, product.sourceImageUrl]
    .map((value) => value?.trim() ?? "")
    .filter((value) => isRealProductPhotoUrl(value)))];
}

function visualImageSourceKey(product: VisualIndexableProduct, source: string) {
  return createHash("sha256")
    .update(JSON.stringify({
      source,
      sourceImageContentHash: product.sourceImageContentHash,
      sourceImageFingerprint: product.sourceImageFingerprint,
    }))
    .digest("hex");
}

async function downloadRemoteImage(source: string) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(source, {
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 (compatible; ImportadoraVisualIndex/1.0)" },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "";
    if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") return null;

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_REMOTE_IMAGE_BYTES) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length && bytes.length <= MAX_REMOTE_IMAGE_BYTES ? bytes : null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function readVisualImageBytes(source: string) {
  const localPath = normalizedLocalPath(source);
  if (localPath) {
    try {
      const bytes = await readFile(localPath);
      return bytes.length ? bytes : null;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(source);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }

  return downloadRemoteImage(source);
}

/**
 * A 64-bit difference hash makes byte-for-byte different versions of the
 * same catalogue artwork comparable without sending every product image to a
 * remote model. It deliberately represents appearance, not the ERP checksum.
 */
export async function createVisualImageHash(bytes: Buffer) {
  const pixels = await sharp(bytes, { animated: false, limitInputPixels: 40_000_000 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: HASH_WIDTH, height: HASH_HEIGHT, fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  if (pixels.length !== HASH_WIDTH * HASH_HEIGHT) {
    throw new Error("La imagen no produjo una huella visual válida.");
  }

  let hash = "";
  let nibble = 0;
  let bitCount = 0;

  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    const offset = y * HASH_WIDTH;
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      nibble = (nibble << 1) | Number(pixels[offset + x]! > pixels[offset + x + 1]!);
      bitCount += 1;
      if (bitCount === 4) {
        hash += nibble.toString(16);
        nibble = 0;
        bitCount = 0;
      }
    }
  }

  return hash;
}

export function visualImageHashDistance(left: string, right: string) {
  if (!HASH_PATTERN.test(left) || !HASH_PATTERN.test(right)) return Number.POSITIVE_INFINITY;

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const xor = Number.parseInt(left[index]!, 16) ^ Number.parseInt(right[index]!, 16);
    distance += NIBBLE_BIT_COUNTS[xor] ?? 4;
  }
  return distance;
}

export function rankVisualImageMatches<T extends { imageVisualHash: string | null }>(
  referenceHash: string,
  records: T[],
  limit = 8,
): Array<RankedVisualMatch<T>> {
  return records
    .flatMap((record) => {
      if (!record.imageVisualHash) return [];
      const distance = visualImageHashDistance(referenceHash, record.imageVisualHash);
      return Number.isFinite(distance) ? [{ record, distance }] : [];
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, Math.max(1, limit));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Builds or refreshes the local visual index used by the bot image matcher. */
export async function refreshProductVisualImageIndex(
  options: RefreshProductVisualImageIndexOptions = {},
): Promise<ProductVisualImageIndexSummary> {
  const codes = [...new Set(options.codes?.map((code) => code.trim()).filter(Boolean) ?? [])];
  const products = await prisma.product.findMany({
    where: codes.length ? { code: { in: codes } } : undefined,
    select: {
      id: true,
      imageUrl: true,
      imageVisualHash: true,
      imageVisualSourceKey: true,
      localImageUrl: true,
      sourceImageContentHash: true,
      sourceImageFingerprint: true,
      sourceImageUrl: true,
    },
  });
  const concurrency = Math.min(Math.max(options.concurrency ?? 8, 1), 16);

  const outcomes = await mapWithConcurrency(products, concurrency, async (product) => {
    const sources = visualImageSources(product);
    // Placeholder artwork is intentionally not a catalogue identity. It is
    // expected for discontinued ERP records and should not look like a job
    // failure in the index summary.
    if (!sources.length) return "skipped" as const;
    const sourceKeys = sources.map((source) => visualImageSourceKey(product, source));
    if (!options.force && product.imageVisualHash && sourceKeys.includes(product.imageVisualSourceKey ?? "")) return "skipped" as const;

    let source: string | null = null;
    let bytes: Buffer | null = null;
    for (const candidateSource of sources) {
      const candidateBytes = await readVisualImageBytes(candidateSource);
      if (!candidateBytes) continue;
      source = candidateSource;
      bytes = candidateBytes;
      break;
    }
    if (!source || !bytes) return "failed" as const;
    const sourceKey = visualImageSourceKey(product, source);

    try {
      const imageVisualHash = await createVisualImageHash(bytes);
      await prisma.product.update({
        where: { id: product.id },
        data: { imageVisualHash, imageVisualSourceKey: sourceKey, imageVisualIndexedAt: new Date() },
      });
      return "indexed" as const;
    } catch {
      return "failed" as const;
    }
  });

  return outcomes.reduce<ProductVisualImageIndexSummary>((summary, outcome) => {
    summary[outcome] += 1;
    return summary;
  }, { total: products.length, indexed: 0, skipped: 0, failed: 0 });
}
