import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { buildMissingProductPhotoWhere } from "@/lib/product-photo-policy";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type BulkProductsPayload = {
  action?: string;
  productIds?: unknown;
};

function normalizeProductIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return Array.from(new Set(ids));
}

async function getProductsWithoutPhotoIds() {
  const products = await prisma.product.findMany({
    where: buildMissingProductPhotoWhere(),
    select: { id: true },
  });

  return products.map((product) => product.id);
}

export async function POST(request: Request) {
  await requireAdmin();

  let payload: BulkProductsPayload;

  try {
    payload = (await request.json()) as BulkProductsPayload;
  } catch {
    return NextResponse.json({ error: "No se pudo leer el cuerpo de la petición." }, { status: 400 });
  }

  const action = payload.action;
  const productIds = normalizeProductIds(payload.productIds);

  if (action !== "hide-without-photo" && !productIds.length) {
    return NextResponse.json({ error: "Debes seleccionar al menos un producto." }, { status: 400 });
  }

  if (
    action !== "hide" &&
    action !== "show" &&
    action !== "feature" &&
    action !== "unfeature" &&
    action !== "hide-without-photo"
  ) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }

  let updatedCount = 0;
  let hiddenWithoutPhotoCount = 0;

  if (action === "hide-without-photo") {
    const ids = await getProductsWithoutPhotoIds();

    if (!ids.length) {
      revalidatePath("/");
      revalidatePath("/admin");
      revalidatePath("/admin/products");
      return NextResponse.json({
        updatedCount: 0,
        hiddenWithoutPhotoCount: 0,
        message: "No había productos sin foto para ocultar.",
      });
    }

    const result = await prisma.product.updateMany({
      where: { id: { in: ids }, isVisible: true },
      data: { isVisible: false },
    });

    updatedCount = result.count;
    hiddenWithoutPhotoCount = result.count;
  } else if (action === "hide") {
    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { isVisible: false },
    });
    updatedCount = result.count;
  } else if (action === "show") {
    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { isVisible: true },
    });
    updatedCount = result.count;
  } else if (action === "feature") {
    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { isFeatured: true },
    });
    updatedCount = result.count;
  } else if (action === "unfeature") {
    const result = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { isFeatured: false },
    });
    updatedCount = result.count;
  }

  revalidatePath("/");
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/products");

  return NextResponse.json({
    action,
    updatedCount,
    hiddenWithoutPhotoCount,
  });
}
