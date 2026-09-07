const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Creando 5 influencers...");
  const influencers = [];
  for (let i = 1; i <= 5; i++) {
    const inf = await prisma.user.upsert({
      where: { email: `influencer${i}@ejemplo.com` },
      update: {},
      create: {
        name: `Influencer ${i}`,
        email: `influencer${i}@ejemplo.com`,
        passwordHash: "hash",
        role: "PROMOTOR",
      }
    });
    influencers.push(inf);
  }

  console.log("Creando 5 códigos de descuento...");
  const promos = [];
  for (let i = 1; i <= 5; i++) {
    const promo = await prisma.promoCode.upsert({
      where: { code: `PROMO${i}X` },
      update: {},
      create: {
        code: `PROMO${i}X`,
        discountType: "PERCENTAGE",
        discountValue: 10 + i, // 11%, 12%, etc.
        commissionType: "FIXED",
        commissionValue: 5 + i, // S/6, S/7, etc.
        minOrderAmount: 50,
        creatorId: influencers[i - 1].id,
      }
    });
    promos.push(promo);
  }

  console.log("Generando 500 ventas aleatorias...");
  // Find a product to put in the orders
  const product = await prisma.product.findFirst();
  if (!product) {
    console.error("No hay productos en la base de datos.");
    return;
  }

  const now = new Date();
  
  for (let i = 0; i < 500; i++) {
    // Random promo
    const pIdx = Math.floor(Math.random() * promos.length);
    const promo = promos[pIdx];

    // Random date in the last 60 days
    const daysAgo = Math.floor(Math.random() * 60);
    const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    const baseTotal = 100 + Math.floor(Math.random() * 200); // 100 to 300
    const discountValue = Number(promo.discountValue);
    const discountAmount = (baseTotal * discountValue) / 100;
    const finalTotal = baseTotal - discountAmount;

    await prisma.order.create({
      data: {
        orderNumber: `ORD-SIM-${i}`,
        status: "PAID",
        paymentMethod: "TARJETA",
        culqiTokenId: "simulated",
        total: finalTotal,
        customerName: `Cliente Sim ${i}`,
        customerEmail: `cliente${i}@ejemplo.com`,
        customerPhone: "999999999",
        customerDocumentNumber: "12345678",
        customerDocumentType: "DNI",
        customerAddress: "Av. Falsa 123",
        promoCodeId: promo.id,
        discountAmount: discountAmount,
        commissionAmount: Number(promo.commissionValue),
        createdAt: createdAt,
        items: {
          create: [
            {
              productId: product.id,
              quantity: 1,
              unitPrice: baseTotal,
              total: baseTotal,
              name: product.name,
              code: product.slug,
              tierLabel: "UNIDAD",
            }
          ]
        }
      }
    });

    if (i % 50 === 0) console.log(`Creadas ${i}/500 ventas...`);
  }

  console.log("¡Simulación completada!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
