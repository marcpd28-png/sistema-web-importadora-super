import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FacturadorApiError, FacturadorClient, getFacturadorConfig } from "./client";
import { buildErpEditorialPayload, buildEditorialFields, EditorialWriteError, extractErpRecord } from "./editorial-payload";

export const ERP_EDITORIAL_BUSY = ["PREPARING", "SENDING", "UNCERTAIN"];
const MAX_REQUEST_AGE_MS = 120_000;
export const editorialWriteSelect = {
  id: true, status: true, message: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ErpEditorialWriteSelect;

export type EditorialWriteSummary = {
  id: string; status: string; message: string; createdAt: Date | string; updatedAt: Date | string;
};

type WriteClient = {
  source: string;
  request(path: string, options?: { method?: "GET" | "POST"; body?: unknown; retry?: boolean }): Promise<unknown>;
};
type Dependencies = { db?: PrismaClient; client?: WriteClient };

function json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

export async function sendErpEditorial(input: {
  productId: string; requestId: string; actorEmail: string; expectedProfileUpdatedAt: string;
}, dependencies: Dependencies = {}): Promise<EditorialWriteSummary> {
  const db = dependencies.db ?? prisma;
  // Configuration errors happen before we reserve a write.
  const client = dependencies.client ?? new FacturadorClient({ ...getFacturadorConfig(), timeoutMs: 15000, maxRetries: 0 });
  const reservation = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`erp-editorial:${input.productId}`}))`;
    const existing = await tx.erpEditorialWrite.findUnique({ where: { id: input.requestId } });
    if (existing) {
      if (existing.productId !== input.productId) throw new EditorialWriteError("REQUEST_CONFLICT", "La referencia de envío pertenece a otro producto.", 409);
      return { existing };
    }
    const busy = await tx.erpEditorialWrite.findFirst({ where: { productId: input.productId, status: { in: ERP_EDITORIAL_BUSY } } });
    if (busy) throw new EditorialWriteError("WRITE_UNRESOLVED", "Hay un envío en curso o pendiente de revisión. Comprueba su estado antes de enviar otra vez.", 409);
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      include: { digitalProfile: true, specifications: { orderBy: { sortOrder: "asc" } } },
    });
    if (!product) throw new EditorialWriteError("NOT_FOUND", "No se encontró el producto.", 404);
    if (!product.externalId || !product.externalSource) throw new EditorialWriteError("NOT_LINKED", "Este producto no está vinculado al ERP.");
    if (product.externalSource !== client.source) throw new EditorialWriteError("SOURCE_MISMATCH", "El producto pertenece a otra conexión ERP.", 409);
    if (!product.digitalProfile || product.digitalProfile.updatedAt.toISOString() !== input.expectedProfileUpdatedAt) {
      throw new EditorialWriteError("PROFILE_CHANGED", "La ficha cambió. Vuelve a guardarla antes de enviarla al ERP.", 409);
    }
    const content = { ...product.digitalProfile, specifications: product.specifications };
    buildEditorialFields(content);
    await tx.erpEditorialWrite.create({ data: {
      id: input.requestId, productId: input.productId, actorEmail: input.actorEmail,
      status: "PREPARING", message: "Consultando el producto original en el ERP.",
    } });
    return { product, content };
  });
  if (reservation.existing) {
    const { id, status, message, createdAt, updatedAt } = reservation.existing;
    return { id, status, message, createdAt, updatedAt };
  }

  let sending = false;
  try {
    const product = reservation.product!;
    const record = extractErpRecord(await client.request(`/items/record/${encodeURIComponent(product.externalId!)}`, { retry: false }));
    const body = buildErpEditorialPayload(record, {
      externalId: product.externalId!, code: product.externalCode || product.code,
    }, reservation.content!);
    // Save both the original and exact outgoing payload BEFORE any external write.
    await db.erpEditorialWrite.update({ where: { id: input.requestId }, data: {
      status: "SENDING", beforeData: json(record), requestData: json(body), message: "Enviando la ficha al ERP.",
    } });
    sending = true;
    const response = await client.request("/items/update", { method: "POST", body, retry: false });
    if (!response || typeof response !== "object" || (response as { success?: unknown }).success !== true) {
      throw new EditorialWriteError("UNCONFIRMED_RESPONSE", "El ERP no confirmó el resultado del envío.", 502);
    }
    return await db.erpEditorialWrite.update({ where: { id: input.requestId }, data: {
      status: "ACCEPTED",
      message: "El ERP aceptó el envío. Su API no devuelve el detalle guardado; puedes revisarlo en el ERP.",
    }, select: editorialWriteSelect });
  } catch (error) {
    // A timeout, connection loss or server error after POST may mean it was
    // committed. Do not replay blindly. Even failure to persist ACCEPTED stays
    // unresolved instead of presenting an unsafe retry as a new attempt.
    const rejected = error instanceof FacturadorApiError && [400, 401, 403, 404, 405, 422, 429].includes(error.status);
    const uncertain = sending && !rejected;
    const message = uncertain
      ? "No se pudo confirmar si el ERP guardó el envío. Revisa el producto en el ERP antes de intentar otro envío."
      : error instanceof EditorialWriteError ? error.message
      : error instanceof FacturadorApiError
        ? `El ERP rechazó la ${sending ? "escritura" : "consulta"} (HTTP ${error.status}). Tu ficha sigue guardada en la web.`
        : "No se pudo consultar el ERP. Tu ficha sigue guardada en la web.";
    return db.erpEditorialWrite.update({ where: { id: input.requestId }, data: {
      status: uncertain ? "UNCERTAIN" : "FAILED", message,
    }, select: editorialWriteSelect });
  }
}

export async function markErpEditorialReviewed(input: {
  productId: string; requestId: string; actorEmail: string;
}, db = prisma) {
  const write = await db.erpEditorialWrite.findUnique({ where: { id: input.requestId } });
  if (!write || write.productId !== input.productId) throw new EditorialWriteError("NOT_FOUND", "No se encontró el envío.", 404);
  if (!ERP_EDITORIAL_BUSY.includes(write.status)) throw new EditorialWriteError("NOT_PENDING", "Este envío no requiere revisión.", 409);
  if (write.status !== "UNCERTAIN" && Date.now() - write.updatedAt.getTime() < MAX_REQUEST_AGE_MS) {
    throw new EditorialWriteError("STILL_RUNNING", "El envío todavía puede estar en curso. Espera antes de revisarlo.", 409);
  }
  const updated = await db.erpEditorialWrite.updateMany({
    where: { id: write.id, status: write.status, updatedAt: write.updatedAt },
    data: { status: "REVIEWED", reviewedByEmail: input.actorEmail, message: "Un administrador indicó que revisó el resultado en el ERP. No se ha reenviado automáticamente." },
  });
  if (!updated.count) throw new EditorialWriteError("STATUS_CHANGED", "El estado cambió. Actualiza el historial.", 409);
  return db.erpEditorialWrite.findUniqueOrThrow({ where: { id: write.id }, select: editorialWriteSelect });
}
