"use server";

import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

function invalidateAdminCaches() {
  try {
    revalidateTag("admin-dashboard", "max");
    revalidateTag("admin-product-stats", "max");
  } catch {
    // safe fallback
  }
}
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { clearSession, getSession, requireAdmin, createSession } from "@/lib/auth";
import { FacturadorApiError, FacturadorClient } from "@/lib/facturador/client";
import { parseFacturadorSyncMode, syncFacturadorProducts } from "@/lib/facturador/sync";
import { sendComplaintResponseEmail } from "@/lib/complaints-email";
import { slugify } from "@/lib/utils";
import type {
  ProductActionState,
  ProductFormValues,
  ProductMediaFormValue,
} from "@/components/admin/product-form-state";
import {
  parseAdminUserForm,
  parseAdminUserUpdateForm,
  productMediaListSchema,
  parseCategoryForm,
  parseSettingsForm,
  productSchema,
} from "@/lib/validation";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function resolveCategory(categoryId?: string) {
  if (!categoryId) {
    return {
      categoryId: null,
      category: null,
    };
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    return {
      categoryId: null,
      category: null,
    };
  }

  return {
    categoryId: category.id,
    category: category.name,
  };
}

function toRedirectError(error: unknown, fallback: string) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallback;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "Ya existe un registro con ese valor único. Revisa código, correo o nombre.";
  }

  return fallback;
}

function getProductFormValues(formData: FormData): ProductFormValues {
  const mediaTypes = formData.getAll("mediaType").map(String);
  const mediaUrls = formData.getAll("mediaUrl").map(String);
  const mediaAltTexts = formData.getAll("mediaAltText").map(String);

  return {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    description: String(formData.get("description") ?? ""),
    technicalSpecs: String(formData.get("technicalSpecs") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    media: mediaTypes.map((type, index) => ({
      type: type === "VIDEO" ? "VIDEO" : "IMAGE",
      url: mediaUrls[index] ?? "",
      altText: mediaAltTexts[index] ?? "",
    })),
    unitLabel: String(formData.get("unitLabel") ?? "unidad"),
    stockUnits: String(formData.get("stockUnits") ?? "0"),
    unitPrice: String(formData.get("unitPrice") ?? ""),
    wholesalePrice: String(formData.get("wholesalePrice") ?? ""),
    wholesaleMinQty: String(formData.get("wholesaleMinQty") ?? "3"),
    boxPrice: String(formData.get("boxPrice") ?? ""),
    unitsPerBox: String(formData.get("unitsPerBox") ?? ""),
    isVisible: formData.get("isVisible") === "on",
    isFeatured: formData.get("isFeatured") === "on",
  };
}

function parseProductMedia(
  mediaItems: ProductMediaFormValue[],
): Array<{ type: "IMAGE" | "VIDEO"; url: string; altText?: string; sortOrder: number }> {
  const filteredItems = mediaItems.filter(
    (item) => item.url.trim() !== "" || item.altText.trim() !== "",
  );

  return productMediaListSchema.parse(filteredItems).map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}

function parseSyncMode(formData: FormData) {
  return parseFacturadorSyncMode(String(formData.get("syncMode") ?? ""));
}

function parseSyncReturnPath(formData: FormData) {
  const value = String(formData.get("returnTo") ?? "");

  if (value === "/admin" || value === "/admin/settings" || value === "/admin/erp") {
    return value;
  }

  return "/admin/erp";
}

function scheduleErpSync(options: Parameters<typeof syncFacturadorProducts>[0]) {
  setImmediate(() => {
    void syncFacturadorProducts(options)
      .catch((error) => {
        console.error("[ERP sync] background task failed:", error);
      })
      .finally(() => {
        revalidatePath("/");
        revalidatePath("/admin");
        revalidatePath("/admin/products");
        revalidatePath("/admin/settings");
        revalidatePath("/admin/erp");
        revalidatePath("/admin/categories");
    });
  });
}

function isErpConnectivityError(error: unknown) {
  return (
    error instanceof Error &&
    /fetch failed|timed out|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(error.message)
  );
}

function getErpConnectionErrorMessage(error: unknown) {
  if (error instanceof FacturadorApiError) {
    if (error.status === 401 || error.status === 403) {
      return "El ERP rechazó la autenticación. Revisa FACTURADOR_API_TOKEN.";
    }

    return `El ERP respondió HTTP ${error.status}: ${error.message}`;
  }

  if (isErpConnectivityError(error)) {
    const baseUrl = process.env.FACTURADOR_API_URL?.trim() || "ERP configurado";
    return `No se pudo conectar a ${baseUrl}. Revisa el host, DNS o firewall.`;
  }

  return error instanceof Error && error.message.trim()
    ? error.message
    : "No se pudo conectar al ERP.";
}

function mapProductActionError(
  error: unknown,
  values: ProductFormValues,
  fallback: string,
): ProductActionState {
  if (error instanceof ZodError) {
    const fieldErrors: ProductActionState["fieldErrors"] = {};

    for (const issue of error.issues) {
      const fieldName = issue.path[0];

      if (typeof fieldName === "number") {
        fieldErrors.media ??= issue.message;
        continue;
      }

      if (typeof fieldName === "string" && !(fieldName in fieldErrors)) {
        fieldErrors[fieldName as keyof ProductFormValues] = issue.message;
      }
    }

    return {
      message: error.issues[0]?.message ?? fallback,
      fieldErrors,
      values,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return {
      message: "El código del producto ya existe. Usa otro código.",
      fieldErrors: {
        code: "El código del producto ya existe.",
      },
      values,
    };
  }

  return {
    message: fallback,
    fieldErrors: {},
    values,
  };
}

export async function createProductFormAction(
  _prevState: ProductActionState,
  formData: FormData,
) {
  await requireAdmin();
  const values = getProductFormValues(formData);

  try {
    const data = productSchema.parse(values);
    const category = await resolveCategory(data.categoryId);
    const media = parseProductMedia(values.media);

    await prisma.product.create({
      data: {
        ...data,
        ...category,
        slug: slugify(`${data.name}-${data.code}`),
        media: media.length
          ? {
              create: media,
            }
          : undefined,
      },
    });
  } catch (error) {
    return mapProductActionError(error, values, "No se pudo crear el producto.");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  invalidateAdminCaches();
  redirect("/admin/products?status=created");
}

export async function updateProductFormAction(
  _prevState: ProductActionState,
  formData: FormData,
) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const values = getProductFormValues(formData);

  try {
    const data = productSchema.parse(values);
    const category = await resolveCategory(data.categoryId);
    const media = parseProductMedia(values.media);

    await prisma.product.update({
      where: { id: productId },
      data: {
        ...data,
        ...category,
        slug: slugify(`${data.name}-${data.code}`),
        media: {
          deleteMany: {},
          ...(media.length
            ? {
                create: media,
              }
            : {}),
        },
      },
    });
  } catch (error) {
    return mapProductActionError(error, values, "No se pudo actualizar el producto.");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  invalidateAdminCaches();
  redirect(`/admin/products/${productId}?status=updated`);
}

export async function logoutAction() {
  await clearSession();
  invalidateAdminCaches();
  redirect("/");
}

function parseComplaintStatus(value: string) {
  if (value === "NEW" || value === "IN_REVIEW" || value === "RESPONDED" || value === "CLOSED") {
    return value;
  }

  return "IN_REVIEW";
}

export async function updateComplaintAction(formData: FormData) {
  await requireAdmin();
  const complaintId = String(formData.get("complaintId") ?? "");
  const status = parseComplaintStatus(String(formData.get("status") ?? ""));
  const responseText = String(formData.get("responseText") ?? "").trim();
  const responseChannel = String(formData.get("responseChannel") ?? "").trim();

  if (!complaintId) {
    redirect("/admin/reclamos?status=error&error=No se encontró el reclamo.");
  }

  const session = await getSession();
  const repliedByEmail = session?.email || "admin@tiendavirtualsuper.com";

  const complaint = await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status,
      adminReply: responseText || null,
      repliedAt: responseText && (status === "RESPONDED" || status === "CLOSED") ? new Date() : null,
      repliedByEmail: responseText ? repliedByEmail : null,
    },
    select: {
      sheetNumber: true,
      names: true,
      lastNames: true,
      email: true,
      phone: true,
      reason: true,
    },
  });

  let emailNotice = "skipped";

  if (responseText && (responseChannel === "EMAIL" || responseChannel === "BOTH")) {
    const emailResult = await sendComplaintResponseEmail({
      contact: {
        claimCode: complaint.sheetNumber,
        customerName: `${complaint.names} ${complaint.lastNames}`,
        customerEmail: complaint.email,
        customerPhone: complaint.phone,
      },
      responseText,
      subject: complaint.reason,
    });

    emailNotice = emailResult.ok ? "sent" : `error-${encodeURIComponent(emailResult.message)}`;
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/reclamos");
  revalidatePath(`/admin/reclamos/${complaintId}`);
  redirect(
    `/admin/reclamos/${complaintId}?status=updated&emailStatus=${encodeURIComponent(
      emailNotice,
    )}`,
  );
}

export async function toggleProductVisibilityAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const nextValue = String(formData.get("nextValue") ?? "") === "true";

  await prisma.product.update({
    where: { id: productId },
    data: { isVisible: nextValue },
  });

  revalidatePath("/");
  revalidatePath("/admin/products");
  invalidateAdminCaches();
}

export async function deleteProductAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");

  await prisma.product.delete({
    where: { id: productId },
  });

  revalidatePath("/");
  revalidatePath("/admin/products");
  invalidateAdminCaches();
  redirect("/admin/products?status=deleted");
}

export async function bulkProductAction(formData: FormData) {
  await requireAdmin();
  const action = String(formData.get("bulkAction") ?? "");
  const productIds = formData.getAll("productIds").map(String).filter(Boolean);

  if (!productIds.length) {
    redirect("/admin/products?status=no-selection");
  }

  if (action === "hide") {
    await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { isVisible: false },
    });
    revalidatePath("/");
    revalidatePath("/admin/products");
    invalidateAdminCaches();
    redirect("/admin/products?status=bulk-hidden");
  }

  if (action === "delete") {
    await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
    revalidatePath("/");
    revalidatePath("/admin/products");
    invalidateAdminCaches();
    redirect("/admin/products?status=bulk-deleted");
  }

  redirect("/admin/products?status=invalid-action");
}

export async function hideProductsWithoutPhotoAction() {
  await requireAdmin();

  await prisma.product.updateMany({
    where: {
      isVisible: true,
      imageUrl: null,
      media: { none: {} },
    },
    data: {
      isVisible: false,
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  invalidateAdminCaches();
  redirect("/admin/products?status=photo-hidden&visibility=hidden&photo=missing");
}

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  try {
    const data = parseSettingsForm(formData);

    await prisma.storeSettings.upsert({
      where: { id: 1 },
      update: data,
      create: {
        id: 1,
        ...data,
      },
    });
  } catch (error) {
    const message = toRedirectError(error, "No se pudo actualizar la configuración.");
    redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  invalidateAdminCaches();
  redirect("/admin/settings?status=updated");
}

export async function syncProductsFromErpAction(formData: FormData) {
  const session = await requireAdmin();
  const syncMode = parseSyncMode(formData);
  const returnTo = parseSyncReturnPath(formData);
  let client: FacturadorClient;

  try {
    client = new FacturadorClient();
  } catch (error) {
    redirect(
      `${returnTo}?syncStatus=error&syncError=${encodeURIComponent(getErpConnectionErrorMessage(error))}`,
    );
  }

  if (syncMode === "INCREMENTAL" && !process.env.FACTURADOR_SYNC_UPDATED_SINCE_PARAM?.trim()) {
    redirect(
      `${returnTo}?syncStatus=error&syncError=${encodeURIComponent(
        "El modo incremental requiere FACTURADOR_SYNC_UPDATED_SINCE_PARAM.",
      )}`,
    );
  }

  try {
    await client.request("/items/records", {
      query: { page: 1 },
      retry: false,
    });
  } catch (error) {
    redirect(
      `${returnTo}?syncStatus=error&syncError=${encodeURIComponent(getErpConnectionErrorMessage(error))}`,
    );
  }

  scheduleErpSync({
    client,
    trigger: "MANUAL",
    initiatedByName: session.name,
    initiatedByEmail: session.email,
    syncMode,
  });

  redirect(`${returnTo}?syncStatus=running&syncMode=${syncMode}`);
}

export async function cancelErpSyncAction(formData: FormData) {
  const session = await requireAdmin();
  const syncLogId = String(formData.get("syncLogId") ?? "");

  if (!syncLogId) {
    redirect("/admin/erp?syncStatus=error&syncError=No se encontró la sincronización.");
  }

  await prisma.erpSyncLog.updateMany({
    where: {
      id: syncLogId,
      status: "RUNNING",
    },
    data: {
      status: "CANCELED",
      cancelRequestedAt: new Date(),
      canceledByName: session.name,
      canceledByEmail: session.email,
      errorMessage: "Cancelada desde el panel administrativo.",
      finishedAt: new Date(),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/erp");
  redirect("/admin/erp?syncStatus=cancelled");
}

export async function createCategoryAction(formData: FormData) {
  await requireAdmin();
  try {
    const data = parseCategoryForm(formData);

    await prisma.category.create({
      data: {
        name: data.name,
        slug: slugify(data.name),
      },
    });
  } catch (error) {
    const message = toRedirectError(error, "No se pudo crear la categoría.");
    redirect(`/admin/categories?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products/new");
  invalidateAdminCaches();
  redirect("/admin/categories?status=created");
}

export async function updateCategoryAction(formData: FormData) {
  await requireAdmin();
  const categoryId = String(formData.get("categoryId") ?? "");
  try {
    const data = parseCategoryForm(formData);

    await prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id: categoryId },
        data: {
          name: data.name,
          slug: slugify(data.name),
        },
      });

      await tx.product.updateMany({
        where: { categoryId: category.id },
        data: { category: category.name },
      });
    });
  } catch (error) {
    const message = toRedirectError(error, "No se pudo actualizar la categoría.");
    redirect(`/admin/categories?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  invalidateAdminCaches();
  redirect("/admin/categories?status=updated");
}

export async function deleteCategoryAction(formData: FormData) {
  await requireAdmin();
  const categoryId = String(formData.get("categoryId") ?? "");

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { categoryId },
      data: {
        categoryId: null,
        category: null,
      },
    });

    await tx.category.delete({
      where: { id: categoryId },
    });
  });

  revalidatePath("/");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  invalidateAdminCaches();
  redirect("/admin/categories?status=deleted");
}

export async function createAdminUserAction(formData: FormData) {
  await requireAdmin();

  try {
    const data = parseAdminUserForm(formData);
    const normalizedEmail = normalizeEmail(data.email);

    await prisma.user.create({
      data: {
        name: data.name,
        email: normalizedEmail,
        phone: data.phone ?? null,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: data.role,
      },
    });
  } catch (error) {
    const message = toRedirectError(error, "No se pudo crear el usuario.");
    redirect(`/admin/users?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  redirect("/admin/users?status=created");
}

export async function updateAdminUserAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    redirect("/admin/users?status=error&error=No se encontró el usuario.");
  }

  try {
    const data = parseAdminUserUpdateForm(formData);
    const normalizedEmail = normalizeEmail(data.email);
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!target) {
      redirect("/admin/users?status=error&error=No se encontró el usuario.");
    }

    if (target.role === "ADMIN" && data.role === "USERSHOP") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });

      if (adminCount <= 1) {
        redirect("/admin/users?status=error&error=Debe existir al menos un administrador.");
      }
    }

    const password = data.password?.trim() ?? "";
    const confirmPassword = data.confirmPassword?.trim() ?? "";
    const shouldUpdatePassword = Boolean(password && confirmPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: normalizedEmail,
        phone: data.phone ?? null,
        role: data.role,
        ...(shouldUpdatePassword
          ? {
              passwordHash: await bcrypt.hash(password, 10),
            }
          : {}),
      },
    });
  } catch (error) {
    const message = toRedirectError(error, "No se pudo actualizar el usuario.");
    redirect(`/admin/users/${userId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  if (session.userId === userId) {
    revalidatePath("/login");
  }
  redirect(`/admin/users/${userId}?status=updated`);
}

export async function deleteAdminUserAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    redirect("/admin/users?status=error&error=No se encontró el usuario.");
  }

  if (session.userId === userId) {
    redirect("/admin/users?status=error&error=No puedes eliminar tu propia cuenta activa.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!target) {
    redirect("/admin/users?status=error&error=No se encontró el usuario.");
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });

    if (adminCount <= 1) {
      redirect("/admin/users?status=error&error=Debe existir al menos un administrador.");
    }
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  redirect("/admin/users?status=deleted");
}

export async function changeRequiredPasswordAction(prevState: any, formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return { error: "No autorizado.", success: false };
  }

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!password || password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres.", success: false };
  }

  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden.", success: false };
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Actualizar en base de datos
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        passwordHash,
        requirePasswordChange: false,
      },
    });

    // Actualizar la sesión
    await createSession({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: "ADMIN",
      requirePasswordChange: false,
    });

    revalidatePath("/admin");
    return { success: true, error: "" };
  } catch (error) {
    console.error(error);
    return { error: "Ocurrió un error al actualizar la contraseña.", success: false };
  }
}
