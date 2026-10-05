import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, FileText, MessageCircleMore, PackageCheck } from "lucide-react";
import { ReorderQuoteButton } from "@/components/catalog/reorder-quote-button";
import { CartDrawer } from "@/components/catalog/cart-drawer";
import { PublicStoreHeader } from "@/components/catalog/public-store-header";
import { StoreSideActions } from "@/components/catalog/store-side-actions";
import { requireShopper } from "@/lib/auth";
import { getShopperAccount, getShopperQuoteById, getStoreSettings } from "@/lib/store";
import type { ShopperQuoteDetailView } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ShopperQuoteDetailPageProps = {
  params: Promise<{ id: string }>;
};

function getQuoteStatusLabel(status: ShopperQuoteDetailView["status"]) {
  if (status === "ERP_REGISTERED") return "Registrada";
  if (status === "ERROR") return "Requiere revisión";
  return "Procesando";
}

function getTimeline(quote: ShopperQuoteDetailView) {
  if (quote.statusSteps.length) {
    return quote.statusSteps;
  }

  if (quote.status === "ERROR") {
    return [
      {
        status: "error" as const,
        text: quote.errorMessage ?? "La cotización requiere revisión del equipo comercial.",
      },
    ];
  }

  if (quote.status === "ERP_REGISTERED") {
    return [{ status: "success" as const, text: "Solicitud recibida correctamente." }];
  }

  return [{ status: "warning" as const, text: "Solicitud en proceso de registro." }];
}

export default async function ShopperQuoteDetailPage({ params }: ShopperQuoteDetailPageProps) {
  const session = await requireShopper();
  const { id } = await params;
  const [account, quote, settings] = await Promise.all([
    getShopperAccount(session.userId),
    getShopperQuoteById(session.userId, id),
    getStoreSettings(),
  ]);

  if (!account || !quote) {
    notFound();
  }

  const reorderItems = quote.items.flatMap((item) =>
    item.product ? [{ product: item.product, quantity: item.quantity }] : [],
  );
  const timeline = getTimeline(quote);

  return (
    <main className="site-shell shopper-shell">
      <PublicStoreHeader />

      <section className="panel shopper-quote-detail-hero">
        <div className="stack-sm">
          <Link className="button button-secondary" href="/cuenta">
            <ArrowLeft size={16} />
            Mi cuenta
          </Link>
          <div>
            <p className="eyebrow">Cotización</p>
            <h1>{quote.quoteNumber ?? "Solicitud de tienda"}</h1>
            <p className="muted">
              {new Intl.DateTimeFormat("es-PE", {
                hour12: true,
                timeZone: "America/Lima",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(quote.createdAt))}
            </p>
          </div>
        </div>

        <div className="shopper-quote-detail-summary">
          <span className={`shopper-quote-status is-${quote.status.toLowerCase()}`}>
            {getQuoteStatusLabel(quote.status)}
          </span>
          <strong>{formatCurrency(quote.total, quote.currencySymbol)}</strong>
          <span>{quote.itemCount} unidades</span>
          <ReorderQuoteButton items={reorderItems} />
        </div>
      </section>

      <section className="shopper-quote-detail-layout">
        <div className="shopper-store-main">
          <section className="panel shopper-quote-detail-card">
            <div className="shopper-rail-head">
              <PackageCheck size={18} />
              <h2>Productos solicitados</h2>
            </div>

            <div className="shopper-quote-line-list">
              {quote.items.map((item) => (
                <article className="shopper-quote-line" key={`${quote.id}-${item.code}`}>
                  <div>
                    <span>{item.code}</span>
                    <strong>{item.name}</strong>
                    <p>{item.tierLabel}</p>
                  </div>
                  <div>
                    <span>{item.quantity} und.</span>
                    <strong>{formatCurrency(item.total, quote.currencySymbol)}</strong>
                    {item.product ? (
                      <Link href={`/producto/${item.product.slug}`}>Ver producto</Link>
                    ) : (
                      <small>No disponible en catálogo</small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel shopper-quote-detail-card">
            <div className="shopper-rail-head">
              <Clock3 size={18} />
              <h2>Estado</h2>
            </div>
            <ol className="admin-quote-timeline">
              {timeline.map((step, index) => (
                <li className={`is-${step.status}`} key={`${step.status}-${index}`}>
                  <span />
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="shopper-commerce-rail">
          <section className="panel shopper-profile-card">
            <div className="shopper-rail-head">
              <FileText size={18} />
              <h2>Datos usados</h2>
            </div>
            <div className="shopper-account-card">
              <div className="shopper-account-row">
                <span>Cliente</span>
                <strong>{quote.customerName}</strong>
              </div>
              <div className="shopper-account-row">
                <span>Teléfono</span>
                <strong>{quote.customerPhone}</strong>
              </div>
              <div className="shopper-account-row">
                <span>Correo</span>
                <strong>{quote.customerEmail ?? "No registrado"}</strong>
              </div>
              <div className="shopper-account-row">
                <span>Dirección</span>
                <strong>{quote.customerAddress ?? "No registrada"}</strong>
              </div>
            </div>
          </section>

          <section className="panel shopper-support-card">
            <div className="shopper-rail-head">
              <MessageCircleMore size={18} />
              <h2>Continuar atención</h2>
            </div>
            {quote.whatsappHref ? (
              <a className="button button-primary" href={quote.whatsappHref} rel="noreferrer" target="_blank">
                <MessageCircleMore size={16} />
                Escribir por WhatsApp
              </a>
            ) : (
              <Link className="button button-primary" href="/">
                Volver a la tienda
              </Link>
            )}
          </section>
        </aside>
      </section>

      <StoreSideActions settings={settings} />
      <CartDrawer
        quoteDefaults={{
          name: account.name,
          phone: account.phone,
        }}
        settings={settings}
      />
    </main>
  );
}
