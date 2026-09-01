import { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";

const prisma = new PrismaClient();

async function main() {
  const productId = "erp_negocioserp-original_6222";
  
  // Find white variant image dynamically
  const blancoProduct = await prisma.product.findFirst({
    where: { code: "O702-BLANCO" },
    select: { imageUrl: true }
  });

  const blancoImageUrl = blancoProduct?.imageUrl || "/uploads/products/erp-o702-blanco.webp";

  // Clean old digital profile relationships
  await prisma.digitalProductProfile.deleteMany({ where: { productId } });
  await prisma.productSpecification.deleteMany({ where: { productId } });
  await prisma.productVariant.deleteMany({ where: { productId } });
  await prisma.productVideo.deleteMany({ where: { productId } });
  await prisma.productDocument.deleteMany({ where: { productId } });
  await prisma.productQr.deleteMany({ where: { productId } });

  // 1. Create DigitalProfile
  await prisma.digitalProductProfile.create({
    data: {
      productId,
      descriptionShort: "Auriculares inalámbricos con sonido JBL Deep Bass, hasta 40 horas de batería total y diseño ergonómico resistente a salpicaduras.",
      descriptionFull: "<p>Siente los bajos de tu música con la tecnología <strong>JBL Deep Bass Sound</strong>. Los auriculares inalámbricos <strong>JBL Wave Buds 2</strong> te brindan comodidad ergonómica para escuchar tus canciones favoritas todo el día.</p><p>Equipados con cancelación de ruido activa inteligente y modo Smart Ambient, podrás mantener el contacto con tu entorno sin quitarte los auriculares. Su diseño compacto y resistente al polvo y salpicaduras (certificación IP54) los convierte en tu compañero perfecto para entrenamientos y el día a día.</p>",
      status: "PUBLICADA",
    }
  });

  // 2. Create Specifications
  await prisma.productSpecification.createMany({
    data: [
      { productId, name: "Tamaño del Driver", value: "8 mm", sortOrder: 0 },
      { productId, name: "Respuesta de Frecuencia", value: "20 Hz - 20 kHz", sortOrder: 1 },
      { productId, name: "Conectividad", value: "Bluetooth v5.3 (LE Audio Ready)", sortOrder: 2 },
      { productId, name: "Autonomía Total", value: "Hasta 40 horas (10h auriculares + 30h estuche)", sortOrder: 3 },
      { productId, name: "Carga Rápida", value: "Sí (10 min de carga = 2 horas de reproducción)", sortOrder: 4 },
      { productId, name: "Resistencia al Agua", value: "IP54 en auriculares / IPX2 en estuche de carga", sortOrder: 5 },
      { productId, name: "Micrófonos", value: "Micrófono integrado con tecnología VoiceAware", sortOrder: 6 },
      { productId, name: "Compatibilidad App", value: "Compatible con JBL Headphones App", sortOrder: 7 },
    ]
  });

  // 3. Create Variants
  await prisma.productVariant.createMany({
    data: [
      {
        productId,
        name: "Negro Carbono",
        hexColor: "#1c1c1c",
        sku: "O702-NEGRO",
        imageUrl: "/uploads/products/erp-o702-negro-a5951c0be7ba.webp",
        isAvailable: true,
        sortOrder: 0
      },
      {
        productId,
        name: "Blanco Glaciar",
        hexColor: "#f5f5f5",
        sku: "O702-BLANCO",
        imageUrl: blancoImageUrl,
        isAvailable: true,
        sortOrder: 1
      }
    ]
  });

  // 4. Create Videos
  await prisma.productVideo.create({
    data: {
      productId,
      title: "JBL Wave Buds - Unboxing y Review en Español",
      url: "https://www.youtube.com/watch?v=wXG6BvE34fI",
      provider: "YOUTUBE",
      videoId: "wXG6BvE34fI",
      thumbnailUrl: "https://img.youtube.com/vi/wXG6BvE34fI/0.jpg",
      sortOrder: 0
    }
  });

  // 5. Create Documents
  await prisma.productDocument.create({
    data: {
      productId,
      title: "Guía de Inicio Rápido JBL Wave Buds (PDF)",
      url: "https://www.jbl.com.pe/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw836371cb/pdfs/JBL_Wave%20Buds_QSG_Global_SOP_V9_Screen.pdf",
      type: "PDF",
      sortOrder: 0
    }
  });

  // 6. Generate QR Code
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true }
  });

  if (product) {
    const siteUrl = "https://tiendavirtualsuper.com";
    const destUrl = `${siteUrl}/p/${product.slug}`;
    const qrCodeBase64 = await QRCode.toDataURL(destUrl, {
      margin: 1,
      width: 512,
      errorCorrectionLevel: 'H'
    });

    await prisma.productQr.create({
      data: {
        productId,
        destUrl,
        imageUrl: qrCodeBase64
      }
    });

    console.log("QR Code generado con éxito!");
  }

  console.log("Ficha del JBL Wave Buds 2 creada exitosamente con datos reales!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
