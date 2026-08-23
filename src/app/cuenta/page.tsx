import Link from "next/link";
import {
  BadgePercent,
  Boxes,
  ChevronRight,
  Clock3,
  FileText,
  HeartHandshake,
  MapPin,
  MessageCircleMore,
  ReceiptText,
  RotateCcw,
  SearchCode,
  ShoppingBag,
  Sparkles,
  Tags,
  UserRound,
} from "lucide-react";
import { requireShopper } from "@/lib/auth";
import { CartDrawer } from "@/components/catalog/cart-drawer";
import { PublicStoreHeader } from "@/components/catalog/public-store-header";
import { StoreSideActions } from "@/components/catalog/store-side-actions";
import { getCatalogPageData, getShopperAccount, getShopperQuoteHistory } from "@/lib/store";
import { buildPublicWhatsappHref, formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ShopperAccountPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

import { QuoteStatus } from "@prisma/client";

function getQuoteStatusLabel(status: QuoteStatus) {
  if (status === "ERP_REGISTERED") return "Registrada";
  if (status === "ERROR") return "Requiere revisión";
  if (status === "IN_REVIEW") return "En revisión";
  if (status === "RESPONDED") return "Respondido";
  if (status === "CLOSED") return "Cerrado";
  return "Procesando";
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export default async function ShopperAccountPage({ searchParams }: ShopperAccountPageProps) {
  const session = await requireShopper();
  const params = searchParams ? await searchParams : undefined;
  const initialCartOpen = params?.drawer === "cart";
  const [account, catalogData, featuredCatalogData, quoteHistory] = await Promise.all([
    getShopperAccount(session.userId),
    getCatalogPageData({
      page: 1,
    }),
    getCatalogPageData({
      featuredOnly: true,
      page: 1,
    }),
    getShopperQuoteHistory(session.userId),
  ]);

  if (!account) {
    return null;
  }

  const featuredProducts = featuredCatalogData.products.slice(0, 4);
  const featuredProductIds = new Set(featuredProducts.map((product) => product.id));
  const recommendedProducts = catalogData.products
    .filter((product) => !featuredProductIds.has(product.id))
    .slice(0, 6);
  const categoryShortcuts = catalogData.categories.slice(0, 8);
  const lastQuote = quoteHistory[0] ?? null;
  const quotedUnits = quoteHistory.reduce((sum, quote) => sum + quote.itemCount, 0);
  const quotedTotal = quoteHistory.reduce((sum, quote) => sum + quote.total, 0);
  const supportHref = buildPublicWhatsappHref();
  const firstName = getFirstName(account.name);

  return (
    <main className="site-shell shopper-shell">
      <PublicStoreHeader />

      <section className="panel shopper-account-hero">
        <div className="shopper-account-grid">
          <article className="shopper-welcome-copy">
            <div className="shopper-account-badge">
              <ShoppingBag size={18} />
              <span>Mi tienda</span>
            </div>
            <div className="stack-sm">
              <h1>Hola, {firstName}</h1>
              <p className="muted">
                Continúa comprando con tus cotizaciones, ofertas y datos de contacto en un solo lugar.
              </p>
            </div>

            <div className="shopper-quick-actions">
              <Link className="button button-primary" href="/">
                <SearchCode size={16} />
                Explorar catálogo
              </Link>
              <Link className="button button-secondary" href="/?featured=1">
                <Sparkles size={16} />
                Ofertas activas
              </Link>
              <Link className="button button-ghost" href="/cuenta?drawer=cart">
                <ReceiptText size={16} />
                Nueva cotización
              </Link>
            </div>
          </article>

          <article className="shopper-command-card">
            <div className="shopper-command-head">
              <span>Actividad</span>
              <strong>
                {lastQuote ? getQuoteStatusLabel(lastQuote.status) : "Lista para comprar"}
              </strong>
            </div>
            <div className="shopper-command-metrics">
              <div>
                <FileText size={17} />
                <strong>{quoteHistory.length}</strong>
                <span>Cotizaciones</span>
              </div>
              <div>
                <Boxes size={17} />
                <strong>{quotedUnits}</strong>
                <span>Unidades</span>
              </div>
              <div>
                <BadgePercent size={17} />
                <strong>{catalogData.stats.featuredCount}</strong>
                <span>Ofertas</span>
              </div>
            </div>
            <div className="shopper-last-order">
              <span>
                <Clock3 size={15} />
                Última cotización
              </span>
              <strong>
                {lastQuote
                  ? new Intl.DateTimeFormat("es-PE", {
                      timeZone: "America/Lima",
                      dateStyle: "medium",
                    }).format(new Date(lastQuote.createdAt))
                  : "Sin registros"}
              </strong>
              <em>
                {lastQuote
                  ? `${lastQuote.itemCount} unidades · ${formatCurrency(lastQuote.total, lastQuote.currencySymbol)}`
                  : "Tus compras aparecerán aquí."}
              </em>
            </div>
          </article>
        </div>
      </section>

      <nav className="shopper-account-tabs" aria-label="Secciones de mi cuenta">
        <a href="#cotizaciones">
          <FileText size={16} />
          Cotizaciones
        </a>
        <a href="#ofertas">
          <Sparkles size={16} />
          Ofertas
        </a>
        <a href="#categorias">
          <Tags size={16} />
          Categorías
        </a>
        <a href="#datos">
          <MapPin size={16} />
          Datos
        </a>
        <a href="#soporte">
          <MessageCircleMore size={16} />
          Soporte
        </a>
      </nav>

      <section className="shopper-store-layout">
        <div className="shopper-store-main">
          <section className="panel shopper-history-panel" id="cotizaciones">
            <div className="catalog-shortcuts-head">
              <div className="stack-xs">
                <p className="eyebrow">Mis compras</p>
                <h2>Cotizaciones recientes</h2>
                {quoteHistory.length ? (
                  <p className="muted">
                    {quotedUnits} unidades solicitadas ·{" "}
                    {formatCurrency(quotedTotal, catalogData.settings.currencySymbol)}
                  </p>
                ) : null}
              </div>
              <Link className="button button-primary" href="/cuenta?drawer=cart">
                <ReceiptText size={16} />
                Nueva cotización
              </Link>
            </div>

            {quoteHistory.length ? (
              <div className="shopper-order-list">
                {quoteHistory.map((quote) => (
                  <article className="shopper-order-card" key={quote.id}>
                    <div className="shopper-order-main">
                      <span>
                      {new Intl.DateTimeFormat("es-PE", {
                        timeZone: "America/Lima",
                        dateStyle: "medium",
                      }).format(new Date(quote.createdAt))}
                      </span>
                      <strong>{quote.quoteNumber ?? "Cotización tienda"}</strong>
                      <p>
                        {quote.items.map((item) => `${item.quantity} x ${item.name}`).join(" · ")}
                      </p>
                    </div>
                    <div className="shopper-order-meta">
                      <span className={`shopper-quote-status is-${quote.status.toLowerCase()}`}>
                        {getQuoteStatusLabel(quote.status)}
                      </span>
                      <strong>{formatCurrency(quote.total, quote.currencySymbol)}</strong>
                      <Link href={`/cuenta/cotizaciones/${quote.id}`}>
                        Ver detalle
                        <ChevronRight size={15} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <article className="shopper-empty-order">
                <FileText size={20} />
                <div>
                  <strong>No tienes cotizaciones todavía</strong>
                  <span>Agrega productos al carrito y envía tu primera solicitud.</span>
                </div>
                <Link className="button button-secondary" href="/">
                  Comprar ahora
                </Link>
              </article>
            )}
          </section>

          <section className="panel shopper-featured-panel" id="ofertas">
            <div className="catalog-shortcuts-head">
              <div className="stack-xs">
                <p className="eyebrow">Ofertas</p>
                <h2>Productos destacados</h2>
              </div>
              <Link className="button button-ghost" href="/?featured=1">
                Ver todo
              </Link>
            </div>

            {featuredProducts.length ? (
              <div className="shopper-product-strip">
                {featuredProducts.map((product) => (
                  <Link className="shopper-product-tile" href={`/producto/${product.slug}`} key={product.id}>
                    <span>{product.category ?? "Catálogo"}</span>
                    <strong>{product.name}</strong>
                    <em>{formatCurrency(product.unitPrice, catalogData.settings.currencySymbol)}</em>
                    <small>{product.stockUnits} disponibles</small>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted">Todavía no hay productos destacados configurados.</p>
            )}
          </section>

          <section className="panel shopper-category-panel" id="categorias">
            <div className="catalog-shortcuts-head">
              <div className="stack-xs">
                <p className="eyebrow">Categorías</p>
                <h2>Comprar por sección</h2>
              </div>
              <Link className="button button-secondary" href="/">
                Catálogo completo
              </Link>
            </div>
            <div className="category-shortcuts-grid shopper-category-grid">
              {categoryShortcuts.map((category) => (
                <Link
                  className="category-shortcut"
                  href={`/?category=${encodeURIComponent(category.slug)}`}
                  key={category.id}
                >
                  <Tags size={16} />
                  <strong>{category.name}</strong>
                  <span>Ver productos</span>
                </Link>
              ))}
            </div>
          </section>

          {recommendedProducts.length ? (
            <section className="panel shopper-recommendations-panel">
              <div className="catalog-shortcuts-head">
                <div className="stack-xs">
                  <p className="eyebrow">Explorar</p>
                  <h2>Más productos disponibles</h2>
                </div>
                <Link className="button button-secondary" href="/">
                  Ver catálogo
                </Link>
              </div>
              <div className="shopper-recommendation-list">
                {recommendedProducts.map((product) => (
                  <Link
                    className="shopper-recommendation-item"
                    href={`/producto/${product.slug}`}
                    key={product.id}
                  >
                    <span>{product.category ?? "Catálogo"}</span>
                    <strong>{product.name}</strong>
                    <em>{formatCurrency(product.unitPrice, catalogData.settings.currencySymbol)}</em>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="shopper-commerce-rail">
          <section className="panel shopper-profile-card" id="datos">
            <div className="shopper-rail-head">
              <UserRound size={18} />
              <h2>Datos de compra</h2>
            </div>
            <div className="shopper-account-card">
              <div className="shopper-account-row">
                <span>Correo</span>
                <strong>{account.email}</strong>
              </div>
              <div className="shopper-account-row">
                <span>Teléfono</span>
                <strong>{account.phone ?? "No registrado"}</strong>
              </div>
              <div className="shopper-account-row">
                <span>Cliente desde</span>
                <strong>
                  {new Intl.DateTimeFormat("es-PE", {
                    timeZone: "America/Lima",
                    dateStyle: "medium",
                  }).format(new Date(account.createdAt))}
                </strong>
              </div>
            </div>
            <Link className="button button-secondary" href="/cuenta?drawer=cart">
              Usar en cotización
            </Link>
          </section>

          <section className="panel shopper-reorder-card">
            <div className="shopper-rail-head">
              <RotateCcw size={18} />
              <h2>Comprar de nuevo</h2>
            </div>
            {lastQuote ? (
              <Link
                className="shopper-reorder-product"
                href={`/cuenta/cotizaciones/${lastQuote.id}`}
              >
                <span>{lastQuote.quoteNumber ?? "Última cotización"}</span>
                <strong>{formatCurrency(lastQuote.total, lastQuote.currencySymbol)}</strong>
                <em>{lastQuote.itemCount} unidades · Ver detalle</em>
              </Link>
            ) : (
              <p className="muted">
                Cuando cotices, tendrás aquí un acceso rápido para volver a comprar.
              </p>
            )}
          </section>

          <section className="panel shopper-support-card" id="soporte">
            <div className="shopper-rail-head">
              <HeartHandshake size={18} />
              <h2>Soporte comercial</h2>
            </div>
            <div className="shopper-support-row">
              <span>Horario</span>
              <strong>{catalogData.settings.supportHours}</strong>
            </div>
            <a className="button button-primary" href={supportHref} rel="noreferrer" target="_blank">
              <MessageCircleMore size={16} />
              WhatsApp
            </a>
          </section>
        </aside>
      </section>

      <StoreSideActions settings={catalogData.settings} />
      <CartDrawer
        initialOpen={initialCartOpen}
        quoteDefaults={{
          name: account.name,
          phone: account.phone,
        }}
        settings={catalogData.settings}
      />
    </main>
  );
}
