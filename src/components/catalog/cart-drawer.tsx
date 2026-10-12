"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BadgeCheck,
  Minus,
  Plus,
  ReceiptText,
  ShoppingCart,
  Trash2,
  X,
  CreditCard,
  MessageCircle,
} from "lucide-react";
import { CulqiCheckout } from "@/components/catalog/culqi-checkout";
import { STORE_CART_OPEN_EVENT } from "@/components/catalog/cart-events";
import { rehydrateCartStore } from "@/components/catalog/cart-store";
import { trackStoreEvent } from "@/lib/store-analytics-client";
import { trackBeginCheckout } from "@/lib/analytics";
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
        <button aria-label="Cerrar carrito" className="icon-button icon-button-close" onClick={onClose} type="button">
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
                <button aria-label={`Quitar ${item.name} del carrito`} className="icon-button" onClick={() => onRemove(item.key)} type="button">
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
            <button aria-label={`Disminuir cantidad de ${item.name}`} onClick={() => onSetQuantity(item.key, item.quantity - 1)} type="button">
              <Minus size={16} />
            </button>
            <span>{item.quantity}</span>
            <button aria-label={`Aumentar cantidad de ${item.name}`} onClick={() => onSetQuantity(item.key, item.quantity + 1)} type="button">
              <Plus size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CartFooter({
  onOpenQuoteForm,
  quoteFormOpen,
  totalAmount,
  totalSavings,
}: {
  onOpenQuoteForm: () => void;
  quoteFormOpen: boolean;
  totalAmount: number;
  totalSavings: number;
}) {
  return (
    <div className="cart-footer">
      <div className="summary-row is-total">
        <span>Subtotal</span>
        <strong>S/ {totalAmount.toFixed(2)}</strong>
      </div>
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
  isReady,
  onChange,
  onClose,
  onSubmitQuote,
  onOpenPayment,
  onManualPayment,
  quoteMessage,
  quoteState,
  quoteStatusSteps,
  quoteMessengerHref,
}: {
  draft: QuoteDraft;
  isReady: boolean;
  onChange: (fields: Partial<QuoteDraft>) => void;
  onClose: () => void;
  onSubmitQuote: () => void;
  onOpenPayment: () => void;
  onManualPayment: (method: "INTERBANK" | "YAPE" | "PLIN") => void;
  quoteMessage: string | null;
  quoteState: QuoteState;
  quoteStatusSteps: QuoteStatusStep[];
  quoteMessengerHref: string | null;
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
          <button aria-label="Volver a los datos de envío" className="icon-button icon-button-close" onClick={() => setPaymentStep("form")} type="button">
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
            <li>Envía el comprobante a nuestro asesor por Messenger para confirmar.</li>
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
        <button aria-label="Cerrar formulario de envío" className="icon-button icon-button-close" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>

      {quoteState === "success" ? (
        <div className="cart-quote-success" role="status" aria-live="polite" style={{ backgroundColor: "#fffbeb", border: "2px solid #fbbf24", padding: "20px", borderRadius: "12px", textAlign: "center" }}>
          <div className="cart-quote-success-copy" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ width: "48px", height: "48px", backgroundColor: "#fbbf24", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BadgeCheck size={28} color="#fff" />
            </div>
            <div>
              <strong style={{ fontSize: "18px", color: "#92400e", display: "block", marginBottom: "8px" }}>¡Pedido registrado! 🛑</strong>
              <span style={{ fontSize: "14px", color: "#b45309", lineHeight: "1.5", display: "block" }}>
                Abre Messenger para que un asesor atienda tu pedido. Envía allí tu comprobante o el número de cotización para confirmar el pago.
              </span>
            </div>
          </div>
          <a className="button cart-quote-messenger" href={quoteMessengerHref ?? "https://m.me/importacionessuperoficial"} rel="noreferrer" target="_blank" style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "16px", backgroundColor: "#0084ff", color: "#fff", border: "none", boxShadow: "0 4px 14px rgba(0, 132, 255, 0.35)" }}>
            <MessageCircle aria-hidden="true" size={24} />
            Enviar pedido por Messenger
          </a>
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
              autoComplete="name"
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
              autoComplete="tel"
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
                  autoComplete="street-address"
                  disabled={quoteState === "loading" || quoteState === "success"}
                  onChange={(e) => onChange({ address: e.target.value })}
                  placeholder={draft.deliveryType === "PROVINCE" ? "Ej: Arequipa, Trujillo, Cusco..." : "Ej: Av. Los Álamos 123, San Borja"}
                  type="text"
                  value={draft.address}
                />
              </label>
              {draft.deliveryType === "DELIVERY" && (
                <label className="checkout-field">
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" }}>Distrito</span>
                  <input
                    autoComplete="address-level2"
                    disabled={quoteState === "loading" || quoteState === "success"}
                    onChange={(e) => onChange({ district: e.target.value })}
                    placeholder="Ej: Miraflores, San Isidro, Los Olivos..."
                    type="text"
                    value={draft.district}
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
                  inputMode="numeric"
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
              <MessageCircle aria-hidden="true" size={18} /> Enviar pedido por Messenger
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
  const [, setQuoteMessageTone] = useState<"success" | "error" | "neutral">("neutral");
  const [quoteStatusSteps, setQuoteStatusSteps] = useState<QuoteStatusStep[]>([]);
  const [quoteMessengerHref, setQuoteMessengerHref] = useState<string | null>(null);
  const [culqiOpen, setCulqiOpen] = useState(false);
  const quoteSubmitPendingRef = useRef(false);
  const quoteRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);
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

  const openQuoteForm = () => {
    trackBeginCheckout(
      orderLines.map(({ item }) => ({
        item_id: item.code,
        item_name: item.name,
        price: Number(item.unitPrice),
        quantity: item.quantity,
      })),
      totalAmount,
    );
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
    setQuoteMessengerHref(null);

    try {
      const fingerprint = JSON.stringify({ draft: quoteDraft, items: orderLines.map(({ item }) => ({ code: item.code, quantity: item.quantity })) });
      if (quoteRequestRef.current?.fingerprint !== fingerprint) quoteRequestRef.current = { fingerprint, id: crypto.randomUUID() };
      const response = await fetch("/api/erp-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: quoteRequestRef.current.id,
          customer: {
            documentNumber: quoteDraft.documentNumber,
            documentType: quoteDraft.documentType,
            name: quoteDraft.name,
            phone: quoteDraft.phone,
            address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(", ") || undefined,
          },
          items: orderLines.map(({ item }) => ({
            code: item.code,
            quantity: item.quantity,
          })),
          note: quoteDraft.note,
          deliveryType: quoteDraft.deliveryType,
          address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(", ") || undefined,
        }),
      });
      const responseText = await response.text();
      let payload: {
        message?: string;
        quoteNumber?: string | null;
        localQuoteId?: string;
        statusSteps?: QuoteStatusStep[];
        messengerHref?: string | null;
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
      if (payload.localQuoteId) trackStoreEvent("quote_created", { quoteId: payload.localQuoteId });
      setQuoteMessage(payload.message ?? "Cotización enviada correctamente.");
      setQuoteMessageTone("success");
      setQuoteStatusSteps(payload.statusSteps ?? []);
      setQuoteMessengerHref(payload.messengerHref ?? null);
      setQuoteFormOpen(true);
    } catch (error) {
      setQuoteState("error");
      trackStoreEvent("checkout_error");
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
          amount: Math.round(totalAmount * 100),
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
          deliveryType: quoteDraft.deliveryType,
          address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(', ') || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Error registrando el pedido");
      setQuoteState("success");
      setQuoteMessage(payload.message || "¡Pedido registrado! Envíanos tu comprobante por Messenger.");
      setQuoteMessageTone("success");
      if (payload.messengerHref) setQuoteMessengerHref(payload.messengerHref);
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
              isReady={isQuoteReady}
              onChange={updateQuoteDraft}
              onClose={() => setQuoteFormOpen(false)}
              onSubmitQuote={submitQuoteToErp}
              onOpenPayment={() => setCulqiOpen(true)}
              onManualPayment={handleManualPayment}
              quoteMessage={quoteMessage}
              quoteState={quoteState}
              quoteStatusSteps={quoteStatusSteps}
              quoteMessengerHref={quoteMessengerHref}
            />
            <CulqiCheckout
              publicKey="pk_test_a0437cd3339ed240"
              amount={Math.round(totalAmount * 100)}
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
