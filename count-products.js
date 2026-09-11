const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function count() {
  try {
    const total = await prisma.product.count();
    const enriched = await prisma.product.count({
      where: {
        description: { not: null },
        technicalSpecs: { not: null }
      }
    });
    console.log(`TOTAL_PRODUCTS: ${total}`);
    console.log(`ENRICHED_PRODUCTS: ${enriched}`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

count();
