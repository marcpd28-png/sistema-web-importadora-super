import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { processQueuedImages } = await import("../src/lib/manychat-image-queue");
  const { reconcileDeliveryEvents } = await import("../src/lib/message-delivery");
  let stopped = false;
  process.once("SIGTERM", () => { stopped = true; });
  process.once("SIGINT", () => { stopped = true; });
  while (!stopped) {
    try {
      if (process.env.WHATSAPP_STATUS_SYNC_ENABLED === "true") await reconcileDeliveryEvents(prisma);
      if (process.env.MANYCHAT_IMAGE_QUEUE_ENABLED === "true" && process.env.MANYCHAT_IMAGE_FLOW_ENABLED === "true") {
        const apiKey = process.env.MANYCHAT_IMAGE_API_KEY?.trim();
        const signingSecret = process.env.N8N_INTERNAL_API_KEY?.trim();
        if (!apiKey || !signingSecret) throw new Error("Missing image provider configuration");
        await processQueuedImages(prisma, { apiKey, signingSecret });
      }
    } catch { console.error("[message-worker] Processing failed; persisted work retained for review/retry."); }
    if (!stopped) await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await prisma.$disconnect();
}
main().catch(() => { console.error("[message-worker] Startup failed"); process.exitCode = 1; });
