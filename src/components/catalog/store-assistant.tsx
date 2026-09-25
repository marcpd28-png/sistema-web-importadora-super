"use client";
import { trackStoreEvent } from "@/lib/store-analytics-client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, MessageCircle, Minus, Plus, RotateCcw, Square, X } from "lucide-react";
import { isCartStoreHydrated, rehydrateCartStore, useCartStore } from "./cart-store";
import type { ShopAssistantProductCard, ShopAssistantReply } from "@/lib/shop-assistant-types";
import styles from "./store-assistant.module.css";

export type StoreAssistantPanelProps = {
  businessName: string; open: boolean; onClose: () => void;
  initialPrompt?: string | null; initialProductCode?: string | null; initialCategorySlug?: string | null;
  onInitialPromptHandled?: () => void;
};
type Message = ShopAssistantReply & { id: string; role: "user" | "assistant" };
const newId = () => crypto.randomUUID();
const safeHref = (href: string) => /^(https?:\/\/|\/(?!\/))/.test(href) ? href : null;

function MessageText({ text }: { text: string }) {
  return <p>{text.split(/(https?:\/\/[^\s<>]+)/g).map((part, i) => /^https?:\/\//.test(part)
    ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : part)}</p>;
}

function ProductActions({ product }: { product: ShopAssistantProductCard }) {
  const addItem = useCartStore(s => s.addItem);
  const inCart = useCartStore(s => s.items.find(item => item.key === `${product.id}:unit`)?.quantity || 0);
  const [added, setAdded] = useState(0);
  const [adding, setAdding] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState(product.recommendedQuantity || 1);
  const remaining = Math.max(0, product.stockUnits - inCart);
  const quantity = Math.max(1, Math.min(selectedQuantity, remaining));
  const busy = useRef(false);
  async function add() {
    if (busy.current || !remaining) return;
    busy.current = true;
    setAdding(true);
    try {
      if (!isCartStoreHydrated()) await rehydrateCartStore();
      const before = useCartStore.getState().items.find(item => item.key === `${product.id}:unit`)?.quantity || 0;
      const available = Math.max(0, product.stockUnits - before);
      if (!available) return;
      addItem({
        id: product.id, code: product.code, slug: product.slug, name: product.name, description: null,
        brand: product.brand, category: product.category, categoryId: null, imageUrl: product.imageUrl,
        sourceImageUrl: product.imageUrl, localImageUrl: product.imageUrl?.startsWith("/") ? product.imageUrl : null,
        media: [], primaryMedia: null, unitLabel: "unidad", unitPrice: product.unitPriceValue,
        wholesalePrice: product.wholesalePriceValue, wholesaleMinQty: product.wholesaleMinQty,
        boxPrice: null, unitsPerBox: product.unitsPerBox, stockUnits: product.stockUnits,
        isVisible: true, isFeatured: false, syncEnabled: true, lastSyncedAt: null,
        updatedAt: new Date().toISOString(), hasPhoto: Boolean(product.imageUrl), technicalSpecs: product.technicalSpecs || null,
      }, "unit", Math.min(quantity, available));
      const after = useCartStore.getState().items.find(item => item.key === `${product.id}:unit`)?.quantity || 0;
      if (after > before) trackStoreEvent("add_to_cart", { productCode: product.code });
      setAdded(Math.max(0, after - before));
    } finally { busy.current = false; setAdding(false); }
  }
  return <div className={styles.productActions}>
    <Link href={`/producto/${encodeURIComponent(product.slug)}`}>Ver {product.code}</Link>
    {product.stockUnits > 0 && <>
      <div className={styles.quantityControl} role="group" aria-label={`Cantidad de ${product.name}`}>
        <button type="button" aria-label={`Reducir cantidad de ${product.code}`} disabled={adding || !remaining || quantity <= 1} onClick={() => setSelectedQuantity(quantity - 1)}><Minus size={14} /></button>
        <input type="number" aria-label={`Cantidad de ${product.code}`} min={1} max={Math.max(1, remaining)} step={1} value={quantity} disabled={adding || !remaining}
          onChange={event => setSelectedQuantity(Math.max(1, Math.min(remaining, Math.floor(Number(event.target.value)) || 1)))} />
        <button type="button" aria-label={`Aumentar cantidad de ${product.code}`} disabled={adding || quantity >= remaining} onClick={() => setSelectedQuantity(quantity + 1)}><Plus size={14} /></button>
      </div>
      <button type="button" onClick={() => void add()} disabled={adding || !remaining}>
        <Plus size={13} />{!remaining ? "Stock completo en tu carrito" : `Agregar ${quantity} al carrito`}
      </button>
      <span className={styles.cartFeedback} role="status">{added > 0 && <><Check size={13} /> Agregaste {added}. </>}{inCart > 0 && `En tu carrito: ${inCart} unidades.`}</span>
    </>}
  </div>;
}

export function StoreAssistantPanel({ businessName, open, onClose, initialPrompt, initialProductCode, initialCategorySlug, onInitialPromptHandled }: StoreAssistantPanelProps) {
  const storageKey = `rocky-chat-v2:${businessName}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const active = useRef<AbortController | null>(null);
  const session = useRef("");
  const productCode = useRef<string | null>(null);
  const category = useRef<string | null>(null);
  const retryText = useRef("");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      session.current = newId();
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        if (saved && typeof saved.session === "string" && Array.isArray(saved.messages)) {
          session.current = saved.session;
          setMessages(saved.messages.filter((m: Message) => m && typeof m.text === "string" && ["user", "assistant"].includes(m.role)).slice(-20));
          productCode.current = typeof saved.productCode === "string" ? saved.productCode : null;
          category.current = typeof saved.category === "string" ? saved.category : null;
        }
      } catch { /* Chat remains usable without browser storage. */ }
      setReady(true);
    }, 0);
    return () => { window.clearTimeout(timer); active.current?.abort(); };
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ session: session.current, messages: messages.slice(-20), productCode: productCode.current, category: category.current })); } catch { /* Optional persistence. */ }
  }, [messages, ready, storageKey]);

  useEffect(() => {
    if (!open) return;
    trackStoreEvent("assistant_open");
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => input.current?.focus(), 80);
    return () => { clearTimeout(timer); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);

  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight; }, [messages, loading, error, open]);
  useEffect(() => { if (input.current) { input.current.style.height = "auto"; input.current.style.height = `${Math.min(input.current.scrollHeight, 128)}px`; } }, [draft, open]);

  const send = useCallback(async (text: string, retry = false) => {
    const clean = text.trim();
    if (!clean || !ready || active.current) return;
    trackStoreEvent("assistant_message");
    const controller = new AbortController();
    active.current = controller;
    const requestSession = session.current;
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    retryText.current = clean;
    const userMessage: Message = { id: newId(), role: "user", text: clean };
    if (!retry) setMessages(current => [...current, userMessage]);
    setDraft(""); setError(null); setLoading(true);
    try {
      const response = await fetch("/api/shop-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: clean, context: { sessionId: requestSession }, productContextCode: productCode.current, contextCategorySlug: category.current,
          recentMessages: (retry ? messages : [...messages, userMessage]).slice(-6).map(m => ({ role: m.role, text: m.text.slice(0, 4000) })) }),
      });
      if (!response.ok) throw new Error("REQUEST_FAILED");
      const reply: ShopAssistantReply = await response.json();
      if (typeof reply.text !== "string") throw new Error("INVALID_RESPONSE");
      if (requestSession !== session.current) return;
      productCode.current = reply.contextProductCode || null;
      category.current = reply.contextCategorySlug || null;
      setMessages(current => [...current, { ...reply, id: newId(), role: "assistant" }]);
    } catch {
      if (requestSession === session.current) setError(controller.signal.aborted ? "La consulta se detuvo. Puedes volver a intentarlo." : "No se pudo conectar con Rocky. Inténtalo de nuevo.");
    } finally {
      window.clearTimeout(timeout);
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }, [messages, ready]);

  useEffect(() => {
    if (!initialPrompt) { handled.current = null; return; }
    if (!open || !ready || loading || handled.current === initialPrompt) return;
    handled.current = initialPrompt;
    productCode.current = initialProductCode || null;
    category.current = initialCategorySlug || null;
    void send(initialPrompt);
    onInitialPromptHandled?.();
  }, [open, ready, loading, initialPrompt, initialProductCode, initialCategorySlug, send, onInitialPromptHandled]);

  function reset() {
    active.current?.abort(); active.current = null;
    session.current = newId(); productCode.current = null; category.current = null; handled.current = null;
    setMessages([]); setDraft(""); setError(null); setLoading(false);
    input.current?.focus();
  }
  if (!open) return null;
  return <>
    <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
    <section ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="rocky-chat-title" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const elements = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea');
        const first = elements?.[0], last = elements?.[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true"><MessageCircle size={21} strokeWidth={1.7} /></span>
        <div className={styles.identity}><h2 id="rocky-chat-title">Rocky<span>Asistente</span></h2><p>{businessName}</p></div>
        <button className={styles.iconButton} type="button" title="Nueva conversación" aria-label="Nueva conversación" onClick={reset} disabled={!ready}><RotateCcw size={17} /></button>
        <button className={styles.iconButton} type="button" title="Cerrar" aria-label="Cerrar asistente" onClick={onClose}><X size={20} /></button>
      </header>
      <div ref={body} className={styles.body} role="log" aria-live="polite" aria-label="Conversación con Rocky">
        {!messages.length && <div className={styles.empty}><span className={styles.emptyIcon}><MessageCircle size={30} strokeWidth={1.3} /></span><h3>¿En qué puedo ayudarte?</h3><p>Consulta productos, precios o detalles de tu compra.<br />Estoy aquí para ayudarte.</p></div>}
        {messages.map(message => <article key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
          <span className={styles.speaker}>{message.role === "user" ? "Tú" : "Rocky"}</span>
          <MessageText text={message.text} />
          {message.role === "assistant" && <>
            {message.products?.map(product => <ProductActions key={product.id} product={product} />)}
            {message.quickActions?.filter(action => safeHref(action.href)).map(action => <a className={styles.actionLink} key={action.href} href={action.href} target={action.href.startsWith("https://wa.me/") ? "_blank" : undefined} rel="noreferrer">{action.label}<span aria-hidden="true">↗</span></a>)}
          </>}
        </article>)}
        {loading && <div className={styles.loading} role="status"><span><i /><i /><i /></span>Rocky está consultando tu mensaje</div>}
        {error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={() => void send(retryText.current, true)}><RotateCcw size={13} />Reintentar</button></div>}
      </div>
      <footer className={styles.footer}>
        <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(draft); }}>
          <textarea ref={input} aria-label="Mensaje para Rocky" placeholder="Escribe tu mensaje…" rows={1} maxLength={1200} value={draft} disabled={!ready} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); }
          }} />
          {loading ? <button className={styles.send} aria-label="Detener respuesta" title="Detener" type="button" onClick={() => active.current?.abort()}><Square size={14} fill="currentColor" /></button>
            : <button className={styles.send} aria-label="Enviar mensaje" title="Enviar" type="submit" disabled={!draft.trim() || !ready}><ArrowUp size={20} /></button>}
        </form>
        <div className={styles.footnote}><span>Asistente de {businessName}</span><span>Enter para enviar</span></div>
      </footer>
    </section>
  </>;
}
