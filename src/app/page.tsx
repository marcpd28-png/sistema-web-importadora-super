import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { VisualCategories } from "@/components/catalog/visual-categories";
import { canonicalCategorySlug } from "@/lib/storefront-taxonomy";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCatalogPageData } from "@/lib/store";
import { getCatalogSearchDestination } from "@/lib/store";
import type { CatalogProduct } from "@/lib/store";
import { CatalogExperience } from "@/components/catalog/catalog-experience";
import { HeroCarousel } from "@/components/catalog/hero-carousel";
import { HeroBannerCarousel } from "@/components/catalog/hero-banner-carousel";
import { HeroProductCarousel } from "@/components/catalog/hero-product-carousel";
import { PublicStoreHeader } from "@/components/catalog/public-store-header";
import { StoreSideActions } from "@/components/catalog/store-side-actions";
import { StoreFooter } from "@/components/catalog/store-footer";
import { getQuoteDefaultsForSession } from "@/lib/quote-profile";
import { getPublicSiteUrl } from "@/lib/site-url";

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildCatalogPageHref(input: {
  brand?: string;
  category: string;
  collection?: string;
  featuredOnly: boolean;
  page: number;
  q: string;
  sort: string;
}) {
  const { brand = "all", category, collection = "", featuredOnly, page, q, sort } = input;
  return `/?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&brand=${encodeURIComponent(brand)}&sort=${encodeURIComponent(sort)}&page=${page}${featuredOnly ? "&featured=1" : ""}${collection ? `&collection=${encodeURIComponent(collection)}` : ""}`;
}

function getCollectionTitle(collection: string) {
  const titles: Record<string, string> = {
    alexas: "Amazon Echo y Alexa",
    consolas: "Consolas de videojuegos",
    drones: "Drones",
    "mas-vendidos": "Productos más vendidos",
    ofertas: "Ofertas",
    preventa: "Preventa",
    proyectores: "Proyectores",
    "pantallas-proyeccion": "Pantallas y accesorios de proyección",
    destacados: "Productos destacados",
  };

  return titles[collection];
}

function formatSlugTitle(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasHeroMedia(product: CatalogProduct) {
  return Boolean(product.primaryMedia?.url || product.imageUrl);
}

function scoreHeroProduct(product: CatalogProduct) {
  let score = 0;

  if (hasHeroMedia(product)) {
    score += 30;
  }

  if (product.isFeatured) {
    score += 15;
  }

  if (product.stockUnits > 0) {
    score += 10;
  }

  score += Math.min(10, Math.round(product.stockUnits / 15));
  score += product.brand ? 2 : 0;

  return score;
}

function pickHeroProducts(products: CatalogProduct[]) {
  const filtered = products.filter(hasHeroMedia);

  return filtered
    .slice()
    .sort((left, right) => {
      const scoreDelta = scoreHeroProduct(right) - scoreHeroProduct(left);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .slice(0, 8);
}

function CatalogPagination({
  brand,
  category,
  collection,
  featuredOnly,
  page,
  q,
  sort,
  totalPages,
  filters = "",
}: {
  brand: string;
  category: string;
  collection: string;
  featuredOnly: boolean;
  page: number;
  q: string;
  sort: string;
  totalPages: number;
  filters?: string;
}) {
  return (
    <section className="pagination-row">
      {page > 1 ? (
        <Link
          className="button button-secondary"
          href={buildCatalogPageHref({ brand, category, collection, featuredOnly, page: page - 1, q, sort }) + filters}
        >
          Página anterior
        </Link>
      ) : (
        <span />
      )}
      {page < totalPages ? (
        <Link
          className="button button-secondary"
          href={buildCatalogPageHref({ brand, category, collection, featuredOnly, page: page + 1, q, sort }) + filters}
        >
          Siguiente página
        </Link>
      ) : null}
    </section>
  );
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  const queryParams = searchParams ? await searchParams : undefined;

  const hasFilters = queryParams?.q || queryParams?.sort || queryParams?.collection || queryParams?.page || queryParams?.brand || queryParams?.minPrice || queryParams?.maxPrice || queryParams?.inStock || queryParams?.view;

  if (hasFilters) {
    return {
      robots: { index: false, follow: true },
    };
  }

  return { alternates: { canonical: typeof queryParams?.category === "string" && queryParams.category !== "all" ? `/?category=${encodeURIComponent(canonicalCategorySlug(queryParams.category))}` : "/" } };
}

export default async function Home({ searchParams }: HomeProps) {
  const params = searchParams ? await searchParams : undefined;
  const q = typeof params?.q === "string" ? params.q : "";
  const category = canonicalCategorySlug(typeof params?.category === "string" ? params.category : "all");
  const brand = typeof params?.brand === "string" ? params.brand : "all";
  const collection = typeof params?.collection === "string" ? params.collection : "";
  const sort = typeof params?.sort === "string" ? params.sort : "featured";
  const page = Number(typeof params?.page === "string" ? params.page : "1");
  const normalizedCollection = collection.toLowerCase();
  const resolvedQuery = q;
  const featuredOnly = params?.featured === "1";
  const price = (value: unknown) => typeof value === "string" && value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
  const minPrice = price(params?.minPrice);
  const maxPrice = price(params?.maxPrice);
  const inStock = params?.inStock === "1";
  const viewAll = params?.view === "all";
  const paginationFilters = new URLSearchParams();
  if (minPrice !== undefined) paginationFilters.set("minPrice", String(minPrice));
  if (maxPrice !== undefined) paginationFilters.set("maxPrice", String(maxPrice));
  if (inStock) paginationFilters.set("inStock", "1");
  if (viewAll) paginationFilters.set("view", "all");
  const initialCartOpen = params?.drawer === "cart";
  const focusSearch = params?.focus === "search";
  if (q && category === "all" && brand === "all" && !collection && !params?.sort && minPrice === undefined && maxPrice === undefined && !inStock && !viewAll) {
    const exactDestination = await getCatalogSearchDestination(q);

    if (exactDestination) {
      redirect(exactDestination.href);
    }
  }
  const [data, quoteDefaults] = await Promise.all([
    getCatalogPageData({
      query: resolvedQuery,
      minPrice, maxPrice, inStock, viewAll,
      category,
      brand,
      collection: normalizedCollection,
      page: Number.isNaN(page) ? 1 : page,
      featuredOnly,
      sort,
    }),
    getQuoteDefaultsForSession(),
  ]);
  const themeVars = {
    "--brand-primary": data.settings.primaryColor,
    "--brand-accent": data.settings.accentColor,
  } as CSSProperties & Record<"--brand-primary" | "--brand-accent", string>;
  const isSectionedView = data.isHomeView;
  const selectedCategory = data.selectedCategory;
  const categoryTitle =
    category !== "all" ? selectedCategory?.name ?? formatSlugTitle(category) : undefined;
  const catalogTitle =
    categoryTitle ??
    getCollectionTitle(normalizedCollection) ??
    (brand !== "all" ? `Marca: ${brand}` : undefined) ??
    (resolvedQuery ? `Resultados para "${resolvedQuery}"` : undefined) ??
    "Productos";

  const heroProducts = pickHeroProducts([...data.bestSellerProducts, ...data.products]);
  const siteUrl = getPublicSiteUrl();

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Importaciones Super",
    url: `${siteUrl}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ORIGINAL J J S.A.C.",
    alternateName: "Importaciones Super",
    taxID: "20605346392",
    url: `${siteUrl}/`,
    logo: `${siteUrl}/icon.png`,
    sameAs: [],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <main className="site-shell" id="home-top" style={themeVars}>
      <PublicStoreHeader
        brands={data.brands}
        categories={data.categories}
        focusSearch={focusSearch}
      />

      {isSectionedView ? (
        <section className="hero" data-hero>
          <div className="hero-grid hero-grid-centered">
            <div className="hero-panel hero-panel-fixed">
              {data.heroBanners.length ? (
                <HeroBannerCarousel
                  banners={data.heroBanners}
                  intervalSeconds={data.settings.heroAutoplaySeconds}
                />
              ) : heroProducts.length >= 2 ? (
                <HeroProductCarousel intervalSeconds={data.settings.heroAutoplaySeconds} products={heroProducts} />
              ) : data.settings.heroSlides.length ? (
                <HeroCarousel
                  intervalSeconds={data.settings.heroAutoplaySeconds}
                  slides={data.settings.heroSlides}
                />
              ) : (
                <>
                  <p>{data.settings.highlightMessage}</p>
                  <span>Atención: {data.settings.supportHours}</span>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {isSectionedView ? <VisualCategories families={data.families} /> : <>
        <CatalogFilters categories={[...data.families, ...data.categories]} brands={data.brands} category={category} collection={normalizedCollection}
          query={q} brand={brand} sort={sort} minPrice={minPrice} maxPrice={maxPrice} inStock={inStock} count={data.totalResults} featuredOnly={featuredOnly} />
        {selectedCategory?.slug.startsWith("familia-") ? <nav className="storefront-subcategories" aria-label="Subcategorías">{data.categories.filter(c => c.parentSlug === selectedCategory.slug).map(c => <Link key={c.slug} href={'/?category=' + c.slug}>{c.name}</Link>)}</nav> : null}
        {data.campaignDescription ? <p className="storefront-campaign-description">{data.campaignDescription}</p> : null}
        {normalizedCollection === "mas-vendidos" ? <p className="storefront-campaign-description">{data.salesSummary.hasRealSales ? (data.salesSummary.hasDatedSales ? "Ordenados por unidades vendidas en los últimos 15 días." : "Ordenados por unidades vendidas acumuladas en el ERP.") : "El ranking de ventas no está disponible en este momento. Puedes explorar las categorías."}</p> : null}
      </>}
      <section className="catalog-experience-shell" id="catalogo">
        <CatalogExperience
          bestSellerProducts={data.bestSellerProducts}
          catalogTitle={catalogTitle}
          categories={data.categories}
          categorySections={data.homeCategorySections}
          initialCartOpen={initialCartOpen}
          isSectionedView={isSectionedView}
          products={data.products}
          quoteDefaults={quoteDefaults}
          salesSummary={data.salesSummary}
          settings={data.settings}
        />
      </section>

      <StoreSideActions
        settings={data.settings}
        showHomeShortcut={data.totalResults === 0 || data.products.length === 0}
      />

      {!isSectionedView ? <CatalogPagination
        brand={brand}
        category={category}
        collection={normalizedCollection}
        featuredOnly={featuredOnly}
        page={data.page}
        q={resolvedQuery}
        sort={data.selectedSort}
        totalPages={data.totalPages}
        filters={paginationFilters.size ? "&" + paginationFilters.toString() : ""}
      /> : <Link className="button button-secondary" href="/?view=all">Ver todos los productos</Link>}

      <StoreFooter />
    </main>
    </>
  );
}
