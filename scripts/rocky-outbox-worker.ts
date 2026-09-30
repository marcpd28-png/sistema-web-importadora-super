import { rockyOutbox } from "../src/lib/rocky-outbox";
import { prisma } from "../src/lib/prisma";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.info("[rocky-outbox] started; persistent single-sender lock enabled");
  while (!stopping) {
    try { await rockyOutbox.tick(); }
    catch { console.error("[rocky-outbox] tick failed; no delivery retry outside the queue"); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 500));
  }
  await prisma.$disconnect();
}
void main().catch(() => { process.exitCode = 1; });
