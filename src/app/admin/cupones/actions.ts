"use server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function savePromoAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string | null;
  const code = formData.get("code") as string;
  const discountType = formData.get("discountType") as string;
  const discountValue = Number(formData.get("discountValue"));
  const commissionType = formData.get("commissionType") as string;
  const commissionValue = Number(formData.get("commissionValue"));
  const minOrderAmount = Number(formData.get("minOrderAmount"));
  const creatorId = formData.get("creatorId") as string | null;
  const isActive = formData.get("isActive") === "on";

  if (!code || isNaN(discountValue) || isNaN(commissionValue)) {
    throw new Error("Campos requeridos incompletos");
  }

  const payload = {
    code: code.toUpperCase().trim(),
    discountType,
    discountValue,
    commissionType,
    commissionValue,
    minOrderAmount: isNaN(minOrderAmount) ? 0 : minOrderAmount,
    creatorId: creatorId || null,
    isActive,
  };

  if (id) {
    await prisma.promoCode.update({
      where: { id },
      data: payload,
    });
  } else {
    // Check if code exists
    const exists = await prisma.promoCode.findUnique({ where: { code: payload.code } });
    if (exists) {
      throw new Error("El código ya existe");
    }
    await prisma.promoCode.create({
      data: payload,
    });
  }

  revalidatePath("/admin/cupones");
  redirect("/admin/cupones");
}

export async function deletePromoAction(id: string) {
  await requireAdmin();
  await prisma.promoCode.delete({ where: { id } });
  revalidatePath("/admin/cupones");
  redirect("/admin/cupones");
}
