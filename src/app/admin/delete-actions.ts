"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const SUPER_ADMIN_EMAIL = "mark@importadora.local";

export async function deleteQuoteAction(quoteId: string) {
  const session = await requireAdmin();

  if (session.email !== SUPER_ADMIN_EMAIL) {
    throw new Error("No tienes permisos de súper administrador para realizar esta acción.");
  }

  await prisma.quote.delete({
    where: { id: quoteId },
  });

  revalidatePath("/admin/quotes");
  revalidateTag("admin-dashboard");
  redirect("/admin/quotes");
}

export async function deleteOrderAction(orderId: string) {
  const session = await requireAdmin();

  if (session.email !== SUPER_ADMIN_EMAIL) {
    throw new Error("No tienes permisos de súper administrador para realizar esta acción.");
  }

  await prisma.order.delete({
    where: { id: orderId },
  });

  revalidatePath("/admin/orders");
  revalidateTag("admin-dashboard");
  redirect("/admin/orders");
}
