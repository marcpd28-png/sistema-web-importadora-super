import type { CSSProperties } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartDrawer } from "@/components/catalog/cart-drawer";
import { ProductCard } from "@/components/catalog/product-card";
import { ProductDetailView } from "@/components/catalog/product-detail-view";
import { PublicStoreHeader } from "@/components/catalog/public-store-header";
import { StoreSideActions } from "@/components/catalog/store-side-actions";
import { getQuoteDefaultsForSession } from "@/lib/quote-profile";
import { getPublicProductName } from "@/lib/product-name";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getCatalogProductBySlug } from "@/lib/store";

type ProductDetailPageProps = {
  params?: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function getPlainText(value: string | null | undefined) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const routeParams = params ? await params : undefined;
  const slug = routeParams?.slug;
  if (!slug) return {};

  const data = await getCatalogProductBySlug(slug);
  if (!data) return {};

  const product = data.product;
  const title = getPublicProductName(product.name);
  const plainDescription = getPlainText(product.description).slice(0, 160);
  const description = plainDescription || `Compra ${title} en Importaciones Super.`;
  const url = `/producto/${product.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      images: product.imageUrl ? [{ url: product.imageUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: product.imageUrl ? [product.imageUrl] : [],
    },
  };
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: ProductDetailPageProps) {
  const routeParams = params ? await params : undefined;
  const queryParams = searchParams ? await searchParams : undefined;
  const slug = routeParams?.slug;
  const initialCartOpen = queryParams?.drawer === "cart";

  if (!slug) {
    notFound();
  }

  const [data, quoteDefaults] = await Promise.all([
    getCatalogProductBySlug(slug),
    getQuoteDefaultsForSession(),
  ]);

  if (!data) {
    notFound();
  }

  const themeVars = {
    "--brand-primary": data.settings.primaryColor,
    "--brand-accent": data.settings.accentColor,
  } as CSSProperties & Record<"--brand-primary" | "--brand-accent", string>;
  const isAvailable = data.product.isVisible;
  const productName = getPublicProductName(data.product.name);
  const productDescription =
    getPlainText(data.product.description).slice(0, 160) ||
    `${productName} en Importaciones Super.`;
  const siteUrl = getPublicSiteUrl();
  const productImageUrl = data.product.imageUrl
    ? new URL(data.product.imageUrl, siteUrl).toString()
    : null;
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    image: productImageUrl ? [productImageUrl] : [],
    description: productDescription,
    sku: data.product.code,
    brand: data.product.brand ? { "@type": "Brand", name: data.product.brand } : undefined,
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/producto/${data.product.slug}`,
      priceCurrency: "PEN",
      price: data.product.unitPrice,
      availability:
        data.product.stockUnits > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        type="application/ld+json"
      />
      <main className="site-shell" style={themeVars}>
        <PublicStoreHeader />

      {isAvailable ? (
        <ProductDetailView key={data.product.slug} product={data.product} settings={data.settings} />
      ) : (
        <section className="panel product-unavailable-panel">
          <div className="stack-md">
            <div className="stack-xs">
              <p className="eyebrow">Producto no disponible</p>
              <h1>{data.product.name}</h1>
              <p className="muted">
                Este producto existe en el sistema, pero no está disponible para compra en este momento.
              </p>
            </div>

            <div className="product-unavailable-actions">
              <Link className="button button-catalog-back" href="/">
                Volver al catálogo
              </Link>
              <Link className="button button-primary" href="/?focus=search">
                Buscar otro producto
              </Link>
            </div>
          </div>
        </section>
      )}

      {isAvailable && data.relatedProducts.length ? (
        <section className="panel related-products-panel">
          <h2>Productos relacionados</h2>

          <div className="catalog-grid">
            {data.relatedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

        <StoreSideActions settings={data.settings} />
        <CartDrawer initialOpen={initialCartOpen} quoteDefaults={quoteDefaults} settings={data.settings} />
      </main>
    </>
  );
}
