import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const productId = String(formData.get("productId") ?? "");

    if (!productId) {
      return NextResponse.json({ error: "No se especificó el producto" }, { status: 400 });
    }

    const descriptionShort = String(formData.get("descriptionShort") ?? "").trim();
    const descriptionFull = String(formData.get("descriptionFull") ?? "").trim();
    const status = String(formData.get("status") ?? "BORRADOR").trim();

    const specsStr = String(formData.get("specifications") ?? "[]");
    const variantsStr = String(formData.get("variants") ?? "[]");
    const videosStr = String(formData.get("videos") ?? "[]");
    const docsStr = String(formData.get("documents") ?? "[]");

    const specs = JSON.parse(specsStr);
    const variants = JSON.parse(variantsStr);
    const videos = JSON.parse(videosStr);
    const docs = JSON.parse(docsStr);

    const result = await prisma.$transaction(async (tx) => {
      // 1. DigitalProductProfile
      const profile = await tx.digitalProductProfile.upsert({
        where: { productId },
        create: {
          productId,
          descriptionShort,
          descriptionFull,
          status,
        },
        update: {
          descriptionShort,
          descriptionFull,
          status,
        },
      });

      // 2. Specifications
      await tx.productSpecification.deleteMany({ where: { productId } });
      if (specs.length > 0) {
        await tx.productSpecification.createMany({
          data: specs.map((s: any, idx: number) => ({
            productId,
            name: s.name,
            value: s.value,
            sortOrder: s.sortOrder ?? idx,
          })),
        });
      }

      // 3. Variants
      await tx.productVariant.deleteMany({ where: { productId } });
      if (variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((v: any, idx: number) => ({
            productId,
            name: v.name,
            hexColor: v.hexColor || null,
            imageUrl: v.imageUrl || null,
            sku: v.sku || null,
            isAvailable: v.isAvailable !== false,
            sortOrder: v.sortOrder ?? idx,
          })),
        });
      }

      // 4. Videos
      await tx.productVideo.deleteMany({ where: { productId } });
      if (videos.length > 0) {
        await tx.productVideo.createMany({
          data: videos.map((v: any, idx: number) => ({
            productId,
            title: v.title,
            url: v.url,
            provider: v.provider,
            videoId: v.videoId,
            thumbnailUrl: v.thumbnailUrl || null,
            sortOrder: v.sortOrder ?? idx,
          })),
        });
      }

      // 5. Documents
      await tx.productDocument.deleteMany({ where: { productId } });
      if (docs.length > 0) {
        await tx.productDocument.createMany({
          data: docs.map((d: any, idx: number) => ({
            productId,
            title: d.title,
            url: d.url,
            type: d.type,
            sortOrder: d.sortOrder ?? idx,
          })),
        });
      }

      return profile;
    });

    // Revalidate paths
    revalidatePath("/admin/fichas");
    revalidatePath(`/admin/fichas/${productId}`);
    
    // Get product slug to revalidate public sheet page
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { slug: true }
    });
    if (product?.slug) {
      revalidatePath(`/p/${product.slug}`);
    }

    return NextResponse.json({ ok: true, profile: result });
  } catch (error: any) {
    console.error("Error saving digital profile:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
