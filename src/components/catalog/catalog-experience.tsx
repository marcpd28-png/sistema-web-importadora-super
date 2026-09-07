"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  CatalogProduct,
  CatalogCategorySection,
  CatalogSalesSummary,
  CategoryOption,
  StoreSettingsView,
} from "@/lib/store";
import { CartStoreBootstrap } from "@/components/catalog/cart-store-bootstrap";
import { ProductCard } from "@/components/catalog/product-card";
import { CartDrawer } from "@/components/catalog/cart-drawer";

type CatalogExperienceProps = {
  bestSellerProducts?: CatalogProduct[];
  catalogTitle?: string;
  categories?: CategoryOption[];
  categorySections?: CatalogCategorySection[];
  isSectionedView?: boolean;
  products: CatalogProduct[];
  salesSummary?: CatalogSalesSummary;
  settings: StoreSettingsView;
  initialCartOpen?: boolean;
  quoteDefaults?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

type ProductSectionProps = {
  title: string;
  subtitle?: string;
  products: CatalogProduct[];
  settings: StoreSettingsView;
  href: string;
  featured?: boolean;
  limit?: number;
  compact?: boolean;
};

const FEATURED_SECTION_LIMIT = 8;
const GRID_SECTION_LIMIT = 8;
const CATEGORY_SECTION_MIN = 6;

const CATEGORY_SECTION_LIMIT = 12;

const takeSectionProducts = (items: CatalogProduct[], limit: number) =>
  items.slice(0, limit);

const fillSectionProducts = (
  preferredProducts: CatalogProduct[],
  allProducts: CatalogProduct[],
  offset = 0,
  limit = GRID_SECTION_LIMIT,
) => {
  const selected: CatalogProduct[] = [];
  const selectedIds = new Set<string>();

  const addProduct = (product: CatalogProduct) => {
    if (selected.length >= limit || selectedIds.has(product.id)) {
      return;
    }

    selectedIds.add(product.id);
    selected.push(product);
  };

  preferredProducts.forEach(addProduct);

  if (selected.length >= limit) {
    return selected;
  }

  const rotatedFallbackProducts = [
    ...allProducts.slice(offset),
    ...allProducts.slice(0, offset),
  ];

  sortProductsByImageQuality(rotatedFallbackProducts).forEach(addProduct);

  return selected;
};

function buildCategorySections(
  categories: CategoryOption[] | undefined,
  products: CatalogProduct[],
  bestSellerProducts: CatalogProduct[],
) {
  if (!categories?.length) {
    return [];
  }

  const productCountByCategoryId = new Map<string, number>();
  const bestSellerCountByCategoryId = new Map<string, number>();

  for (const product of products) {
    if (!product.categoryId) {
      continue;
    }

    productCountByCategoryId.set(
      product.categoryId,
      (productCountByCategoryId.get(product.categoryId) ?? 0) + 1,
    );
  }

  for (const product of bestSellerProducts) {
    if (!product.categoryId) {
      continue;
    }

    bestSellerCountByCategoryId.set(
      product.categoryId,
      (bestSellerCountByCategoryId.get(product.categoryId) ?? 0) + 1,
    );
  }

  return categories
    .map((category) => {
      const productsInCategory = products.filter((product) => product.categoryId === category.id);
      const productCount = productCountByCategoryId.get(category.id) ?? productsInCategory.length;
      const bestSellerCount = bestSellerCountByCategoryId.get(category.id) ?? 0;

      return {
        category,
        productCount,
        bestSellerCount,
        products: sortProductsByImageQuality(productsInCategory).slice(0, GRID_SECTION_LIMIT),
      };
    })
    .filter((item) => item.productCount >= CATEGORY_SECTION_MIN && item.products.length >= CATEGORY_SECTION_MIN)
    .sort((left, right) => {
      const scoreDelta = right.bestSellerCount - left.bestSellerCount;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const countDelta = right.productCount - left.productCount;

      if (countDelta !== 0) {
        return countDelta;
      }

      return left.category.name.localeCompare(right.category.name);
    })
    .slice(0, CATEGORY_SECTION_LIMIT);
}

const isAdultCatalogProduct = (product: CatalogProduct) => {
  const text =
    `${product.name} ${product.category ?? ""} ${product.brand ?? ""}`.toLowerCase();

  return (
    text.includes("juguetes sexuales") ||
    text.includes("consolador") ||
    text.includes("pretty love") ||
    text.includes("vibrator") ||
    text.includes("we love")
  );
};

const hasUsableProductImage = (product: CatalogProduct) => {
  const mediaUrl = product.primaryMedia?.url ?? product.imageUrl ?? "";
  const normalized = mediaUrl.toLowerCase();

  return (
    Boolean(mediaUrl.trim()) &&
    product.primaryMedia?.type !== "VIDEO" &&
    !normalized.includes("imagen-no-disponible") &&
    !normalized.includes("placeholder")
  );
};

const sortProductsByImageQuality = (items: CatalogProduct[]) =>
  items.slice().sort((left, right) => {
    const leftHasImage = hasUsableProductImage(left) ? 1 : 0;
    const rightHasImage = hasUsableProductImage(right) ? 1 : 0;

    if (leftHasImage !== rightHasImage) {
      return rightHasImage - leftHasImage;
    }

    if (left.isFeatured !== right.isFeatured) {
      return Number(right.isFeatured) - Number(left.isFeatured);
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

function ProductSection({
  title,
  subtitle,
  products,
  settings,
  href,
  featured = false,
  limit,
  compact = false,
}: ProductSectionProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const sectionLimit = limit ?? (featured ? FEATURED_SECTION_LIMIT : GRID_SECTION_LIMIT);

  const sectionProducts = takeSectionProducts(products, sectionLimit);

  if (!sectionProducts.length) {
    return null;
  }

  const scrollFeatured = (direction: "prev" | "next") => {
    const slider = sliderRef.current;

    if (!slider) {
      return;
    }

    const step = compact ? slider.clientWidth : slider.clientWidth * 0.78;

    slider.scrollBy({
      behavior: "smooth",
      left:
        direction === "next"
          ? step
          : -step,
    });
  };
  return (
    <section
      className={`catalog-section ${
        featured ? "catalog-section-featured" : ""
      } ${compact ? "catalog-section-compact" : ""
      }`}
    >
      <div className="catalog-section-header">
        <div>
          <p className="catalog-section-eyebrow">
            {featured ? "Selección destacada" : "Colección"}
          </p>

          <h2>{title}</h2>

          {subtitle ? <p>{subtitle}</p> : null}
        </div>

        <div className="catalog-section-actions">
          {featured ? (
            <div
              className="catalog-slider-controls"
              aria-label="Controles de productos destacados"
            >
              <button
                aria-label="Ver productos anteriores"
                className="catalog-slider-button"
                onClick={() => scrollFeatured("prev")}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                aria-label="Ver productos siguientes"
                className="catalog-slider-button"
                onClick={() => scrollFeatured("next")}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}

          <Link className="catalog-section-link" href={href}>
            Ver más
          </Link>
        </div>
      </div>

      {featured ? (
        <div className="catalog-featured-slider" ref={sliderRef}>
          {sectionProducts.map((product) => (
            <div className="catalog-featured-slide" key={product.id}>
              <ProductCard product={product} settings={settings} />
            </div>
          ))}
        </div>
      ) : (
        <div className="catalog-section-grid">
          {sectionProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              settings={settings}
            />
          ))}
        </div>
      )}
    </section>
  );
}


function ProductGridView({
  products,
  settings,
  title = "Productos",
}: {
  products: CatalogProduct[];
  settings: StoreSettingsView;
  title?: string;
}) {
  return (
    <section className="catalog-section catalog-results-section">
      <div className="catalog-section-header">
        <div>
          <p className="catalog-section-eyebrow">Catálogo</p>
          <h2>{title}</h2>
        </div>
      </div>

      {products.length ? (
        <div className="catalog-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} settings={settings} />
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <h2>No hay productos disponibles</h2>
          <p>Prueba con otra categoría o busca otro producto.</p>
        </section>
      )}
    </section>
  );
}

export function CatalogExperience({
  bestSellerProducts = [],
  catalogTitle,
  categories = [],
  categorySections: homeCategorySections = [],
  isSectionedView = true,
  products,
  salesSummary,
  settings,
  initialCartOpen = false,
  quoteDefaults = null,
}: CatalogExperienceProps) {
  const storefrontProducts = products.filter(
    (product) => !isAdultCatalogProduct(product),
  );
  const storefrontBestSellerProducts = bestSellerProducts.filter(
    (product) => !isAdultCatalogProduct(product),
  );
  const featuredProducts = products.filter(
    (product) => product.isFeatured && !isAdultCatalogProduct(product),
  );

  const hasRealBestSellers =
    Boolean(salesSummary?.hasRealSales) && storefrontBestSellerProducts.length > 0;
  const topProducts = fillSectionProducts(
    hasRealBestSellers
      ? storefrontBestSellerProducts
      : featuredProducts.length
        ? sortProductsByImageQuality(featuredProducts)
        : sortProductsByImageQuality(storefrontProducts),
    storefrontProducts,
    0,
    FEATURED_SECTION_LIMIT,
  );
  const categorySections = homeCategorySections.length
    ? homeCategorySections
    : buildCategorySections(categories, storefrontProducts, storefrontBestSellerProducts);

  return (
    <>
      <CartStoreBootstrap />

      {isSectionedView ? (
        <div className="catalog-sections-layout">
          <ProductSection
            featured
            compact
            title={hasRealBestSellers ? "Productos más vendidos" : "Productos destacados"}
            subtitle={hasRealBestSellers ? "Ventas ERP por producto y rotación por unidades." : undefined}
            href="/?collection=mas-vendidos"
            products={topProducts}
            settings={settings}
          />

          {categorySections.map(({ category, products: categoryProducts }) => (
            <ProductSection
              key={category.id}
              href={`/categoria/${category.slug}`}
              products={categoryProducts}
              settings={settings}
              title={category.name}
            />
          ))}
        </div>
      ) : (
        <ProductGridView products={products} settings={settings} title={catalogTitle} />
      )}

      <CartDrawer
        initialOpen={initialCartOpen}
        quoteDefaults={quoteDefaults}
        settings={settings}
      />
    </>
  );
}
