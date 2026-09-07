import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const testProducts = [
  {
    code: "TEST-001",
    name: "Auriculares Inalámbricos Pro (Prueba)",
    slug: "auriculares-inalambricos-pro-prueba",
    unitPrice: 199.99,
    stockUnits: 50,
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600&auto=format&fit=crop",
  },
  {
    code: "TEST-002",
    name: "Smartwatch Deportivo X (Prueba)",
    slug: "smartwatch-deportivo-x-prueba",
    unitPrice: 149.5,
    stockUnits: 30,
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600&auto=format&fit=crop",
  },
  {
    code: "TEST-003",
    name: "Altavoz Bluetooth Portátil (Prueba)",
    slug: "altavoz-bluetooth-portatil-prueba",
    unitPrice: 89.9,
    stockUnits: 100,
    imageUrl:
      "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?q=80&w=600&auto=format&fit=crop",
  },
] as const;

async function main() {
  for (const product of testProducts) {
    await prisma.product.upsert({
      where: { code: product.code },
      update: product,
      create: {
        ...product,
        description: "Producto local para probar catálogo, carrito y checkout.",
        brand: "DEMO",
        category: "Pruebas locales",
        isVisible: true,
      },
    });
  }

  const promo = await prisma.promoCode.upsert({
    where: { code: "TEST10" },
    update: { isActive: true },
    create: {
      code: "TEST10",
      discountType: "PERCENTAGE",
      discountValue: 10,
      minOrderAmount: 0,
      commissionType: "FIXED",
      commissionValue: 5,
      isActive: true,
    },
  });

  const auriculares = await prisma.product.findUniqueOrThrow({ where: { code: "TEST-001" } });
  const smartwatch = await prisma.product.findUniqueOrThrow({ where: { code: "TEST-002" } });

  await prisma.order.upsert({
    where: { orderNumber: "TEST-ORD-PAID" },
    update: {},
    create: {
      orderNumber: "TEST-ORD-PAID",
      status: "PAID",
      paymentMethod: "TEST",
      culqiChargeId: "test-charge-paid",
      customerName: "Cliente Prueba Pagado",
      customerPhone: "999999991",
      customerAddress: "Av. Demo 123, Miraflores",
      deliveryType: "DELIVERY",
      currencySymbol: "PEN",
      total: 179.99,
      discountAmount: 20,
      commissionAmount: 5,
      promoCodeId: promo.id,
      promoCodeStr: promo.code,
      items: {
        create: [
          {
            productId: auriculares.id,
            code: auriculares.code,
            name: auriculares.name,
            quantity: 1,
            unitPrice: 199.99,
            total: 199.99,
            tierLabel: "UNIDAD",
          },
        ],
      },
    },
  });

  await prisma.order.upsert({
    where: { orderNumber: "TEST-ORD-PENDING" },
    update: {},
    create: {
      orderNumber: "TEST-ORD-PENDING",
      status: "PENDING",
      paymentMethod: "INTERBANK",
      customerName: "Cliente Prueba Pendiente",
      customerPhone: "999999992",
      customerAddress: "Recojo en tienda",
      deliveryType: "PICKUP",
      currencySymbol: "PEN",
      total: 149.5,
      items: {
        create: [
          {
            productId: smartwatch.id,
            code: smartwatch.code,
            name: smartwatch.name,
            quantity: 1,
            unitPrice: 149.5,
            total: 149.5,
            tierLabel: "UNIDAD",
          },
        ],
      },
    },
  });

  console.log("Datos locales creados: TEST-001, TEST-002, TEST-003, TEST10, TEST-ORD-PAID y TEST-ORD-PENDING.");
}

main()
  .catch((error) => {
    console.error("No se pudieron crear los datos de prueba:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
