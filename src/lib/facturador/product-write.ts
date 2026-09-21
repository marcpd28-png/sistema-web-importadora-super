import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FacturadorApiError, FacturadorClient, getFacturadorConfig } from "./client";
import { EditorialWriteError, extractErpRecord } from "./editorial-payload";
import { editorialWriteSelect, ERP_EDITORIAL_BUSY, type EditorialWriteSummary } from "./editorial-write";
import { erpProductSendSchema, type ErpProductOperation } from "./product-fields";
import { buildProductWrite, productRevision, productSnapshot, verifyProductChanges } from "./product-payload";

type Client = { source: string; request(path: string, options?: { method?: "GET" | "POST"; body?: unknown; retry?: boolean }): Promise<unknown> };
type Dependencies = { db?: PrismaClient; client?: Client; checkImage?: (url: string) => Promise<void> };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const makeClient = () => new FacturadorClient({ ...getFacturadorConfig(), timeoutMs: 15000, maxRetries: 0 });

async function checkImageReference(url: string) {
  // Never fetch arbitrary URLs or follow redirects, and never forward the ERP
  // token to a media endpoint. The reference must belong to the configured ERP.
  if (new URL(url).origin !== new URL(getFacturadorConfig().baseUrl).origin) {
    throw new EditorialWriteError("IMAGE_ORIGIN", "La imagen debe pertenecer al servidor ERP configurado.");
  }
  const response = await fetch(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!response.ok || !/^image\/(jpeg|png|webp|gif)(;|$)/i.test(response.headers.get("content-type") ?? "")) {
    throw new EditorialWriteError("IMAGE_UNAVAILABLE", "No se pudo verificar la imagen cargada en el ERP. No se enviaron cambios.");
  }
}

async function linkedProduct(db: PrismaClient, client: Client, id: string) {
  const product = await db.product.findUnique({ where: { id } });
  if (!product) throw new EditorialWriteError("NOT_FOUND", "Producto no encontrado.", 404);
  if (!product.externalId || !product.externalSource) throw new EditorialWriteError("NOT_LINKED", "Este producto no está vinculado al ERP.");
  if (product.externalSource !== client.source) throw new EditorialWriteError("SOURCE_MISMATCH", "Este producto pertenece a otra conexión ERP.", 409);
  return product;
}

export async function readErpProduct(id: string, dependencies: Dependencies = {}) {
  const db = dependencies.db ?? prisma, client = dependencies.client ?? makeClient();
  const product = await linkedProduct(db, client, id);
  const record = extractErpRecord(await client.request(`/items/record/${encodeURIComponent(product.externalId!)}`, { retry: false }));
  if (String(record.id) !== product.externalId) throw new EditorialWriteError("IDENTITY_MISMATCH", "El ERP devolvió otro producto.", 502);
  let tables: unknown = {};
  try { tables = await client.request("/items/tables", { retry: false }); } catch { /* Values can still be edited using their ERP IDs. */ }
  return productSnapshot(record, tables);
}

export async function sendErpProduct(input: {
  productId: string; requestId: string; actorEmail: string; revision: string; operation: ErpProductOperation;
}, dependencies: Dependencies = {}): Promise<EditorialWriteSummary> {
  const operation = erpProductSendSchema.parse(input.operation);
  const db = dependencies.db ?? prisma, client = dependencies.client ?? makeClient();
  const fingerprint = JSON.stringify({ revision: input.revision, operation });
  const reservation = await db.$transaction(async (tx) => {
    // Same lock and partial unique index as digital-sheet writes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`erp-editorial:${input.productId}`}))`;
    const existing = await tx.erpEditorialWrite.findUnique({ where: { id: input.requestId } });
    if (existing) {
      const saved = existing.requestData as Record<string, unknown> | null;
      if (existing.productId !== input.productId || saved?.fingerprint !== fingerprint) {
        throw new EditorialWriteError("REQUEST_CONFLICT", "La referencia de envío ya corresponde a otra operación.", 409);
      }
      return { existing };
    }
    const busy = await tx.erpEditorialWrite.findFirst({ where: { productId: input.productId, status: { in: ERP_EDITORIAL_BUSY } } });
    if (busy) throw new EditorialWriteError("WRITE_UNRESOLVED", "Hay un envío en curso o pendiente de revisión. Actualiza el historial.", 409);
    const product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product?.externalId || product.externalSource !== client.source) throw new EditorialWriteError("NOT_LINKED", "Producto no vinculado a esta conexión ERP.");
    if (operation.kind === "product" && operation.changes.internal_id) {
      const duplicate = await tx.product.findFirst({ where: { code: operation.changes.internal_id, id: { not: product.id } } });
      if (duplicate) throw new EditorialWriteError("DUPLICATE_CODE", "Ya existe otro producto con ese código en la web.", 409);
    }
    await tx.erpEditorialWrite.create({ data: { id: input.requestId, productId: product.id,
      actorEmail: input.actorEmail, status: "PREPARING", message: "Consultando los datos actuales del ERP.",
      requestData: json({ kind: operation.kind, fingerprint }) } });
    return { product };
  });
  if (reservation.existing) {
    const { id, status, message, createdAt, updatedAt } = reservation.existing;
    return { id, status, message, createdAt, updatedAt };
  }
  let sending = false;
  try {
    const product = reservation.product!;
    const path = `/items/record/${encodeURIComponent(product.externalId!)}`;
    const record = extractErpRecord(await client.request(path, { retry: false }));
    if (productRevision(record) !== input.revision) throw new EditorialWriteError("CHANGED", "Los datos del ERP cambiaron desde que los abriste. Carga los valores actuales antes de enviar.", 409);
    const outgoing = buildProductWrite(record, { externalId: product.externalId!, code: product.externalCode || product.code }, operation);
    if (operation.kind === "product" && operation.changes.image_url !== undefined) {
      await (dependencies.checkImage ?? checkImageReference)(operation.changes.image_url);
    }
    await db.erpEditorialWrite.update({ where: { id: input.requestId }, data: {
      status: "SENDING", beforeData: json(record), requestData: json({ kind: operation.kind, fingerprint, ...outgoing }),
      message: operation.kind === "inventory" ? "Registrando el movimiento de inventario." : "Actualizando el producto en el ERP.",
    } });
    sending = true;
    const result = await client.request(outgoing.path, { method: "POST", body: outgoing.body, retry: false });
    if (!result || typeof result !== "object" || (result as { success?: unknown }).success !== true) {
      throw new EditorialWriteError("UNCONFIRMED", "El ERP no confirmó el resultado.", 502);
    }
    let status = "ACCEPTED";
    let message = "El ERP aceptó el movimiento de inventario. El stock de la tienda se actualizará en la siguiente sincronización. No repitas este movimiento.";
    if (operation.kind === "product") {
      let after: Record<string, unknown> | null = null;
      try { after = extractErpRecord(await client.request(path, { retry: false })); } catch { /* accepted, but not verified */ }
      if (!after || String(after.id) !== product.externalId) {
        status = "UNCERTAIN";
        message = "El ERP aceptó la actualización, pero no se pudo releer el producto. Revisa el resultado antes de volver a enviar.";
      } else {
        // Verify preserved scalar values too: success:true alone does not
        // guarantee the ERP kept the original price or image.
        const keys = [...new Set([...Object.keys(operation.changes), ...Object.keys(outgoing.body).filter((key) => key in record && !["image", "temp_path"].includes(key))])];
        const requested = Object.fromEntries(keys.map((key) => [key, outgoing.body[key]]));
        const verification = verifyProductChanges(after, requested);
        if (verification.mismatched.length) {
          status = "UNCERTAIN";
          message = "El ERP respondió que aceptó el envío, pero algunos valores no coinciden al consultarlos. Revisa el producto antes de enviar otra vez.";
        } else {
          // Preserve the stable ERP ID when its human-facing code changes.
          // Local concurrent edits are never silently overwritten.
          const data: Prisma.ProductUpdateManyMutationInput = { syncHash: null, syncQuickHash: null };
          if ("internal_id" in operation.changes && verification.verified.includes("internal_id")) { data.code = String(after.internal_id); data.externalCode = String(after.internal_id); }
          if ("description" in operation.changes && verification.verified.includes("description")) data.name = String(after.description);
          if ("name" in operation.changes && verification.verified.includes("name")) data.description = after.name == null ? null : String(after.name);
          const updated = await db.product.updateMany({ where: { id: product.id, updatedAt: product.updatedAt }, data });
          message = verification.unverified.length
            ? "El ERP aceptó el envío. Los campos que devuelve coinciden; hay campos que su API no permite verificar y requieren revisión en el ERP."
            : "Cambios confirmados al volver a consultar el ERP.";
          message += updated.count ? " Los demás datos de la tienda se actualizarán al sincronizar." : " El producto cambió en la web durante el envío; sincroniza para reconciliar los datos.";
        }
      }
    }
    return await db.erpEditorialWrite.update({ where: { id: input.requestId }, data: { status, message }, select: editorialWriteSelect });
  } catch (error) {
    const rejected = error instanceof FacturadorApiError && [400, 401, 403, 404, 405, 422, 429].includes(error.status);
    const uncertain = sending && !rejected;
    const message = uncertain ? "No se pudo confirmar el resultado. Revisa el ERP antes de otro envío; un movimiento de stock podría haberse aplicado."
      : error instanceof EditorialWriteError ? error.message
      : error instanceof FacturadorApiError ? `El ERP rechazó la ${sending ? "operación" : "consulta"} (HTTP ${error.status}).`
      : "No se pudo preparar el envío al ERP.";
    return db.erpEditorialWrite.update({ where: { id: input.requestId }, data: { status: uncertain ? "UNCERTAIN" : "FAILED", message }, select: editorialWriteSelect });
  }
}
