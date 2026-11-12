import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { refreshProductVisualImageIndex } from "@/lib/product-visual-image-index";

loadEnvConfig(process.cwd());

async function main() {
  const force = process.argv.includes("--force");
  const concurrency = Number.parseInt(process.env.PRODUCT_VISUAL_INDEX_CONCURRENCY ?? "8", 10);
  const summary = await refreshProductVisualImageIndex({
    concurrency: Number.isFinite(concurrency) ? concurrency : 8,
    force,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
