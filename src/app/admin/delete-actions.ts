"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const SUPER_ADMIN_EMAILS = ["mark@importadora.com", "adminmark@importadora.com", "mark@importadora.local"];

export async function deleteQuoteAction(quoteId: string) {
  const session = await requireAdmin();

  if (!SUPER_ADMIN_EMAILS.includes(session.email)) {
    throw new Error("No tienes permisos de súper administrador para realizar esta acción.");
  }

  await prisma.quote.delete({
    where: { id: quoteId },
  });

  revalidatePath("/admin/quotes");
  redirect("/admin/quotes");
}

export async function deleteOrderAction(orderId: string) {
  const session = await requireAdmin();

  if (!SUPER_ADMIN_EMAILS.includes(session.email)) {
    throw new Error("No tienes permisos de súper administrador para realizar esta acción.");
  }

  await prisma.order.delete({
    where: { id: orderId },
  });

  revalidatePath("/admin/orders");
  redirect("/admin/orders");
}
