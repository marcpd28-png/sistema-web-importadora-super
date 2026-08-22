import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const productId = String(formData.get("productId") ?? "");

    if (!productId) {
      return NextResponse.json({ error: "No se especificó el producto" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { slug: true },
    });

    if (!product) {
      return NextResponse.json({ error: "No se encontró el producto" }, { status: 404 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tiendavirtualsuper.com";
    const destUrl = `${siteUrl}/p/${product.slug}`;

    const qrDataUrl = await QRCode.toDataURL(destUrl, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    const qr = await prisma.productQr.upsert({
      where: { productId },
      create: {
        productId,
        destUrl,
        imageUrl: qrDataUrl,
      },
      update: {
        destUrl,
        imageUrl: qrDataUrl,
      },
    });

    revalidatePath("/admin/fichas");
    revalidatePath(`/admin/fichas/${productId}`);
    revalidatePath(`/p/${product.slug}`);

    return NextResponse.json({ ok: true, qr });
  } catch (error: any) {
    console.error("Error generating QR:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
