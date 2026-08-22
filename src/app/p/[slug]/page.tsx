import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getStoreSettings } from "@/lib/store-shared";
import { getQuoteDefaultsForSession } from "@/lib/quote-profile";
import { PublicFichaWorkspace } from "@/components/catalog/public-ficha-workspace";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PublicFichaPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PublicFichaPage({ params }: PublicFichaPageProps) {
  const routeParams = await params;
  const slug = routeParams.slug;

  if (!slug) {
    notFound();
  }

  // Fetch product with digital profile and related records
  const product = await prisma.product.findFirst({
    where: { slug },
    include: {
      digitalProfile: true,
      specifications: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      videos: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!product) {
    notFound();
  }

  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";
  const hasProfile = Boolean(product.digitalProfile);
  const isPublished = product.digitalProfile?.status === "PUBLICADA";

  // Check access permissions
  if (!hasProfile || (!isPublished && !isAdmin)) {
    return (
      <main className="site-shell" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px", textAlign: "center", background: "#f8fafc" }}>
        <div className="panel stack-md" style={{ maxWidth: "420px", background: "white", padding: "32px", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)" }}>
          <div style={{ fontSize: "48px" }}>📋</div>
          <h1 style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a", margin: 0 }}>Ficha Técnica en Preparación</h1>
          <p style={{ fontSize: "14px", color: "#64748b", margin: 0, lineHeight: "1.6" }}>
            La ficha digital y características interactivas para el producto <strong style={{ color: "#0f172a" }}>{product.name}</strong> aún se encuentran en borrador o mantenimiento.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", marginTop: "12px" }}>
            <Link
              href={`/producto/${product.slug}`}
              className="button button-primary"
              style={{ background: "#2320DA", color: "white", textDecoration: "none", padding: "12px", borderRadius: "8px", fontWeight: "bold", fontSize: "14px" }}
            >
              Ver Producto Regular
            </Link>
            <Link
              href="/"
              className="button button-neutral"
              style={{ textDecoration: "none", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", color: "#475569" }}
            >
              Ir al Catálogo General
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Record QR_OPEN event (only for real customers, not admin views)
  if (!isAdmin) {
    try {
      await prisma.qrAnalyticsLog.create({
        data: {
          productId: product.id,
          eventType: "QR_OPEN",
        },
      });
    } catch (e) {
      console.error("Failed to log QR scan event:", e);
    }
  }

  const [settings, quoteDefaults] = await Promise.all([
    getStoreSettings(),
    getQuoteDefaultsForSession(),
  ]);

  // Convert decimal to number fields to prevent serialization issues
  const mappedProduct: any = {
    ...product,
    unitPrice: Number(product.unitPrice),
    wholesalePrice: product.wholesalePrice ? Number(product.wholesalePrice) : null,
    boxPrice: product.boxPrice ? Number(product.boxPrice) : null,
  };

  return (
    <PublicFichaWorkspace
      product={mappedProduct}
      settings={settings}
      quoteDefaults={quoteDefaults}
      isAdminView={!isPublished && isAdmin}
    />
  );
}
