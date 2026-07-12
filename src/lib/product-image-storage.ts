import { createHash } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { slugify } from "@/lib/utils";
import { createNormalizedProductImage } from "@/lib/product-image-normalization";

const PRODUCT_IMAGE_DIR = path.join(process.cwd(), "public", "uploads", "products");
const GENERIC_PRODUCT_IMAGE_MARKERS = [
  "imagen-no-disponible",
  "no-image",
  "placeholder",
  "sin-foto",
];

function isGenericImageUrl(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return false;
  }

  return GENERIC_PRODUCT_IMAGE_MARKERS.some((marker) => normalized.includes(marker));
}

function isMirrorableSourceUrl(value: string | null | undefined) {
  const raw = value?.trim();

  if (!raw || raw.startsWith("/")) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

type RemoteImageMetadata = {
  contentLength: string | null;
  etag: string | null;
  fingerprint: string | null;
  lastModified: string | null;
};

function buildNoCacheHeaders() {
  return {
    "cache-control": "no-cache, no-store, max-age=0",
    pragma: "no-cache",
    "user-agent": "Mozilla/5.0 (compatible; ImportadoraImageMirror/2.0)",
  };
}

export function isPotentialRemoteImageContentType(value: string | null | undefined) {
  const contentType = value?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (!contentType) {
    return true;
  }

  return (
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream"
  );
}

export function buildSourceImageFingerprint(
  sourceUrl: string,
  input: {
    contentLength?: string | null;
    etag?: string | null;
    lastModified?: string | null;
  },
) {
  const etag = input.etag?.trim() ?? "";
  const lastModified = input.lastModified?.trim() ?? "";

  if (!etag && !lastModified) {
    return null;
  }

  return createHash("sha256")
    .update(
      JSON.stringify({
        contentLength: input.contentLength?.trim() || null,
        etag: etag || null,
        lastModified: lastModified || null,
        sourceUrl,
      }),
    )
    .digest("hex");
}

function readRemoteImageMetadata(sourceUrl: string, headers: Headers): RemoteImageMetadata {
  const contentLength = headers.get("content-length");
  const etag = headers.get("etag");
  const lastModified = headers.get("last-modified");

  return {
    contentLength,
    etag,
    fingerprint: buildSourceImageFingerprint(sourceUrl, {
      contentLength,
      etag,
      lastModified,
    }),
    lastModified,
  };
}

async function probeRemoteImage(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      headers: buildNoCacheHeaders(),
      method: "HEAD",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!isPotentialRemoteImageContentType(contentType)) {
      throw new Error("La URL no devuelve una imagen válida.");
    }

    return readRemoteImageMetadata(sourceUrl, response.headers);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function downloadRemoteImage(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: buildNoCacheHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!isPotentialRemoteImageContentType(contentType)) {
      throw new Error("La URL no devuelve una imagen válida.");
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      metadata: readRemoteImageMetadata(sourceUrl, response.headers),
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function removePreviousLocalImage(previousLocalUrl: string | null | undefined, nextLocalUrl: string) {
  const normalized = previousLocalUrl?.trim() ?? "";

  if (
    !normalized.startsWith("/uploads/products/") ||
    normalized === nextLocalUrl
  ) {
    return;
  }

  const filePath = path.join(
    /* turbopackIgnore: true */ PRODUCT_IMAGE_DIR,
    path.basename(normalized),
  );

  try {
    await unlink(filePath);
  } catch {
    // El archivo anterior puede pertenecer a otro despliegue o ya no existir.
  }
}

export type MirrorProductImageInput = {
  code: string;
  sourceUrl: string | null | undefined;
  versionKey: string;
  clearWhenSourceMissing?: boolean;
  previousContentHash?: string | null;
  previousLocalUrl?: string | null;
  previousSourceFingerprint?: string | null;
  previousSourceUrl?: string | null;
};

export type MirrorProductImageResult = {
  contentHash: string | null;
  error?: string | null;
  localUrl: string | null;
  metadataChanged: boolean;
  mirrored: boolean;
  sourceFingerprint: string | null;
};

export async function mirrorProductImageToLocal(
  input: MirrorProductImageInput,
): Promise<MirrorProductImageResult> {
  const sourceUrl = input.sourceUrl?.trim() ?? "";

  if (!sourceUrl || isGenericImageUrl(sourceUrl) || !isMirrorableSourceUrl(sourceUrl)) {
    const shouldClear = Boolean(input.clearWhenSourceMissing);

    return {
      contentHash: shouldClear ? null : input.previousContentHash ?? null,
      localUrl: shouldClear ? null : input.previousLocalUrl ?? null,
      metadataChanged:
        shouldClear &&
        Boolean(
          input.previousLocalUrl ||
            input.previousContentHash ||
            input.previousSourceFingerprint,
        ),
      mirrored: false,
      error: null,
      sourceFingerprint: shouldClear ? null : input.previousSourceFingerprint ?? null,
    };
  }

  try {
    const previousLocalUrl = input.previousLocalUrl?.trim() || null;
    const sameSourceUrl = sourceUrl === input.previousSourceUrl?.trim();
    let probedMetadata: RemoteImageMetadata | null = null;

    if (previousLocalUrl && sameSourceUrl) {
      try {
        probedMetadata = await probeRemoteImage(sourceUrl);
      } catch {
        // Algunos hosts no aceptan HEAD. El GET posterior validará la imagen.
      }

      if (
        probedMetadata?.fingerprint &&
        probedMetadata.fingerprint === input.previousSourceFingerprint
      ) {
        return {
          contentHash: input.previousContentHash ?? null,
          localUrl: previousLocalUrl,
          metadataChanged: false,
          mirrored: false,
          error: null,
          sourceFingerprint: probedMetadata.fingerprint,
        };
      }
    }

    const downloaded = await downloadRemoteImage(sourceUrl);
    const contentHash = createHash("sha256").update(downloaded.buffer).digest("hex");
    const sourceFingerprint =
      downloaded.metadata.fingerprint ?? probedMetadata?.fingerprint ?? null;

    if (
      previousLocalUrl &&
      contentHash === input.previousContentHash
    ) {
      return {
        contentHash,
        localUrl: previousLocalUrl,
        metadataChanged:
          sourceFingerprint !== (input.previousSourceFingerprint ?? null),
        mirrored: false,
        error: null,
        sourceFingerprint,
      };
    }

    const fileBase = `erp-${slugify(input.code) || "product"}-${contentHash.slice(0, 12)}`;
    const filePath = path.join(
      /* turbopackIgnore: true */ PRODUCT_IMAGE_DIR,
      `${fileBase}.webp`,
    );
    const localUrl = `/uploads/products/${fileBase}.webp`;

    await mkdir(PRODUCT_IMAGE_DIR, { recursive: true });
    const image = await createNormalizedProductImage(downloaded.buffer);
    await image
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 84 })
      .toFile(filePath);
    await removePreviousLocalImage(previousLocalUrl, localUrl);

    return {
      contentHash,
      localUrl,
      metadataChanged: true,
      mirrored: true,
      error: null,
      sourceFingerprint,
    };
  } catch (error) {
    return {
      contentHash: input.previousContentHash ?? null,
      localUrl: input.previousLocalUrl ?? null,
      metadataChanged: false,
      mirrored: false,
      error: error instanceof Error ? error.message : "No se pudo guardar la imagen local.",
      sourceFingerprint: input.previousSourceFingerprint ?? null,
    };
  }
}
