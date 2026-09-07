const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const percentageCode = await prisma.promoCode.upsert({
    where: { code: 'SUPER10' },
    update: {},
    create: {
      code: 'SUPER10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: 50,
      commissionType: 'FIXED',
      commissionValue: 5,
    },
  });
  
  const fixedCode = await prisma.promoCode.upsert({
    where: { code: 'FIJO20' },
    update: {},
    create: {
      code: 'FIJO20',
      discountType: 'FIXED',
      discountValue: 20,
      minOrderAmount: 100,
      commissionType: 'PERCENTAGE',
      commissionValue: 5,
    },
  });
  
  console.log("Test Promo Codes Created:", percentageCode.code, fixedCode.code);
}

main().catch(console.error).finally(() => prisma.$disconnect());
