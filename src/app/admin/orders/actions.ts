"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function approveOrderAction(orderId: string, adminNotes?: string) {
  await requireAdmin();

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "PAID",
      adminNotes: adminNotes || null,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function cancelOrderAction(orderId: string, reason?: string) {
  await requireAdmin();

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "CANCELED",
      adminNotes: reason || null,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function markShippedAction(orderId: string, adminNotes?: string) {
  await requireAdmin();

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "SHIPPED",
      adminNotes: adminNotes || null,
      updatedAt: new Date(),
    },
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function saveAdminNotesAction(orderId: string, adminNotes: string) {
  await requireAdmin();

  await prisma.order.update({
    where: { id: orderId },
    data: { adminNotes },
  });

  revalidatePath(`/admin/orders/${orderId}`);
}
