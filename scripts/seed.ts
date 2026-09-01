import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando creación de productos de prueba...");

  const testProducts = [
    {
      code: "TEST-001",
      name: "Auriculares Inalámbricos Pro",
      description: "Auriculares con cancelación de ruido activa.",
      slug: "auriculares-inalambricos-pro",
      unitPrice: 199.99,
      stockUnits: 50,
      isVisible: true,
      imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600&auto=format&fit=crop",
    },
    {
      code: "TEST-002",
      name: "Smartwatch Deportivo X",
      description: "Reloj inteligente resistente al agua con monitor de ritmo cardíaco.",
      slug: "smartwatch-deportivo-x",
      unitPrice: 149.50,
      stockUnits: 30,
      isVisible: true,
      imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=600&auto=format&fit=crop",
    },
    {
      code: "TEST-003",
      name: "Altavoz Bluetooth Portátil",
      description: "Altavoz compacto con batería de 24 horas y sonido 360.",
      slug: "altavoz-bluetooth-portatil",
      unitPrice: 89.90,
      stockUnits: 100,
      isVisible: true,
      imageUrl: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?q=80&w=600&auto=format&fit=crop",
    }
  ];

  for (const productData of testProducts) {
    const existingProduct = await prisma.product.findUnique({
      where: { code: productData.code },
    });

    if (existingProduct) {
      console.log(`El producto con código ${productData.code} ya existe.`);
    } else {
      const product = await prisma.product.create({
        data: productData,
      });
      console.log(`Producto creado: ${product.name} (Código: ${product.code})`);
    }
  }

  console.log("Creación de productos de prueba finalizada.");
}

main()
  .catch((e) => {
    console.error("Error al crear productos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
