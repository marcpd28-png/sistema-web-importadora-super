import { SuperBotSimulator } from "@/components/admin/messages/simulator/SuperBotSimulator";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MensajesSimulatorPage() {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: 1 },
    select: { botTestEnvironmentEnabled: true },
  });

  return <SuperBotSimulator enabled={settings?.botTestEnvironmentEnabled === true} />;
}
