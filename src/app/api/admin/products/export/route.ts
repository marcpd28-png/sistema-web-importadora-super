import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { getSession } from "@/lib/auth";
import { getPreferredProductImageUrl } from "@/lib/product-media";
import { buildSellableProductWhere } from "@/lib/store-shared";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { getPublicSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

type ImageFormat = "jpg" | "png";

function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function isPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPublicIpv4(normalized.slice(7));
  // Only global unicast IPv6 is accepted; block mapped, private, local, and documentation ranges.
  return (
    (normalized.startsWith("2") || normalized.startsWith("3")) &&
    !normalized.startsWith("2001:db8:") &&
    !normalized.startsWith("2001:0000:") &&
    !normalized.startsWith("2001:10:")
  );
}

async function resolvePublicAddress(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("El servidor de imágenes no es público.");
  }
  return addresses[0];
}

function readHttpImage(url: URL, address: { address: string; family: number }, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = requestFn(url, {
      headers: { accept: "image/*", "user-agent": "ImportadoraProductExport/1.0" },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      timeout: IMAGE_TIMEOUT_MS,
    }, (res) => {
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) return reject(new Error("Demasiadas redirecciones de imagen."));
        void loadImageBuffer(new URL(location, url).toString(), redirects + 1).then(resolve, reject);
        return;
      }

      const contentType = res.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
      if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300 || !contentType.startsWith("image/")) {
        res.resume();
        reject(new Error("No se pudo descargar la imagen."));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          req.destroy(new Error("La imagen supera el tamaño permitido."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });

    req.on("timeout", () => req.destroy(new Error("La descarga de la imagen excedió el tiempo límite.")));
    req.on("error", reject);
    req.end();
  });
}

async function loadImageBuffer(value: string, redirects = 0): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(value, getPublicSiteUrl());
  } catch {
    throw new Error("La URL de imagen no es válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Formato de URL de imagen inválido.");

  const publicOrigin = new URL(getPublicSiteUrl());
  if (url.origin === publicOrigin.origin || url.hostname === "localhost") {
    const decodedPath = decodeURIComponent(url.pathname);
    const publicDirectory = await realpath(path.join(process.cwd(), "public"));
    const absolutePath = path.resolve(publicDirectory, `.${decodedPath}`);
    if (!absolutePath.startsWith(`${publicDirectory}${path.sep}`)) throw new Error("Ruta de imagen inválida.");
    const resolvedPath = await realpath(absolutePath);
    if (!resolvedPath.startsWith(`${publicDirectory}${path.sep}`)) throw new Error("Ruta de imagen inválida.");
    const buffer = await readFile(resolvedPath);
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error("La imagen supera el tamaño permitido.");
    return buffer;
  }

  if (url.username || url.password) throw new Error("La URL de imagen no es válida.");
  const address = await resolvePublicAddress(url.hostname);
  return readHttpImage(url, address, redirects);
}

async function convertImage(url: string, format: ImageFormat) {
  const source = await loadImageBuffer(url);
  const image = sharp(source, { limitInputPixels: 60_000_000 }).rotate();
  return format === "jpg"
    ? image.flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    : image.png({ compressionLevel: 6 }).toBuffer();
}

function safeFileStem(code: string, id: string) {
  const normalized = slugify(code).slice(0, 48) || "producto";
  return `${normalized}-${id.slice(-8)}`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN" || session.requirePasswordChange) {
    return Response.json({ error: "ADMIN_REQUIRED" }, { status: 401 });
  }

  const requestedFormat = new URL(request.url).searchParams.get("format");
  if (requestedFormat !== "jpg" && requestedFormat !== "png") {
    return Response.json({ error: "Elige JPG o PNG para las imágenes." }, { status: 400 });
  }
  const format: ImageFormat = requestedFormat;

  const products = await prisma.product.findMany({
    where: buildSellableProductWhere(),
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      technicalSpecs: true,
      brand: true,
      category: true,
      unitLabel: true,
      unitPrice: true,
      wholesalePrice: true,
      wholesaleMinQty: true,
      boxPrice: true,
      unitsPerBox: true,
      stockUnits: true,
      isFeatured: true,
      localImageUrl: true,
      imageUrl: true,
      media: { where: { type: "IMAGE" }, orderBy: { sortOrder: "asc" }, select: { url: true } },
    },
    orderBy: [{ name: "asc" }, { code: "asc" }],
  });

  const extension = format === "jpg" ? "jpg" : "png";
  const imageNames = new Map<string, string>();
  for (const product of products) {
    const imageUrl = getPreferredProductImageUrl(product);
    if (imageUrl) imageNames.set(product.id, `imagenes/${safeFileStem(product.code, product.id)}.${extension}`);
  }

  const csvRows = [
    ["codigo", "nombre", "descripcion", "ficha_tecnica", "marca", "categoria", "unidad", "precio_publico", "precio_mayorista", "cantidad_minima_mayorista", "precio_caja", "unidades_por_caja", "stock", "destacado", "imagen"],
    ...products.map((product) => [
      product.code,
      product.name,
      product.description,
      product.technicalSpecs,
      product.brand,
      product.category,
      product.unitLabel,
      product.unitPrice.toString(),
      product.wholesalePrice?.toString() ?? "",
      product.wholesaleMinQty,
      product.boxPrice?.toString() ?? "",
      product.unitsPerBox,
      product.stockUnits,
      product.isFeatured ? "Sí" : "No",
      imageNames.get(product.id) ?? "",
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");

  let pumpStream = () => {};
  let stopStream = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const queued: Uint8Array[] = [];
      const errors: string[][] = [];
      let finalChunk = false;
      let failure: Error | null = null;
      let drain: (() => void) | null = null;
      let cancelled = false;

      const pump = () => {
        while (queued.length && (controller.desiredSize ?? 0) > 0) controller.enqueue(queued.shift()!);
        if (!queued.length && drain) {
          drain();
          drain = null;
        }
        if (failure) controller.error(failure);
        else if (finalChunk && queued.length === 0) controller.close();
      };
      pumpStream = pump;
      stopStream = () => {
        cancelled = true;
        drain?.();
        drain = null;
      };

      const zip = new Zip((error, chunk, final) => {
        if (error) failure = error;
        if (chunk.length) queued.push(chunk);
        if (final) finalChunk = true;
        pump();
      });

      const addFile = async (name: string, content: Uint8Array) => {
        if (cancelled) return;
        const file = new ZipPassThrough(name);
        zip.add(file);
        file.push(content, true);
        if (queued.length && (controller.desiredSize ?? 0) <= 0) {
          await new Promise<void>((resolve) => { drain = resolve; });
        }
      };

      void (async () => {
        try {
          await addFile("productos.csv", strToU8(`\uFEFF${csvRows}`));
          for (let offset = 0; offset < products.length; offset += 4) {
            if (cancelled) return;
            const batch = products.slice(offset, offset + 4);
            const converted = await Promise.all(batch.map(async (product) => {
              const imageUrl = getPreferredProductImageUrl(product);
              if (!imageUrl) return { product, image: null };
              try {
                return { product, image: await convertImage(imageUrl, format) };
              } catch {
                errors.push([product.code, product.name, "No se pudo convertir o descargar la imagen"].map(csvCell));
                return { product, image: null };
              }
            }));
            for (const { product, image } of converted) {
              if (cancelled) return;
              const filename = imageNames.get(product.id);
              if (filename && image) await addFile(filename, image);
            }
          }
          if (errors.length) {
            await addFile("errores-imagenes.csv", strToU8(`\uFEFF${[["codigo", "nombre", "detalle"], ...errors].map((row) => row.join(",")).join("\r\n")}`));
          }
          zip.end();
        } catch (error) {
          failure = error instanceof Error ? error : new Error("No se pudo generar la exportación.");
          pump();
        }
      })();
    },
    pull() {
      pumpStream();
    },
    cancel() {
      stopStream();
    },
  }, { highWaterMark: 2 });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="productos-publicados-${date}-${format}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
