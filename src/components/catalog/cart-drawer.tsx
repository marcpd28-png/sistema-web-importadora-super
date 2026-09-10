"use client";

import { useEffect, useRef, useState } from "react";
import { OrderReceipt, type ReceiptData } from "@/components/catalog/order-receipt";
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
  CreditCard,
} from "lucide-react";
import { CulqiCheckout } from "@/components/catalog/culqi-checkout";
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

type DeliveryType = "DELIVERY" | "PICKUP" | "PROVINCE";

type QuoteDraft = {
  name: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  note: string;
  deliveryType: DeliveryType;
  address: string;
  district: string;
};

type QuoteStatusStep = {
  status: "success" | "warning" | "error";
  text: string;
};

type QuoteState = "idle" | "loading" | "success" | "error";

type CartLine = {
  item: ReturnType<typeof useCartStore.getState>["items"][number];
  pricing: ReturnType<typeof getLinePricing>;
};

function EmptyCartState() {
  return (
    <div className="cart-empty-state">
      <ShoppingCart size={28} />
      <p>Tu carrito está vacío.</p>
    </div>
  );
}

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
    address: "",
    deliveryType: "DELIVERY",
    district: "",
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
  appliedPromo,
  promoCodeInput,
  setPromoCodeInput,
  setAppliedPromo,
  handleVerifyPromo,
  isVerifyingPromo,
  promoError,
  finalTotalAmount
}: {
  currencySymbol: string;
  onOpenQuoteForm: () => void;
  quoteFormOpen: boolean;
  totalAmount: number;
  totalSavings: number;
  appliedPromo?: any;
  promoCodeInput?: string;
  setPromoCodeInput?: any;
  setAppliedPromo?: any;
  handleVerifyPromo?: any;
  isVerifyingPromo?: boolean;
  promoError?: string;
  finalTotalAmount?: number;
}) {
  return (
    <div className="cart-footer">
      {!quoteFormOpen && (
        <div style={{ marginBottom: "16px", padding: "12px", background: "#f9fafb", borderRadius: "8px", border: "1px dashed #d1d5db" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: "#374151" }}>¿Tienes un código de promotor?</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input 
              type="text" 
              value={promoCodeInput || ''}
              onChange={(e) => setPromoCodeInput?.(e.target.value)}
              placeholder="Ingresa tu código" 
              style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", textTransform: "uppercase" }}
              disabled={!!appliedPromo}
            />
            {!appliedPromo ? (
              <button 
                onClick={handleVerifyPromo} 
                disabled={isVerifyingPromo || !promoCodeInput}
                style={{ padding: "8px 16px", background: "#111827", color: "#fff", borderRadius: "6px", fontWeight: 500, fontSize: "14px", opacity: (!promoCodeInput || isVerifyingPromo) ? 0.5 : 1 }}
              >
                {isVerifyingPromo ? "..." : "Aplicar"}
              </button>
            ) : (
              <button 
                onClick={() => { setPromoCodeInput?.(""); setAppliedPromo?.(null); }} 
                style={{ padding: "8px 16px", background: "#fee2e2", color: "#b91c1c", borderRadius: "6px", fontWeight: 500, fontSize: "14px" }}
              >
                Quitar
              </button>
            )}
          </div>
          {promoError && <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px" }}>{promoError}</p>}
          {appliedPromo && <p style={{ color: "#10b981", fontSize: "12px", marginTop: "8px" }}>¡Cupón aplicado! Ahorraste - S/ {appliedPromo.discountAmount}</p>}
        </div>
      )}

      <div className="summary-row is-total">
        <span>Subtotal</span>
        <strong>S/ {totalAmount.toFixed(2)}</strong>
      </div>
      {appliedPromo && (
        <div className="summary-row is-savings" style={{ color: "#10b981" }}>
          <span>Descuento Promotor</span>
          <strong>- S/ {appliedPromo.discountAmount.toFixed(2)}</strong>
        </div>
      )}
      {appliedPromo && (
        <div className="summary-row is-total" style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e5e7eb", fontSize: "18px" }}>
          <span>Total a Pagar</span>
          <strong>S/ {finalTotalAmount?.toFixed(2) || totalAmount.toFixed(2)}</strong>
        </div>
      )}
      {totalSavings > 0 ? (
        <div className="summary-row is-savings">
          <span>Ahorro por mayorista</span>
          <strong>S/ {totalSavings.toFixed(2)}</strong>
        </div>
      ) : null}

      {!quoteFormOpen ? (
        <div className="cart-footer-actions" style={{ display: "flex", gap: "8px", flexDirection: "column", marginTop: "12px" }}>
          <button
            className="button button-primary cart-quote-open"
            onClick={onOpenQuoteForm}
            type="button"
          >
            <ReceiptText size={18} />
            Completar pedido
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
  onSubmitQuote,
  onOpenPayment,
  onManualPayment,
  quoteMessage,
  quoteState,
  quoteStatusSteps,
  quoteWhatsappHref,
  receiptData,
}: {
  draft: QuoteDraft;
  hasAccountDefaults: boolean;
  isReady: boolean;
  onChange: (fields: Partial<QuoteDraft>) => void;
  onClose: () => void;
  onSubmitQuote: () => void;
  onOpenPayment: () => void;
  onManualPayment: (method: "INTERBANK" | "YAPE" | "PLIN") => void;
  quoteMessage: string | null;
  quoteState: QuoteState;
  quoteStatusSteps: QuoteStatusStep[];
  quoteWhatsappHref: string | null;
  receiptData: ReceiptData | null;
}) {
  const [paymentStep, setPaymentStep] = useState<"form" | "select_method" | "manual_interbank" | "manual_plin">("form");

  if (paymentStep === "select_method") {
    return (
      <section className="cart-quote-form checkout-payment-step">
        <div className="cart-quote-head">
          <div>
            <span className="checkout-step-kicker">Paso 2 de 2</span>
            <h3>Elige cómo pagar</h3>
            <p className="checkout-step-copy">Selecciona una opción para terminar tu pedido.</p>
          </div>
          <button className="icon-button icon-button-close" onClick={() => setPaymentStep("form")} type="button">
            <X size={16} />
          </button>
        </div>
        
        <button className="checkout-payment-option is-primary" onClick={onOpenPayment} type="button">
          <CreditCard size={24} />
          <div className="checkout-option-copy">
            <strong style={{ display: "block" }}>Tarjeta o Yape (Culqi)</strong>
            <span style={{ fontSize: "12px", opacity: 0.8 }}>Pago automático y seguro con cualquier tarjeta</span>
          </div>
        </button>

        <button className="checkout-payment-option" onClick={() => setPaymentStep("manual_interbank")} type="button">
          <BadgeCheck size={24} />
          <div className="checkout-option-copy">
            <strong style={{ display: "block" }}>Transferencia Interbank</strong>
            <span style={{ fontSize: "12px", opacity: 0.8 }}>Transfiere directamente a nuestra cuenta bancaria</span>
          </div>
        </button>

        <button className="checkout-payment-option" onClick={() => setPaymentStep("manual_plin")} type="button">
          <BadgeCheck size={24} />
          <div className="checkout-option-copy">
            <strong style={{ display: "block" }}>Plin</strong>
            <span style={{ fontSize: "12px", opacity: 0.8 }}>Pago rápido escaneando nuestro QR de Plin</span>
          </div>
        </button>
      </section>
    );
  }

  if (paymentStep === "manual_interbank" || paymentStep === "manual_plin") {
    const isInterbank = paymentStep === "manual_interbank";
    const method = isInterbank ? "INTERBANK" : "PLIN";

    return (
      <section className="cart-quote-form checkout-payment-step checkout-manual-payment">
        <div className="cart-quote-head">
          <button className="icon-button" onClick={onSubmitQuote} type="button" style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: "6px", color: "#6b7280" }}>
            ← Volver
          </button>
        </div>

        <h3 className="checkout-payment-title">
          {isInterbank ? "🏦 Transferencia Interbank" : "📱 Pago con Plin"}
        </h3>

        {/* Account / QR Info */}
        <div className="checkout-payment-info">
          {isInterbank ? (
            <>
              <p style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase" }}>Cuenta Corriente Soles</p>
              <p style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "2px", color: "#15803d", margin: "0 0 6px" }}>200-3004005006</p>
              <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 2px" }}>CCI: 003-200-000000000000-00</p>
              <p style={{ fontSize: "12px", color: "#6b7280" }}>Titular: <strong>Importaciones Super S.A.C.</strong></p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase" }}>Escanea el QR desde tu app bancaria</p>
              <div style={{ width: "160px", height: "160px", margin: "0 auto 10px", backgroundColor: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", border: "2px dashed #9ca3af" }}>
                <span style={{ fontSize: "11px", color: "#9ca3af" }}>QR Plin aquí</span>
              </div>
              <p style={{ fontSize: "13px", color: "#15803d", fontWeight: 700 }}>955 252 609</p>
              <p style={{ fontSize: "12px", color: "#6b7280" }}>Importaciones Super</p>
            </>
          )}
        </div>

        {/* Step instruction */}
        <div className="checkout-payment-instructions">
          <strong>Pasos:</strong>
          <ol style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
            <li>Realiza la transferencia o Plin por <strong>S/ {/* total shown dynamically in quoteMessage */}el monto de tu pedido</strong>.</li>
            <li>Haz clic en el botón de abajo para registrar tu pedido.</li>
            <li>Envíanos la captura del voucher por WhatsApp para confirmar.</li>
          </ol>
        </div>

        {quoteState === "error" && (
          <div style={{ padding: "10px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>
            {quoteMessage}
          </div>
        )}

        <button
          className="button button-primary"
          onClick={() => onManualPayment(method)}
          disabled={quoteState === "loading" || !isReady}
          style={{ marginTop: "4px", padding: "14px", fontSize: "15px", justifyContent: "center" }}
        >
          {quoteState === "loading" ? "Registrando pedido..." : `✓ Registrar pedido vía ${isInterbank ? "Interbank" : "Plin"}`}
        </button>
        {!isReady && (
          <p style={{ textAlign: "center", fontSize: "12px", color: "#9ca3af" }}>
            Completa tu nombre y teléfono en el formulario para continuar.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="cart-quote-form">
      <div className="cart-quote-head">
        <div>
          <span className="checkout-step-kicker">Paso 1 de 2</span>
          <h3>Datos de envío y contacto</h3>
          <p className="checkout-step-copy">Completa tus datos y dinos cómo quieres recibir tu pedido.</p>
        </div>
        <button className="icon-button icon-button-close" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>

      {quoteState === "success" ? (
        <div className="cart-quote-success" role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" }}>
          {/* Success header */}
          <div style={{ backgroundColor: "#f0fdf4", border: "2px solid #86efac", padding: "16px", borderRadius: "12px", textAlign: "center" }}>
            <div style={{ width: "48px", height: "48px", backgroundColor: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
              <BadgeCheck size={28} color="#fff" />
            </div>
            <strong style={{ fontSize: "17px", color: "#166534", display: "block", marginBottom: "6px" }}>¡Pedido registrado exitosamente! ✅</strong>
            <span style={{ fontSize: "13px", color: "#15803d", lineHeight: "1.5", display: "block" }}>
              Envíanos la foto de tu voucher de pago por WhatsApp para confirmar y despachar tu pedido.
            </span>
          </div>

          {/* Receipt */}
          {receiptData && <OrderReceipt data={receiptData} />}


          {quoteWhatsappHref ? (
            <a className="button cart-quote-whatsapp" href={quoteWhatsappHref} rel="noreferrer" target="_blank" style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "16px", backgroundColor: "#25D366", color: "#fff", border: "none", boxShadow: "0 4px 14px rgba(37, 211, 102, 0.4)" }}>
              <span className="cart-quote-whatsapp-icon" style={{ display: 'inline-flex', marginRight: '8px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </span>
              Confirmar mi pedido por WhatsApp
            </a>
          ) : (
            <a className="button cart-quote-whatsapp" href="https://wa.me/51955252609?text=Hola,%20acabo%20de%20realizar%20un%20pedido%20en%20la%20tienda%20y%20quiero%20confirmar%20mi%20pago." rel="noreferrer" target="_blank" style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "16px", backgroundColor: "#25D366", color: "#fff", border: "none", boxShadow: "0 4px 14px rgba(37, 211, 102, 0.4)" }}>
              <span className="cart-quote-whatsapp-icon" style={{ display: 'inline-flex', marginRight: '8px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </span>
              Confirmar mi pedido por WhatsApp
            </a>
          )}
        </div>
      ) : null}

      <div className="cart-quote-fields checkout-form-content">
        <div className="checkout-section-heading">
          <span className="checkout-section-number">01</span>
          <div>
            <strong>¿A quién entregamos?</strong>
            <span>Usaremos estos datos para confirmar tu pedido.</span>
          </div>
        </div>
        <div className="checkout-contact-grid">
        <label className="checkout-field">
          <span>Nombres y apellidos completos</span>
          <input
            defaultValue={draft.name || ""}
            disabled={quoteState === "loading" || quoteState === "success"}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Escribe tu nombre"
            type="text"
          />
        </label>
        <label className="checkout-field">
          <span>Número de celular</span>
          <input
            defaultValue={draft.phone || ""}
            disabled={quoteState === "loading" || quoteState === "success"}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="987 654 321"
            type="tel"
          />
        </label>
        </div>

        {/* ── Delivery Type Selector ── */}
        <div className="checkout-delivery-section">
          <div className="checkout-section-heading">
            <span className="checkout-section-number">02</span>
            <div>
              <strong>¿Cómo recibirás tu pedido?</strong>
              <span>Elige una modalidad para mostrarte los datos necesarios.</span>
            </div>
          </div>
          <div className="checkout-delivery-options">
            {(["DELIVERY", "PICKUP", "PROVINCE"] as DeliveryType[]).map((type) => {
              const labels: Record<DeliveryType, { icon: string; title: string; subtitle: string }> = {
                DELIVERY: { icon: "🛵", title: "Delivery Lima", subtitle: "Envío a domicilio en Lima" },
                PICKUP:   { icon: "🏪", title: "Recojo en Tienda", subtitle: "Retira en nuestro local" },
                PROVINCE: { icon: "📦", title: "Envío Provincia", subtitle: "Via courier a tu ciudad" },
              };
              const l = labels[type];
              const selected = draft.deliveryType === type;
              return (
                <button
                  aria-pressed={selected}
                  className={`checkout-delivery-option ${selected ? "is-selected" : ""}`}
                  key={type}
                  type="button"
                  disabled={quoteState === "loading" || quoteState === "success"}
                  onClick={() => onChange({ deliveryType: type })}
                >
                  <span className="checkout-delivery-icon">{l.icon}</span>
                  <span className="checkout-delivery-title">{l.title}</span>
                  <span className="checkout-delivery-subtitle">{l.subtitle}</span>
                  <span className="checkout-selection-mark">{selected ? "Elegido" : "Seleccionar"}</span>
                </button>
              );
            })}
          </div>

          {/* Address field — show for DELIVERY and PROVINCE */}
          {(draft.deliveryType === "DELIVERY" || draft.deliveryType === "PROVINCE") && (
            <div className="checkout-delivery-fields">
              <label className="checkout-field">
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>
                  {draft.deliveryType === "PROVINCE" ? "Ciudad / Provincia de destino" : "Dirección de entrega"}
                </span>
                <input
                  type="text"
                  disabled={quoteState === "loading" || quoteState === "success"}
                  value={draft.address}
                  onChange={(e) => onChange({ address: e.target.value })}
                  placeholder={draft.deliveryType === "PROVINCE" ? "Ej: Arequipa, Trujillo, Cusco..." : "Ej: Av. Los Álamos 123, San Borja"}
                />
              </label>
              {draft.deliveryType === "DELIVERY" && (
                <label className="checkout-field">
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>Distrito</span>
                  <input
                    type="text"
                    disabled={quoteState === "loading" || quoteState === "success"}
                    value={draft.district}
                    onChange={(e) => onChange({ district: e.target.value })}
                    placeholder="Ej: Miraflores, San Isidro, Los Olivos..."
                  />
                </label>
              )}
            </div>
          )}

          {draft.deliveryType === "PICKUP" && (
            <div className="checkout-pickup-note">
              📍 <strong>Dirección:</strong> Jr. Lampa 1234, Cercado de Lima — Lun–Sáb 9am–6pm
            </div>
          )}
        </div>

        <details className="cart-quote-details">
          <summary>
            Datos adicionales (RUC, DNI...)
            <Plus size={16} />
          </summary>
          <div className="cart-quote-details-content">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
              <label>
                <span>Documento</span>
                <select
                  defaultValue={draft.documentType || ""}
                  disabled={quoteState === "loading" || quoteState === "success"}
                  onChange={(event) => onChange({ documentType: event.target.value })}
                >
                  <option value="">(Ninguno)</option>
                  <option value="DNI">DNI</option>
                  <option value="RUC">RUC</option>
                  <option value="CE">C.E.</option>
                </select>
              </label>
              <label>
                <span>Número</span>
                <input
                  defaultValue={draft.documentNumber || ""}
                  disabled={quoteState === "loading" || quoteState === "success"}
                  onChange={(event) => onChange({ documentNumber: event.target.value })}
                  placeholder="Número de documento"
                  type="text"
                />
              </label>
            </div>
            <label>
              <span>Notas de envío / Referencia (Opcional)</span>
              <textarea
                defaultValue={draft.note || ""}
                disabled={quoteState === "loading" || quoteState === "success"}
                onChange={(event) => onChange({ note: event.target.value })}
                placeholder="Escribe aquí si tienes instrucciones especiales para tu envío..."
                rows={3}
              />
            </label>
          </div>
        </details>
      </div>

      <div className="cart-quote-actions">
        {quoteState === "error" ? (
          <div className="cart-quote-error" role="alert">
            {quoteMessage || "Hubo un error al generar la cotización."}
          </div>
        ) : null}

        {quoteStatusSteps.length > 0 ? (
          <div className="cart-quote-steps">
            {quoteStatusSteps.map((step, idx) => (
              <div key={idx} className="cart-quote-step">
                <BadgeCheck size={14} />
                <span>{step.text}</span>
              </div>
            ))}
          </div>
        ) : null}

        {quoteState !== "success" ? (
          <button
            className={`button cart-quote-submit ${isReady ? "is-ready button-primary" : "button-ghost"}`}
            disabled={!isReady || quoteState === "loading"}
            onClick={onSubmitQuote}
            type="button"
          >
            {quoteState === "loading" ? "Procesando..." : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg> Enviar Pedido por WhatsApp
              </>
            )}
          </button>
        ) : null}
      </div>
    </section>
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
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [culqiOpen, setCulqiOpen] = useState(false);
  const quoteSubmitPendingRef = useRef(false);
  const hasAccountDefaults = Boolean(quoteDefaults?.name?.trim() || quoteDefaults?.phone?.trim());
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft>(() => buildInitialQuoteDraft(settings, quoteDefaults));

  // Promociones
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<any>(null);
  const [promoError, setPromoError] = useState("");
  const [isVerifyingPromo, setIsVerifyingPromo] = useState(false);

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

  const handleVerifyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setIsVerifyingPromo(true);
    setPromoError("");
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCodeInput, cartTotal: totalAmount }),
      });
      const data = await res.json();
      if (data.success) {
        setAppliedPromo(data);
      } else {
        setPromoError(data.message);
        setAppliedPromo(null);
      }
    } catch (error) {
      setPromoError("Error al verificar código");
    } finally {
      setIsVerifyingPromo(false);
    }
  };
  
  const finalTotalAmount = totalAmount - (appliedPromo?.discountAmount || 0);
  const totalSavings = orderLines.reduce((sum, line) => sum + line.pricing.savings, 0);

  const isQuoteReady =
    quoteDraft.name.trim().length >= 3 &&
    quoteDraft.phone.trim().length >= 6 &&
    (quoteDraft.deliveryType === "PICKUP" ||
      (quoteDraft.address.trim().length >= 5 &&
        (quoteDraft.deliveryType === "PROVINCE" || quoteDraft.district.trim().length >= 3)));

  const updateQuoteDraft = (fields: Partial<QuoteDraft>) => {
    setQuoteDraft((current) => ({
      ...current,
      ...fields,
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
          deliveryType: quoteDraft.deliveryType,
          address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(", ") || undefined,
          promoCodeId: appliedPromo?.promoCodeId,
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

  const handleCulqiToken = async (token: string) => {
    setQuoteState("loading");
    setQuoteMessage("Procesando pago...");
    setQuoteMessageTone("neutral");
    
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          customer: {
            documentNumber: quoteDraft.documentNumber,
            documentType: quoteDraft.documentType,
            name: quoteDraft.name,
            phone: quoteDraft.phone,
          },
          items: orderLines.map(({ item }) => ({
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
          amount: Math.round(finalTotalAmount * 100),
          promoCode: appliedPromo?.code || undefined,
          deliveryType: quoteDraft.deliveryType,
          address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(", ") || undefined,
          currency: "PEN",
        }),
      });
      
      const payload = await response.json();
      
      if (!response.ok) {
        throw new Error(payload.message || "Error al procesar el pago");
      }
      
      setQuoteState("success");
      setQuoteMessage("Pago exitoso. Tu pedido ha sido registrado.");
      setQuoteMessageTone("success");
      clear();
    } catch (error) {
      setQuoteState("error");
      setQuoteMessage(error instanceof Error ? error.message : "Error procesando el pago");
      setQuoteMessageTone("error");
    }
  };

  const handleManualPayment = async (method: "INTERBANK" | "YAPE" | "PLIN") => {
    setQuoteState("loading");
    setQuoteMessage("Registrando pedido...");
    setQuoteMessageTone("neutral");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: method,
          customer: {
            name: quoteDraft.name,
            phone: quoteDraft.phone,
            documentType: quoteDraft.documentType || undefined,
            documentNumber: quoteDraft.documentNumber || undefined,
          },
          items: orderLines.map(({ item }) => ({
            productId: item.id,
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
          promoCode: appliedPromo?.code || undefined,
          deliveryType: quoteDraft.deliveryType,
          address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(', ') || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Error registrando el pedido");
      setQuoteState("success");
      setQuoteMessage(payload.message || "¡Pedido registrado! Envíanos tu comprobante por WhatsApp.");
      setQuoteMessageTone("success");
      if (payload.whatsappLink) setQuoteWhatsappHref(payload.whatsappLink);
    } catch (error) {
      setQuoteState("error");
      setQuoteMessage(error instanceof Error ? error.message : "Error registrando el pedido");
      setQuoteMessageTone("error");
    }
  };

  const handleCulqiError = (error: string) => {
    setQuoteState("error");
    setQuoteMessage(error);
    setQuoteMessageTone("error");
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
              appliedPromo={appliedPromo}
              promoCodeInput={promoCodeInput}
              setPromoCodeInput={setPromoCodeInput}
              setAppliedPromo={setAppliedPromo}
              handleVerifyPromo={handleVerifyPromo}
              isVerifyingPromo={isVerifyingPromo}
              promoError={promoError}
              finalTotalAmount={finalTotalAmount}
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
              onSubmitQuote={submitQuoteToErp}
              onOpenPayment={() => setCulqiOpen(true)}
              onManualPayment={handleManualPayment}
              quoteMessage={quoteMessage}
              quoteState={quoteState}
              quoteStatusSteps={quoteStatusSteps}
              quoteWhatsappHref={quoteWhatsappHref}
              receiptData={receiptData}
            />
            <CulqiCheckout
              publicKey="pk_test_a0437cd3339ed240"
              amount={Math.round(finalTotalAmount * 100)}
              currency="PEN"
              title={settings.businessName}
              isOpen={culqiOpen}
              onClose={() => setCulqiOpen(false)}
              onToken={handleCulqiToken}
              onError={handleCulqiError}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
