import { catalogGenerationWorker } from "../src/lib/catalog-generation";
import { prisma } from "../src/lib/prisma";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.info("[catalog-generation] installed; durable PDF rendering worker started");
  while (!stopping) {
    try { await catalogGenerationWorker.tick(); }
    catch { console.error("[catalog-generation] tick failed; durable job remains retryable"); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  await prisma.$disconnect();
}

void main().catch(() => { process.exitCode = 1; });
