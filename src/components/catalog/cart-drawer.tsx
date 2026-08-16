"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Minus,
  Plus,
  RefreshCcw,
  ReceiptText,
  ShoppingCart,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { STORE_CART_OPEN_EVENT } from "@/components/catalog/cart-events";
import { rehydrateCartStore } from "@/components/catalog/cart-store";
import { getSafeMediaUrl, getOptimizedImageUrl } from "@/lib/media-url";
import { getLinePricing } from "@/lib/pricing";
import type { StoreSettingsView } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { useCartStore } from "@/components/catalog/cart-store";

type CartDrawerProps = {
  settings: StoreSettingsView;
  initialOpen?: boolean;
  quoteDefaults?: QuoteDraftDefaults | null;
};

type QuoteDraftDefaults = {
  name?: string | null;
  phone?: string | null;
};

type QuoteDraft = {
  name: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  note: string;
};

type QuoteStatusStep = {
  status: "success" | "warning" | "error";
  text: string;
};

type CartLine = {
  item: ReturnType<typeof useCartStore.getState>["items"][number];
  pricing: ReturnType<typeof getLinePricing>;
};

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M20.2 3.8A10.7 10.7 0 0 0 12.6 1h-.2C6.8 1 2.2 5.5 2.2 11.1c0 1.9.5 3.8 1.5 5.4L2 23l6.6-1.7c1.6.9 3.3 1.4 5.2 1.4h.1c5.6 0 10.1-4.5 10.1-10.1 0-2.7-1.1-5.2-3.1-7.1ZM14 19.3h-.1c-1.6 0-3.2-.4-4.6-1.3l-.3-.2-3.9 1 1-3.8-.2-.3a8 8 0 0 1-1.3-4.4c0-4.4 3.6-8 8.1-8h.1a8 8 0 0 1 5.7 2.3 8 8 0 0 1 2.4 5.7c0 4.4-3.6 8-8 8ZM18.4 14.2c-.3-.2-1.7-.9-2-.9-.3-.1-.5-.2-.7.2s-.8.9-1 .1-.5-.9-.9-1.2c-.4-.3-.7-.3-.5-.6.1-.2.6-.7.7-1 .2-.2.1-.5 0-.7-.1-.2-.7-1.6-1-2.2-.2-.6-.5-.5-.7-.5H11c-.2 0-.5.1-.8.4-.3.3-1.1 1-1.1 2.4s1.2 2.7 1.4 2.9c.2.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 1.9-1.3.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.6-.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

const DOCUMENT_TYPE_OPTIONS = [
  { label: "Sin documento", value: "" },
  { label: "DNI", value: "1" },
  { label: "RUC", value: "6" },
  { label: "Carnet ext.", value: "4" },
  { label: "Pasaporte", value: "7" },
] as const;

function buildInitialQuoteDraft(
  settings: StoreSettingsView,
  defaults?: QuoteDraftDefaults | null,
): QuoteDraft {
  return {
    documentNumber: "",
    documentType: "",
    name: defaults?.name?.trim() ?? "",
    note: settings.orderFooter,
    phone: defaults?.phone?.trim() ?? "",
  };
}

function CartHeader({
  hasItems,
  onClose,
  onClear,
}: {
  hasItems: boolean;
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="cart-header">
      <button
        className="button button-ghost cart-header-clear"
        disabled={!hasItems}
        onClick={onClear}
        type="button"
      >
        Vaciar carrito
      </button>
      <div className="cart-header-actions">
        <button className="icon-button icon-button-close" onClick={onClose} type="button">
          ×
        </button>
      </div>
    </div>
  );
}

function CartList({
  currencySymbol,
  onRemove,
  onSetQuantity,
  orderLines,
}: {
  currencySymbol: string;
  onRemove: (key: string) => void;
  onSetQuantity: (key: string, quantity: number) => void;
  orderLines: CartLine[];
}) {
  return (
    <div className="cart-list">
      {orderLines.map(({ item, pricing }) => (
        <article className="cart-item" key={item.key}>
          <div className="cart-item-main">
            <div className="cart-item-thumb">
              {getSafeMediaUrl(item.imageUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={item.imageAlt ?? item.name}
                  decoding="async"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={getOptimizedImageUrl(item.imageUrl, 96) ?? undefined}
                />
              ) : (
                <span>{item.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="stack-xs">
              <div className="cart-item-head">
                <h3>{item.name}</h3>
                <button className="icon-button" onClick={() => onRemove(item.key)} type="button">
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="muted">
                {item.code} · {pricing.tierLabel}
              </p>
              <p className="cart-total">{formatCurrency(pricing.total, currencySymbol)}</p>
            </div>
          </div>

          <div className="qty-control">
            <button onClick={() => onSetQuantity(item.key, item.quantity - 1)} type="button">
              <Minus size={16} />
            </button>
            <span>{item.quantity}</span>
            <button onClick={() => onSetQuantity(item.key, item.quantity + 1)} type="button">
              <Plus size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CartFooter({
  currencySymbol,
  onOpenQuoteForm,
  quoteFormOpen,
  totalAmount,
  totalSavings,
}: {
  currencySymbol: string;
  onOpenQuoteForm: () => void;
  quoteFormOpen: boolean;
  totalAmount: number;
  totalSavings: number;
}) {
  return (
    <div className="cart-footer">
      <div className="summary-row is-total">
        <span>Total estimado</span>
        <strong>{formatCurrency(totalAmount, currencySymbol)}</strong>
      </div>
      {totalSavings > 0 ? (
        <div className="summary-row is-savings">
          <span>Ahorro por mayorista</span>
          <strong>{formatCurrency(totalSavings, currencySymbol)}</strong>
        </div>
      ) : null}

      {!quoteFormOpen ? (
        <div className="cart-footer-actions">
          <button
            className="button button-primary cart-quote-open"
            onClick={onOpenQuoteForm}
            type="button"
          >
            <ReceiptText size={18} />
            Generar cotización
          </button>
        </div>
      ) : null}
    </div>
  );
}

function QuoteForm({
  draft,
  hasAccountDefaults,
  isReady,
  onChange,
  onClose,
  onReset,
  onSubmit,
  quoteMessage,
  quoteMessageTone,
  quoteStatusSteps,
  quoteState,
  quoteWhatsappHref,
}: {
  draft: QuoteDraft;
  hasAccountDefaults: boolean;
  isReady: boolean;
  onChange: (field: keyof QuoteDraft, value: string) => void;
  onClose: () => void;
  onReset: () => void;
  onSubmit: () => void;
  quoteMessage: string;
  quoteMessageTone: "success" | "error" | "neutral";
  quoteStatusSteps: QuoteStatusStep[];
  quoteState: "idle" | "loading" | "success" | "error";
  quoteWhatsappHref: string | null;
}) {
  return (
    <section className="cart-quote-form">
      <div className="cart-quote-head">
        <span aria-hidden="true" className="cart-quote-head-spacer" />
        <h3>Datos para cotización</h3>
        <button className="icon-button icon-button-close" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>

      {quoteState === "success" ? (
        <div className="cart-quote-success" role="status" aria-live="polite">
          <div className="cart-quote-success-copy">
            <BadgeCheck size={18} />
            <div>
              <strong>Cotización generada con éxito</strong>
              <span>{quoteMessage || "Te contactaremos vía WhatsApp."}</span>
            </div>
          </div>
          {quoteWhatsappHref ? (
            <a className="button cart-quote-whatsapp" href={quoteWhatsappHref} rel="noreferrer" target="_blank">
              <span className="cart-quote-whatsapp-icon">
                <WhatsAppIcon />
              </span>
              Contactar asesor por WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}

      {hasAccountDefaults ? (
        <div className="cart-quote-account-note">
          <div className="cart-quote-account-note-copy">
            <UserRoundCheck size={16} />
            <span>Usando datos precargados del comprador registrado.</span>
          </div>
          <button className="button button-ghost" onClick={onReset} type="button">
            <RefreshCcw size={15} />
            Restaurar mis datos
          </button>
        </div>
      ) : null}

      <div className="cart-quote-grid">
        <label className="field-stack">
          <span>Nombre o razón social</span>
          <input
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="Ej. Comercial Pérez SAC"
            type="text"
            value={draft.name}
          />
        </label>
        <label className="field-stack">
          <span>Teléfono / WhatsApp</span>
          <input
            onChange={(event) => onChange("phone", event.target.value)}
            placeholder="Ej. 987654321"
            type="tel"
            value={draft.phone}
          />
        </label>
        <label className="field-stack">
          <span>Tipo de documento</span>
          <select onChange={(event) => onChange("documentType", event.target.value)} value={draft.documentType}>
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value || "none"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-stack">
          <span>Número de documento</span>
          <input
            onChange={(event) => onChange("documentNumber", event.target.value)}
            placeholder="DNI o RUC"
            type="text"
            value={draft.documentNumber}
          />
        </label>
        <label className="field-stack cart-quote-grid-full">
          <span>Observaciones</span>
          <textarea
            onChange={(event) => onChange("note", event.target.value)}
            placeholder="Notas comerciales, entrega o confirmación"
            rows={3}
            value={draft.note}
          />
        </label>
      </div>

      <div className="cart-quote-actions">
        <button
          className={`button cart-quote-submit ${isReady ? "is-ready button-primary" : "button-ghost"}`}
          disabled={!isReady || quoteState === "loading"}
          onClick={onSubmit}
          type="button"
        >
          {quoteState === "loading" ? "Registrando..." : "Solicitar cotización"}
        </button>

      </div>

      {quoteState !== "success" && quoteMessage ? (
        <p className={quoteMessageTone === "error" ? "error-text" : quoteMessageTone === "success" ? "success-text" : "muted"}>
          {quoteMessage}
        </p>
      ) : null}

      {quoteState !== "success" && quoteStatusSteps.length ? (
        <div className="cart-quote-status">
          {quoteStatusSteps.map((step, index) => (
            <p
              className={`cart-quote-status-item is-${step.status}`}
              key={`${step.status}-${index}-${step.text}`}
            >
              <span>{step.status === "success" ? "OK" : step.status === "warning" ? "AV" : "ER"}</span>
              {step.text}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EmptyCartState() {
  return (
    <div className="cart-empty">
      <ShoppingCart size={22} />
      <p>Agrega productos y arma el pedido sin salir del catálogo.</p>
    </div>
  );
}

export function CartDrawer({
  settings,
  initialOpen = false,
  quoteDefaults = null,
}: CartDrawerProps) {
  const { items, hydrated, setQuantity, removeItem, clear } = useCartStore();
  const [open, setOpen] = useState(initialOpen);
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [quoteMessageTone, setQuoteMessageTone] = useState<"success" | "error" | "neutral">("neutral");
  const [quoteStatusSteps, setQuoteStatusSteps] = useState<QuoteStatusStep[]>([]);
  const [quoteWhatsappHref, setQuoteWhatsappHref] = useState<string | null>(null);
  const quoteSubmitPendingRef = useRef(false);
  const hasAccountDefaults = Boolean(quoteDefaults?.name?.trim() || quoteDefaults?.phone?.trim());
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft>(() => buildInitialQuoteDraft(settings, quoteDefaults));

  useEffect(() => {
    rehydrateCartStore();
  }, []);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(STORE_CART_OPEN_EVENT, handleOpen);

    return () => {
      window.removeEventListener(STORE_CART_OPEN_EVENT, handleOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const scrollY = window.scrollY;
    const { style: bodyStyle } = document.body;
    const { style: htmlStyle } = document.documentElement;
    const previousBody = {
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      right: bodyStyle.right,
      width: bodyStyle.width,
    };
    const previousHtmlOverflow = htmlStyle.overflow;

    htmlStyle.overflow = "hidden";
    bodyStyle.overflow = "hidden";
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";

    return () => {
      htmlStyle.overflow = previousHtmlOverflow;
      bodyStyle.overflow = previousBody.overflow;
      bodyStyle.position = previousBody.position;
      bodyStyle.top = previousBody.top;
      bodyStyle.left = previousBody.left;
      bodyStyle.right = previousBody.right;
      bodyStyle.width = previousBody.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const visibleItems = hydrated ? items : [];
  const orderLines: CartLine[] = visibleItems.map((item) => ({
    item,
    pricing: getLinePricing(item, item.quantity),
  }));
  const totalAmount = orderLines.reduce((sum, line) => sum + line.pricing.total, 0);
  const totalSavings = orderLines.reduce((sum, line) => sum + line.pricing.savings, 0);

  const isQuoteReady =
    quoteDraft.name.trim().length >= 3 &&
    quoteDraft.phone.trim().length >= 6;

  const updateQuoteDraft = (field: keyof QuoteDraft, value: string) => {
    setQuoteDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetQuoteDraft = () => {
    setQuoteDraft(buildInitialQuoteDraft(settings, quoteDefaults));
  };

  const openQuoteForm = () => {
    setQuoteFormOpen(true);
  };

  const submitQuoteToErp = async () => {
    if (!orderLines.length || !isQuoteReady || quoteState === "loading" || quoteSubmitPendingRef.current) {
      return;
    }

    quoteSubmitPendingRef.current = true;
    setQuoteState("loading");
    setQuoteMessage("");
    setQuoteMessageTone("neutral");
    setQuoteStatusSteps([]);
    setQuoteWhatsappHref(null);

    try {
      const response = await fetch("/api/erp-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            documentNumber: quoteDraft.documentNumber,
            documentType: quoteDraft.documentType,
            name: quoteDraft.name,
            phone: quoteDraft.phone,
          },
          items: orderLines.map(({ item }) => ({
            code: item.code,
            quantity: item.quantity,
          })),
          note: quoteDraft.note,
        }),
      });
      const responseText = await response.text();
      let payload: {
        message?: string;
        quoteNumber?: string | null;
        statusSteps?: QuoteStatusStep[];
        whatsappHref?: string | null;
      } = {};

      if (responseText.trim()) {
        try {
          payload = JSON.parse(responseText) as typeof payload;
        } catch {
          throw new Error(
            `El servidor respondió ${response.status} con un formato inválido para la cotización.`,
          );
        }
      }

      if (!response.ok) {
        throw new Error(payload.message ?? "No se pudo registrar la cotización.");
      }

      setQuoteState("success");
      setQuoteMessage(payload.message ?? "Cotización enviada correctamente.");
      setQuoteMessageTone("success");
      setQuoteStatusSteps(payload.statusSteps ?? []);
      setQuoteWhatsappHref(payload.whatsappHref ?? null);
      setQuoteFormOpen(true);
    } catch (error) {
      setQuoteState("error");
      setQuoteMessage(
        error instanceof Error ? error.message : "No se pudo enviar la cotización.",
      );
      setQuoteMessageTone("error");
      setQuoteStatusSteps([
        {
          status: "error",
          text: error instanceof Error ? error.message : "No se pudo enviar la cotización.",
        },
      ]);
    } finally {
      quoteSubmitPendingRef.current = false;
    }
  };

  if (!open && !orderLines.length) {
    return null;
  }

  return (
    <aside className={`cart-drawer ${open ? "is-open" : ""}`}>
      <CartHeader
        hasItems={orderLines.length > 0}
        onClose={() => setOpen(false)}
        onClear={clear}
      />

      <div className="cart-drawer-body">
        {orderLines.length ? (
          <>
            <CartList
              currencySymbol={settings.currencySymbol}
              onRemove={removeItem}
              onSetQuantity={setQuantity}
              orderLines={orderLines}
            />

            <CartFooter
              currencySymbol={settings.currencySymbol}
              onOpenQuoteForm={openQuoteForm}
              quoteFormOpen={quoteFormOpen}
              totalAmount={totalAmount}
              totalSavings={totalSavings}
            />
          </>
        ) : (
          <EmptyCartState />
        )}
      </div>

      {quoteFormOpen ? (
        <div
          className="cart-quote-overlay"
          onClick={() => setQuoteFormOpen(false)}
          role="presentation"
        >
          <div
            aria-modal="true"
            className="cart-quote-overlay-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <QuoteForm
              draft={quoteDraft}
              hasAccountDefaults={hasAccountDefaults}
              isReady={isQuoteReady}
              onChange={updateQuoteDraft}
              onClose={() => setQuoteFormOpen(false)}
              onReset={resetQuoteDraft}
              onSubmit={submitQuoteToErp}
              quoteMessage={quoteMessage}
              quoteMessageTone={quoteMessageTone}
              quoteState={quoteState}
              quoteStatusSteps={quoteStatusSteps}
              quoteWhatsappHref={quoteWhatsappHref}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
