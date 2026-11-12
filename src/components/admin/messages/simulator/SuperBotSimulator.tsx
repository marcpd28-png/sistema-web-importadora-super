"use client";

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  CircleAlert,
  FileDown,
  FlaskConical,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { ChatMessage } from "@/types/messages";
import { readJsonResponse } from "@/lib/http-json";
import styles from "./SuperBotSimulator.module.css";

type Connection = "ready" | "openai" | "verified" | "error" | "disabled";

type Turn = {
  id: string;
  mediaUrl: string | null;
  messageType: ChatMessage["messageType"];
  paymentMethodsImage: boolean;
  productCard: boolean;
  productAlt: string;
  role: "user" | "assistant";
  text: string;
};

type SimulatorResponse = {
  aiSimulation?: {
    enabled: boolean;
    fallbackReason: string | null;
    model: string | null;
    provider: "openai" | "verified" | null;
  };
  automationError?: string | null;
  pendingSince?: string | null;
  messages?: ChatMessage[];
};

type TurnGroup = { kind: "turn"; turn: Turn } | { kind: "carousel"; id: string; cards: Turn[] };

const examples = [
  "Hola, busco una licuadora.",
  "¿Cuánto cuesta el producto HY300?",
  "¿Cómo puedo pagar?",
  "¿Me hacen descuento?",
  "Quiero catálogo de parlantes JBL.",
];

function createSessionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function connectionLabel(connection: Connection) {
  if (connection === "disabled") return "Pruebas deshabilitadas";
  if (connection === "openai") return "OpenAI verificado";
  if (connection === "verified") return "Catálogo verificado";
  if (connection === "error") return "Revisa la prueba";
  return "Simulador aislado";
}

function connectionDetail(connection: Connection, model: string) {
  if (connection === "disabled") return "Actívalas desde Configuración";
  if (model) return model;
  if (connection === "verified") return "Respuesta basada en datos confirmados";
  if (connection === "error") return "No se enviaron mensajes reales";
  return "Listo para una conversación de prueba";
}

function getTurns(messages: ChatMessage[]) {
  return messages
    .filter((message) => (
      (message.senderType === "CUSTOMER" || message.senderType === "BOT" || message.senderType === "AGENT")
      && (message.content.trim().length > 0 || Boolean(message.mediaUrl))
    ))
    .map<Turn>((message) => ({
      id: message.id,
      mediaUrl: message.mediaUrl,
      messageType: message.messageType,
      paymentMethodsImage: Boolean(message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata) && (message.metadata as Record<string, unknown>).paymentMethodsImage === true),
      productCard: Boolean(message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata) && (message.metadata as Record<string, unknown>).productCard === true),
      productAlt: message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata) && typeof (message.metadata as Record<string, unknown>).alt === "string" ? String((message.metadata as Record<string, unknown>).alt) : "Producto del catálogo",
      role: message.senderType === "CUSTOMER" ? "user" : "assistant",
      text: message.content,
    }));
}

function groupVisualCards(turns: Turn[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const turn of turns) {
    const current = groups.at(-1);
    if (turn.role === "assistant" && turn.productCard && current?.kind === "carousel") {
      current.cards.push(turn);
    } else if (turn.role === "assistant" && turn.productCard) {
      groups.push({ kind: "carousel", id: `carousel-${turn.id}`, cards: [turn] });
    } else {
      groups.push({ kind: "turn", turn });
    }
  }
  return groups;
}

function ProductCarousel({ cards, disabled, onSelect, selectedId }: { cards: Turn[]; disabled: boolean; onSelect: (card: Turn) => void; selectedId: string | null }) {
  const railRef = useRef<HTMLDivElement>(null);
  const move = (direction: -1 | 1) => railRef.current?.scrollBy({ left: direction * Math.max(220, railRef.current.clientWidth * 0.78), behavior: "smooth" });
  return <section aria-label={`${cards.length} productos visuales`} className={styles.productCarousel}>
    <button aria-label="Ver opciones anteriores" className={styles.carouselControl} disabled={disabled} onClick={() => move(-1)} type="button">‹</button>
    <div className={styles.carouselRail} ref={railRef} tabIndex={0}>
      {cards.map((card) => <button aria-label={`Seleccionar ${card.productAlt}`} aria-pressed={selectedId === card.id} className={styles.carouselCard} disabled={disabled} key={card.id} onClick={() => onSelect(card)} type="button">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={card.productAlt} className={styles.mediaImage} src={card.mediaUrl ?? ""} />
      </button>)}
    </div>
    <button aria-label="Ver siguientes opciones" className={styles.carouselControl} disabled={disabled} onClick={() => move(1)} type="button">›</button>
  </section>;
}

function simulationNotice(payload: SimulatorResponse) {
  if (payload.automationError) return payload.automationError;
  if (payload.pendingSince) return "Super Bot no envió una respuesta: esta conversación quedó pendiente para un asesor.";

  if (payload.aiSimulation?.provider === "openai") {
    return `Respuesta de prueba generada con ${payload.aiSimulation.model ?? "OpenAI"}. No se envió a ningún canal.`;
  }

  if (payload.aiSimulation?.provider === "verified") {
    return "La prueba usó el respaldo con datos verificados del catálogo. No se envió a ningún canal.";
  }

  return "Respuesta generada en el entorno de prueba. No se envió a ningún canal.";
}

export function SuperBotSimulator({ enabled }: { enabled: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<Connection>(enabled ? "ready" : "disabled");
  const [model, setModel] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(() => createSessionKey());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [busy, turns]);

  async function send(raw: string, uploadedImage = imageDataUrl) {
    const text = raw.trim();
    if ((!text && !uploadedImage) || busy) return;
    if (!enabled) {
      setConnection("disabled");
      setNotice("El entorno de pruebas está deshabilitado. Actívalo en Configuración sin habilitar ningún canal.");
      return;
    }

    const optimisticTurn: Turn = {
      id: `pending-${Date.now()}`,
      mediaUrl: uploadedImage ?? null,
      messageType: uploadedImage ? "IMAGE" : "TEXT",
      paymentMethodsImage: false,
      productCard: false,
      productAlt: "Imagen compartida por el cliente de prueba",
      role: "user",
      text,
    };

    setTurns((current) => [...current, optimisticTurn]);
    setMessage("");
    setImageDataUrl(null);
    setImageName("");
    setSelectedCardId(null);
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/admin/conversations/simulate", {
        body: JSON.stringify({
          content: text,
          imageDataUrl: uploadedImage ?? undefined,
          name: "Cliente de prueba",
          sessionKey,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readJsonResponse<SimulatorResponse & { error?: string }>(response);

      if (!response.ok || !payload.messages) {
        throw new Error(payload.error || "No se pudo obtener una respuesta de prueba.");
      }

      setTurns(getTurns(payload.messages));
      setNotice(simulationNotice(payload));

      if (payload.automationError) {
        setConnection("error");
      } else if (payload.aiSimulation?.provider === "openai") {
        setConnection("openai");
        setModel(payload.aiSimulation.model ?? "");
      } else if (payload.aiSimulation?.provider === "verified") {
        setConnection("verified");
        setModel("");
      } else {
        setConnection("ready");
        setModel("");
      }
    } catch (error) {
      setConnection("error");
      setNotice(error instanceof Error ? error.message : "No se pudo completar la prueba.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(message);
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^(image\/jpeg|image\/png|image\/webp)$/.test(file.type) || !file.size || file.size > 4 * 1024 * 1024) {
      setNotice("Adjunta una imagen JPG, PNG o WebP de hasta 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setNotice("No se pudo leer la imagen de prueba.");
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setImageDataUrl(reader.result);
      setImageName(file.name || "Imagen de prueba");
      setNotice("");
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    if (busy) return;

    setSessionKey(createSessionKey());
    setTurns([]);
    setMessage("");
    setImageDataUrl(null);
    setImageName("");
    setSelectedCardId(null);
    setNotice("");
    setConnection(enabled ? "ready" : "disabled");
    setModel("");
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>
          <FlaskConical size={15} />
          Laboratorio controlado
        </div>
        <div className={styles.heroGrid}>
          <div>
            <h1>Prueba a Super Bot</h1>
            <p>Ensaya respuestas con datos verificados antes de poner el bot frente a un cliente.</p>
          </div>
          <div className={styles.connection} data-state={connection}>
            <span className={styles.dot} />
            <div>
              <strong>{connectionLabel(connection)}</strong>
              <small>{connectionDetail(connection, model)}</small>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.workspace}>
        <aside className={styles.brief}>
          <div className={styles.briefMark}>
            <ShieldCheck size={19} />
          </div>
          <h2>Entorno aislado</h2>
          <p>{enabled
            ? "Usa las reglas, precios publicados y catálogo real en un hilo marcado solo para simulación."
            : "Está bloqueado hasta que un propietario lo habilite desde Configuración. Ningún canal se activará al hacerlo."}</p>
          <ul>
            <li>Sin activar canales</li>
            <li>Sin contacto real</li>
            <li>Sin confirmar pagos</li>
            <li>Sin revelar stock</li>
          </ul>
          <div className={styles.examples}>
            <span>Prueba una situación</span>
            {examples.map((example) => (
              <button disabled={busy || !enabled} key={example} onClick={() => setMessage(example)} type="button">
                {example}
              </button>
            ))}
          </div>
          <button className={styles.reset} disabled={busy || turns.length === 0} onClick={reset} type="button">
            <RotateCcw size={15} />
            Nueva prueba
          </button>
        </aside>

        <section aria-label="Conversación de prueba con Super Bot" className={styles.chat}>
          <header className={`chat-header ${styles.chatHeader}`}>
            <div>
              <span>SUPER BOT</span>
              <h2>Conversación de prueba</h2>
            </div>
            <div className={styles.safeMark}>
              <Sparkles size={15} />
              Sin envíos
            </div>
          </header>

          <div aria-live="polite" className={`chat-messages ${styles.messages}`}>
            {!turns.length ? (
              <div className={styles.empty}>
                <Bot size={42} />
                <h3>Empieza como un cliente</h3>
                <p>Por ejemplo: “Busco un producto” o “¿Cómo puedo pagar?”.</p>
              </div>
            ) : (
              groupVisualCards(turns).map((group) => group.kind === "carousel" ? <ProductCarousel cards={group.cards} disabled={busy || !enabled} key={group.id} selectedId={selectedCardId} onSelect={(card) => { setSelectedCardId(card.id); setMessage("Me interesa"); }} /> : (() => {
                const turn = group.turn;
                return (
                <article className={`${turn.role === "user" ? "message-bubble message-customer" : "message-bubble message-agent"} ${turn.role === "user" ? styles.userTurn : styles.botTurn} ${turn.productCard ? styles.visualCard : ""}`} key={turn.id}>
                  {!turn.productCard && !turn.paymentMethodsImage ? <div className={styles.turnLabel}>
                    {turn.role === "user" ? <UserRound size={14} /> : <Bot size={14} />}
                    {turn.role === "user" ? "Cliente de prueba" : "Super Bot"}
                  </div> : null}
                  {turn.messageType === "IMAGE" && turn.mediaUrl ? (
                    turn.productCard ? null : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={turn.paymentMethodsImage ? "Métodos de pago" : turn.text || "Imagen compartida en la simulación"} className={styles.mediaImage} src={turn.mediaUrl} />
                    )
                  ) : null}
                  {turn.messageType === "DOCUMENT" && turn.mediaUrl ? (
                    <a className={styles.document} href={turn.mediaUrl} rel="noreferrer" target="_blank">
                      <FileDown size={17} />
                      Abrir documento de prueba
                    </a>
                  ) : null}
                  {turn.text && !turn.productCard && !turn.paymentMethodsImage ? <p>{turn.text}</p> : null}
                </article>
                );
              })())
            )}
            {busy ? (
              <article className={styles.typing}>
                <Bot size={15} />
                <span>Super Bot está verificando catálogo y reglas…</span>
              </article>
            ) : null}
            <div ref={endRef} />
          </div>

          {notice ? (
            <p className={styles.notice} role="status">
              <CircleAlert size={15} />
              {notice}
            </p>
          ) : null}

          <form className={styles.composer} onSubmit={submit}>
            <label htmlFor="simulator-message">Mensaje del cliente</label>
            {imageDataUrl ? <div className={styles.imageAttachment}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Vista previa de la imagen seleccionada" src={imageDataUrl} />
              <span>{imageName}</span>
              <button aria-label="Quitar imagen" onClick={() => { setImageDataUrl(null); setImageName(""); }} type="button"><X size={15} /></button>
            </div> : null}
            <div>
              <input accept="image/jpeg,image/png,image/webp" aria-label="Adjuntar captura de producto" className={styles.fileInput} disabled={busy || !enabled} id="simulator-image" onChange={selectImage} type="file" />
              <label className={styles.attachButton} htmlFor="simulator-image" title="Adjuntar captura"><Paperclip size={17} /></label>
              <textarea
                autoComplete="off"
                disabled={busy || !enabled}
                id="simulator-message"
                maxLength={1200}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Escribe aquí la consulta que haría un cliente…"
                rows={3}
                value={message}
              />
              <button aria-label="Probar mensaje" disabled={busy || !enabled || (!message.trim() && !imageDataUrl)} type="submit">
                <Send size={17} />
              </button>
            </div>
            <small>{enabled
              ? "Adjunta una captura de TikTok, marketing o tienda virtual. La prueba usa IA y catálogo local, sin enviar nada a un canal."
              : "Para iniciar una prueba, habilita primero este entorno desde Configuración."}</small>
          </form>
        </section>
      </section>
    </main>
  );
}
