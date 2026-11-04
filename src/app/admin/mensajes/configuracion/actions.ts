"use server";

import { prisma } from "@/lib/prisma";
import { requireMessagingOwner } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleBotAction() {
  await requireMessagingOwner();
  // StoreSettings is a singleton. Reading another historical row here would
  // make the visible switch disagree with the one enforced by Super Bot.
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });

  if (settings) {
    await prisma.storeSettings.update({
      where: { id: settings.id },
      data: { botMasterSwitch: !settings.botMasterSwitch },
    });
  } else {
    // With no singleton row, the UI shows a safe paused state. The action is
    // therefore an explicit first activation, not an implicit enablement.
    await prisma.storeSettings.upsert({
      where: { id: 1 },
      update: { botMasterSwitch: true },
      create: { id: 1, botMasterSwitch: true },
    });
  }

  revalidatePath("/admin/mensajes/configuracion");
}
