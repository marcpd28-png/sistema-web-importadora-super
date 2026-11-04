import { prisma } from "@/lib/prisma";

export type SuperBotAutomationState = "enabled" | "paused" | "unavailable";

export type SuperBotAutomationReader = () => Promise<{
  botMasterSwitch: boolean;
} | null>;

async function readStoreAutomationSwitch() {
  // This module is deliberately only imported by the internal Route Handler.
  // Keep the database read here so channel adapters cannot decide the switch
  // from client-provided data.
  return prisma.storeSettings.findUnique({
    where: { id: 1 },
    select: { botMasterSwitch: true },
  });
}

/**
 * A database failure or a missing singleton row must not silently enable
 * automatic customer replies. The owner must explicitly activate the switch
 * before a connected channel can answer customers.
 */
export async function getSuperBotAutomationState(
  read: SuperBotAutomationReader = readStoreAutomationSwitch,
): Promise<SuperBotAutomationState> {
  try {
    const settings = await read();
    return settings?.botMasterSwitch === true ? "enabled" : "paused";
  } catch {
    return "unavailable";
  }
}
