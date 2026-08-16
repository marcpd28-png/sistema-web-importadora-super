import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const UPLOAD_ROOT = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "public",
  "uploads",
);

const CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function safeJoinUploadPath(parts: string[]) {
  const normalizedParts = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "." && part !== "..");

  const resolvedPath = path.resolve(
    /* turbopackIgnore: true */ UPLOAD_ROOT,
    ...normalizedParts,
  );

  if (!resolvedPath.startsWith(`${UPLOAD_ROOT}${path.sep}`) && resolvedPath !== UPLOAD_ROOT) {
    return null;
  }

  return resolvedPath;
}

function getContentType(filePath: string) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function readUploadFile(filePath: string, requestHeaders?: Headers) {
  const fileStats = await stat(/* turbopackIgnore: true */ filePath);

  if (!fileStats.isFile()) {
    return null;
  }

  const etag = `W/"${fileStats.size.toString(16)}-${fileStats.mtimeMs.toString(16)}"`;
  const lastModified = fileStats.mtime.toUTCString();

  if (requestHeaders) {
    const ifNoneMatch = requestHeaders.get("if-none-match");
    const ifModifiedSince = requestHeaders.get("if-modified-since");

    if (ifNoneMatch === etag || (ifModifiedSince && new Date(ifModifiedSince) >= fileStats.mtime)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Last-Modified": lastModified,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  const headers = new Headers();
  headers.set("Content-Type", getContentType(filePath));
  headers.set("Content-Length", String(fileStats.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", etag);
  headers.set("Last-Modified", lastModified);
  headers.set("Accept-Ranges", "bytes");

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

  return new Response(stream, {
    status: 200,
    headers,
  });
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/uploads/[...path]">,
) {
  const { path: uploadPath } = await params;
  const filePath = safeJoinUploadPath(uploadPath);

  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const response = await readUploadFile(filePath, request.headers);

    if (!response) {
      return new Response("Not found", { status: 404 });
    }

    return response;
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function HEAD(
  _request: Request,
  { params }: RouteContext<"/uploads/[...path]">,
) {
  const { path: uploadPath } = await params;
  const filePath = safeJoinUploadPath(uploadPath);

  if (!filePath) {
    return new Response(null, { status: 404 });
  }

  try {
    const fileStats = await stat(/* turbopackIgnore: true */ filePath);

    if (!fileStats.isFile()) {
      return new Response(null, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", getContentType(filePath));
    headers.set("Content-Length", String(fileStats.size));
    headers.set("Cache-Control", "public, max-age=15552000, immutable");
    headers.set("Accept-Ranges", "bytes");

    return new Response(null, {
      status: 200,
      headers,
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
