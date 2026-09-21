"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { reviewOrder, OrderReviewError } from "@/lib/order-review";
import { revalidatePath } from "next/cache";

async function review(orderId: string, action: Parameters<typeof reviewOrder>[1]["action"], note?: string) {
  const actor = await requireAdmin();
  try {
    await reviewOrder(prisma, { orderId, actorId: actor.userId, action, note });
  } catch (error) {
    if (error instanceof OrderReviewError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true as const };
}

export async function approveOrderAction(orderId: string, note?: string) { return review(orderId, "PAYMENT_CONFIRMED", note); }
export async function cancelOrderAction(orderId: string, note?: string) { return review(orderId, "CANCELED", note); }
export async function markShippedAction(orderId: string, note?: string) { return review(orderId, "SHIPPED", note); }
export async function markDeliveredAction(orderId: string, note?: string) { return review(orderId, "DELIVERED", note); }
export async function saveAdminNotesAction(orderId: string, note: string) { return review(orderId, "NOTE", note); }
