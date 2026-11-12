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

/**
 * The laboratory has an independent, fail-closed switch. In particular, this
 * must not turn on the customer-facing bot switch while Messenger/Meta is
 * being prepared.
 */
export async function toggleBotTestEnvironmentAction() {
  await requireMessagingOwner();
  const settings = await prisma.storeSettings.findUnique({ where: { id: 1 } });

  if (settings) {
    await prisma.storeSettings.update({
      where: { id: 1 },
      data: { botTestEnvironmentEnabled: !settings.botTestEnvironmentEnabled },
    });
  } else {
    await prisma.storeSettings.create({
      data: { id: 1, botMasterSwitch: false, botTestEnvironmentEnabled: true },
    });
  }

  revalidatePath("/admin/mensajes/configuracion");
  revalidatePath("/admin/mensajes/simulador");
}

export async function updateProductRecommendationSettingsAction(formData: FormData) {
  await requireMessagingOwner();

  const requestedLimit = Number(formData.get("botProductCardLimit"));
  const botProductCardLimit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(5, requestedLimit))
    : 5;
  const botMoreOptionsEnabled = formData.get("botMoreOptionsEnabled") === "on";
  const botCatalogActionEnabled = formData.get("botCatalogActionEnabled") === "on";

  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {
      botProductCardLimit,
      botMoreOptionsEnabled,
      botCatalogActionEnabled,
    },
    create: {
      id: 1,
      // Guardar las preferencias no debe publicar automatización. La primera
      // activación siempre requiere el interruptor explícito del propietario.
      botMasterSwitch: false,
      botProductCardLimit,
      botMoreOptionsEnabled,
      botCatalogActionEnabled,
    },
  });

  revalidatePath("/admin/mensajes/configuracion");
}
