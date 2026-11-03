"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, CircleAlert, FileDown, FlaskConical, Package, RotateCcw, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import styles from "./SuperBotSimulator.module.css";

type CatalogPreviewDocument = { relativeUrl: string; filename: string; partNumber: number; partCount: number; productCount: number };
type CatalogPreview = { state: "ready" | "clarify" | "empty"; title: string | null; productCount: number; fromConversationContext: boolean; documents?: CatalogPreviewDocument[] };
type ProductPresentation = { id: string; name: string; code: string; price: number; imageUrl: string | null };
type PaymentPresentation = { imageUrl: string; alt: string };
type Turn = { role: "user" | "assistant"; text: string; catalog?: CatalogPreview | null; product?: ProductPresentation | null; recommendations?: ProductPresentation[]; payment?: PaymentPresentation | null; awaitingQuantity?: boolean };
type Connection = "checking" | "missing" | "ready" | "verified" | "rejected";
type SimulationReply = { text?: string; model?: string; providerUsed?: boolean; reason?: string; notice?: string; error?: string; catalog?: CatalogPreview | null; product?: ProductPresentation; recommendations?: ProductPresentation[]; payment?: PaymentPresentation; awaitingQuantity?: boolean };

const examples = [
  "Hola, busco una licuadora.",
  "¿Cuánto cuesta el producto HY300?",
  "¿Cómo puedo pagar?",
  "¿Me hacen descuento?",
  "Quiero catálogo de parlantes JBL",
];

function connectionLabel(connection: Connection) {
  if (connection === "checking") return "Comprobando servidor…";
  if (connection === "missing") return "Clave no detectada";
  if (connection === "verified") return "OpenAI verificado";
  if (connection === "rejected") return "Clave rechazada por OpenAI";
  return "Clave detectada: envía una prueba";
}

function ProductImage({ product, imageClassName, fallbackClassName }: { product: ProductPresentation; imageClassName: string; fallbackClassName: string }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageUrl || failed) return <div aria-label="Imagen de producto no disponible" className={fallbackClassName}><Package size={24} /></div>;
  // Catalog URLs can be local or remote, so the fixed Next image loader is not appropriate here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={product.name} className={imageClassName} onError={() => setFailed(true)} src={product.imageUrl} />;
}

export function SuperBotSimulator() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<Connection>("checking");
  const [model, setModel] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/rocky-ai", { cache: "no-store" })
      .then(async response => ({ ok: response.ok, data: await response.json() as { configured?: boolean; config?: { model?: string } } }))
      .then(({ ok, data }) => {
        if (!active) return;
        setConnection(ok && data.configured ? "ready" : "missing");
        setModel(data.config?.model || "");
      })
      .catch(() => { if (active) setConnection("missing"); });
    return () => { active = false; };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns, busy]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    const history = [...turns, { role: "user" as const, text }].slice(-12);
    setTurns(history);
    setMessage("");
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/rocky-ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate_live",
          history: history.map(turn => ({
            role: turn.role,
            text: turn.text,
            ...(turn.awaitingQuantity && turn.product ? { selectedProductId: turn.product.id } : {}),
          })),
        }),
      });
      const payload = await response.json() as SimulationReply;
      if (!response.ok || !payload.text) {
        if (response.status === 409 && /clave|OpenAI/i.test(payload.error || "")) setConnection("rejected");
        throw new Error(payload.error || "No se pudo obtener una respuesta de prueba.");
      }
      setTurns(current => [...current, {
        role: "assistant" as const,
        text: payload.text!,
        catalog: payload.catalog,
        product: payload.product ?? null,
        recommendations: payload.recommendations ?? [],
        payment: payload.payment ?? null,
        awaitingQuantity: Boolean(payload.awaitingQuantity),
      }].slice(-12));
      if (payload.providerUsed) setConnection("verified");
      else setConnection(current => current === "rejected" ? current : "ready");
      setModel(payload.model || model);
      setNotice(payload.notice || "Respuesta generada sin enviar mensajes a ningún canal.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo completar la prueba.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(message);
  }

  function reset() {
    if (busy) return;
    setTurns([]);
    setMessage("");
    setNotice("");
  }

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.eyebrow}><FlaskConical size={15} />Laboratorio controlado</div>
      <div className={styles.heroGrid}>
        <div><h1>Prueba a Super Bot</h1><p>Habla con la versión real de OpenAI antes de ponerla frente a un cliente.</p></div>
        <div className={styles.connection} data-state={connection}>
          <span className={styles.dot} /><div><strong>{connectionLabel(connection)}</strong><small>{model || "Modelo del servidor"}</small></div>
        </div>
      </div>
    </header>

    <section className={styles.workspace}>
      <aside className={styles.brief}>
        <div className={styles.briefMark}><ShieldCheck size={19} /></div>
        <h2>Entorno aislado</h2>
        <p>Usa las reglas, precios publicados y catálogo real. Puede generar un PDF de prueba, pero no crea conversaciones, borradores ni envíos.</p>
        <ul><li>Sin activar canales</li><li>Sin contacto real</li><li>Sin confirmar pagos</li><li>Sin revelar stock</li></ul>
        <div className={styles.examples}><span>Prueba una situación</span>{examples.map(example => <button key={example} disabled={busy} onClick={() => setMessage(example)} type="button">{example}</button>)}</div>
        <button className={styles.reset} disabled={busy || turns.length === 0} onClick={reset} type="button"><RotateCcw size={15} />Nueva prueba</button>
      </aside>

      <section className={styles.chat} aria-label="Conversación de prueba con Super Bot">
        <header className={styles.chatHeader}><div><span>SUPER BOT</span><h2>Conversación de prueba</h2></div><div className={styles.safeMark}><Sparkles size={15} />Sin envíos</div></header>
        <div className={styles.messages}>
          {!turns.length ? <div className={styles.empty}><Bot size={42} /><h3>Empieza como un cliente</h3><p>Por ejemplo: “Busco un producto” o “¿Cómo puedo pagar?”.</p></div> : turns.map((turn, index) => <article className={[
            turn.role === "user" ? styles.userTurn : styles.botTurn,
            turn.recommendations?.length ? styles.recommendationTurn : "",
          ].filter(Boolean).join(" ")} key={`${turn.role}-${index}-${turn.text.slice(0, 24)}`}>
            <div className={styles.turnLabel}>{turn.role === "user" ? <><UserRound size={14} />Cliente de prueba</> : <><Bot size={14} />Super Bot</>}</div>
            {turn.role === "assistant" && turn.product ? <section className={styles.productPresentation} aria-label={`Producto verificado: ${turn.product.name}`}>
              <ProductImage fallbackClassName={styles.productImageFallback} imageClassName={styles.productImage} product={turn.product} />
              <div><span>Producto verificado</span><strong>{turn.product.name}</strong><small>Código {turn.product.code}</small><b>S/ {turn.product.price.toFixed(2)} c/u</b></div>
            </section> : null}
            {turn.role === "assistant" && turn.payment ? <a aria-label="Abrir cuentas oficiales" className={styles.paymentPresentation} href={turn.payment.imageUrl} rel="noreferrer" target="_blank">
              {/* The official notice is intentionally shown as a picture, not transcribed into the chat. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={turn.payment.alt} src={turn.payment.imageUrl} />
            </a> : null}
            {turn.role === "assistant" && turn.recommendations?.length ? <section aria-label="Opciones verificadas" className={styles.recommendationShelf}>
              <div className={styles.recommendationGrid}>{turn.recommendations.map(product => <button aria-label={`Elegir ${product.name}, código ${product.code}, S/ ${product.price.toFixed(2)}`} className={styles.recommendationCard} disabled={busy} key={product.id} onClick={() => void send(product.code)} type="button">
                <ProductImage fallbackClassName={styles.recommendationImageFallback} imageClassName={styles.recommendationImage} product={product} />
                <span className={styles.recommendationCode}>{product.code}</span>
                <strong>{product.name}</strong>
                <b>S/ {product.price.toFixed(2)} <small>c/u</small></b>
                <em>Elegir este</em>
              </button>)}</div>
              <p className={styles.selectionPrompt}>Elige una opción.</p>
            </section> : <p>{turn.text}</p>}
            {turn.role === "assistant" && turn.catalog && <div className={styles.catalogPreview} data-state={turn.catalog.state}>
              <strong>{turn.catalog.state === "ready" ? "Catálogo verificado" : "Solicitud de catálogo"}</strong>
              {turn.catalog.title && <span>{turn.catalog.title} · {turn.catalog.productCount} productos</span>}
              {turn.catalog.fromConversationContext && <small>Alcance recuperado de la consulta anterior del cliente.</small>}
              {turn.catalog.documents?.length ? <div className={styles.catalogDocuments}>
                {turn.catalog.documents.map(document => <a download={document.filename} href={document.relativeUrl} key={document.relativeUrl} rel="noreferrer" target="_blank"><FileDown size={14} />{document.partCount > 1 ? `Descargar PDF ${document.partNumber}/${document.partCount}` : "Descargar PDF"}</a>)}
                <em>PDF de prueba generado. No se envió a ningún canal.</em>
              </div> : turn.catalog.state === "ready" ? <em>El PDF se generará con esta solicitud.</em> : null}
            </div>}
          </article>)}
          {busy && <article className={styles.typing}><Bot size={15} /><span>Super Bot está verificando catálogo y reglas…</span></article>}
          <div ref={endRef} />
        </div>
        {notice && <p className={styles.notice}><CircleAlert size={15} />{notice}</p>}
        <form className={styles.composer} onSubmit={submit}>
          <label htmlFor="simulator-message">Mensaje del cliente</label>
          <div><textarea autoComplete="off" disabled={busy} id="simulator-message" maxLength={600} onChange={event => setMessage(event.target.value)} placeholder="Escribe aquí la consulta que haría un cliente…" rows={3} value={message} /><button aria-label="Probar mensaje" disabled={busy || !message.trim()} type="submit"><Send size={17} /></button></div>
          <small>La prueba consume una llamada real de OpenAI y queda limitada para proteger el presupuesto.</small>
        </form>
      </section>
    </section>
  </main>;
}
