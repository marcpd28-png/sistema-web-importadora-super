import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { mapFacturadorProduct } from "./mappers";
import { getFacturadorConfig } from "./client";

export type ErpSyncEventPayload = {
  updated_at: string; // ISO string format preferred
  stock?: number;
  unitPrice?: number;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number;
  boxPrice?: number | null;
  unitsPerBox?: number | null;
  product?: Record<string, unknown>; // Full product payload for CREATED/UPDATED
};

/**
 * Encola un evento de sincronización en la base de datos para su procesamiento asíncrono.
 */
export async function enqueueSyncEvent(
  sku: string,
  eventType: string,
  payload: ErpSyncEventPayload,
) {
  return await prisma.syncEventQueue.create({
    data: {
      sku,
      eventType,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: "PENDING",
    },
  });
}

/**
 * Procesa todos los eventos pendientes en la cola.
 * Maneja idempotencia comparando updated_at de los eventos con erpUpdatedAt del producto.
 */
export async function processSyncQueue() {
  const pendingEvents = await prisma.syncEventQueue.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });

  if (pendingEvents.length === 0) {
    return { processed: 0, completed: 0, failed: 0 };
  }

  let completed = 0;
  let failed = 0;
  let hasChanges = false;
  const config = getFacturadorConfig();

  for (const event of pendingEvents) {
    // Marcar el evento en proceso
    await prisma.syncEventQueue.update({
      where: { id: event.id },
      data: { status: "PROCESSING" },
    });

    try {
      const payload = event.payload as unknown as ErpSyncEventPayload;
      const eventUpdatedAt = new Date(payload.updated_at);

      if (isNaN(eventUpdatedAt.getTime())) {
        throw new Error("El campo updated_at del payload no es una fecha válida.");
      }

      // Buscar si el producto existe localmente
      const product = await prisma.product.findUnique({
        where: { code: event.sku },
        select: { id: true, erpUpdatedAt: true, syncEnabled: true },
      });

      // Validación de Idempotencia y control de versiones
      if (product && product.erpUpdatedAt) {
        const dbUpdatedAt = new Date(product.erpUpdatedAt);
        if (eventUpdatedAt <= dbUpdatedAt) {
          // El evento es antiguo o duplicado. Se descarta.
          await prisma.syncEventQueue.update({
            where: { id: event.id },
            data: {
              status: "COMPLETED",
              processedAt: new Date(),
              errorMessage: "Omitido: Versión del evento es menor o igual a la almacenada.",
            },
          });
          completed += 1;
          continue;
        }
      }

      // Procesamiento según el tipo de evento
      if (event.eventType === "PRODUCT_STOCK_UPDATED") {
        if (payload.stock === undefined) {
          throw new Error("Falta el campo 'stock' en el payload del evento.");
        }

        const stockUnits = Math.max(0, Math.floor(payload.stock));
        await prisma.product.update({
          where: { code: event.sku },
          data: {
            stockUnits,
            isVisible: stockUnits > 0,
            erpUpdatedAt: eventUpdatedAt,
            lastSyncedAt: new Date(),
          },
        });
        hasChanges = true;

      } else if (event.eventType === "PRODUCT_PRICE_UPDATED") {
        if (payload.unitPrice === undefined) {
          throw new Error("Falta el campo 'unitPrice' en el payload del evento.");
        }

        await prisma.product.update({
          where: { code: event.sku },
          data: {
            unitPrice: new Prisma.Decimal(payload.unitPrice),
            wholesalePrice: payload.wholesalePrice === undefined ? undefined : (payload.wholesalePrice === null ? null : new Prisma.Decimal(payload.wholesalePrice)),
            wholesaleMinQty: payload.wholesaleMinQty,
            boxPrice: payload.boxPrice === undefined ? undefined : (payload.boxPrice === null ? null : new Prisma.Decimal(payload.boxPrice)),
            unitsPerBox: payload.unitsPerBox,
            erpUpdatedAt: eventUpdatedAt,
            lastSyncedAt: new Date(),
          },
        });
        hasChanges = true;

      } else if (event.eventType === "PRODUCT_CREATED" || event.eventType === "PRODUCT_UPDATED") {
        if (!payload.product) {
          throw new Error("Falta el campo 'product' en el payload del evento.");
        }

        const mapped = mapFacturadorProduct(
          payload.product,
          { categories: new Map(), brands: new Map() },
          config.source,
          new Date(),
        );

        if (!mapped.ok) {
          throw new Error(`Error de mapeo ERP: ${mapped.reason}`);
        }

        // Determinar si debemos activar el syncEnabled
        const syncEnabled = product ? product.syncEnabled : true;

        await prisma.product.upsert({
          where: { code: event.sku },
          create: {
            code: mapped.product.code,
            slug: mapped.product.slug,
            name: mapped.product.name,
            description: mapped.product.description,
            brand: mapped.product.brand,
            category: mapped.product.category,
            categoryId: mapped.product.categoryId,
            imageUrl: mapped.product.imageUrl,
            sourceImageUrl: mapped.product.imageUrl,
            unitLabel: mapped.product.unitLabel,
            unitPrice: new Prisma.Decimal(mapped.product.unitPrice),
            wholesalePrice: mapped.product.wholesalePrice === null ? null : new Prisma.Decimal(mapped.product.wholesalePrice),
            wholesaleMinQty: mapped.product.wholesaleMinQty,
            boxPrice: mapped.product.boxPrice === null ? null : new Prisma.Decimal(mapped.product.boxPrice),
            unitsPerBox: mapped.product.unitsPerBox,
            stockUnits: mapped.product.stockUnits,
            isVisible: mapped.product.isVisible,
            isFeatured: mapped.product.isFeatured,
            externalSource: mapped.product.externalSource,
            externalId: mapped.product.externalId,
            externalCode: mapped.product.externalCode,
            syncEnabled,
            erpUpdatedAt: eventUpdatedAt,
            lastSyncedAt: new Date(),
          },
          update: {
            name: mapped.product.name,
            description: mapped.product.description,
            brand: mapped.product.brand,
            category: mapped.product.category,
            categoryId: mapped.product.categoryId,
            imageUrl: mapped.product.imageUrl,
            sourceImageUrl: mapped.product.imageUrl,
            unitLabel: mapped.product.unitLabel,
            unitPrice: new Prisma.Decimal(mapped.product.unitPrice),
            wholesalePrice: mapped.product.wholesalePrice === null ? null : new Prisma.Decimal(mapped.product.wholesalePrice),
            wholesaleMinQty: mapped.product.wholesaleMinQty,
            boxPrice: mapped.product.boxPrice === null ? null : new Prisma.Decimal(mapped.product.boxPrice),
            unitsPerBox: mapped.product.unitsPerBox,
            stockUnits: mapped.product.stockUnits,
            isVisible: mapped.product.isVisible,
            isFeatured: mapped.product.isFeatured,
            erpUpdatedAt: eventUpdatedAt,
            lastSyncedAt: new Date(),
          },
        });
        hasChanges = true;

      } else if (event.eventType === "PRODUCT_DISABLED" || event.eventType === "PRODUCT_DELETED") {
        await prisma.product.update({
          where: { code: event.sku },
          data: {
            isVisible: false,
            syncEnabled: false,
            erpUpdatedAt: eventUpdatedAt,
            lastSyncedAt: new Date(),
          },
        });
        hasChanges = true;

      } else {
        throw new Error(`Tipo de evento no soportado: ${event.eventType}`);
      }

      // Marcar evento completado con éxito
      await prisma.syncEventQueue.update({
        where: { id: event.id },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          errorMessage: null,
        },
      });
      completed += 1;

    } catch (error) {
      const attempts = event.attempts + 1;
      const errorMessage = error instanceof Error ? error.message : "Error desconocido.";
      const maxAttempts = 5;

      await prisma.syncEventQueue.update({
        where: { id: event.id },
        data: {
          attempts,
          status: attempts >= maxAttempts ? "FAILED" : "PENDING",
          errorMessage: `[Intento ${attempts}/${maxAttempts}] ${errorMessage}`,
        },
      });
      failed += 1;
    }
  }

  // Si hubo cambios, invalidamos la caché
  if (hasChanges) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { revalidateTag, revalidatePath } = require("next/cache");
      revalidateTag("admin-dashboard", "max");
      revalidateTag("admin-product-stats", "max");
      revalidatePath("/admin");
      revalidatePath("/admin/products");
      revalidatePath("/");
      revalidatePath("/productos");
    } catch {
      // Ignorar si se ejecuta fuera de Next.js
    }
  }

  return {
    processed: pendingEvents.length,
    completed,
    failed,
  };
}
