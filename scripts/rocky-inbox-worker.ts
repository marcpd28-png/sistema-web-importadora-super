import { RockyInbox } from "../src/lib/rocky-inbox";
import { planRockyResponse } from "../src/lib/rocky-engine";
import { rockyOutbox } from "../src/lib/rocky-outbox";
import { prisma } from "../src/lib/prisma";

const inbox = new RockyInbox(prisma, rockyOutbox, planRockyResponse);
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function loop() {
  while (!stopping) {
    try { await inbox.tick(); }
    catch { console.error("[rocky-inbox] processing interrupted; input remains recoverable"); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 500));
  }
}
async function main() {
  console.info("[rocky-inbox] started; durable ten-second debounce, two planning slots");
  await Promise.all([loop(), loop()]);
  await prisma.$disconnect();
}
void main().catch(() => { process.exitCode = 1; });
