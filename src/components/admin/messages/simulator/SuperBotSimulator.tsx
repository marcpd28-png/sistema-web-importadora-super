"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  CircleAlert,
  FileDown,
  FlaskConical,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { ChatMessage } from "@/types/messages";
import { readJsonResponse } from "@/lib/http-json";
import styles from "./SuperBotSimulator.module.css";

type Connection = "ready" | "openai" | "verified" | "error";

type Turn = {
  id: string;
  mediaUrl: string | null;
  messageType: ChatMessage["messageType"];
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
  messages?: ChatMessage[];
};

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
  if (connection === "openai") return "OpenAI verificado";
  if (connection === "verified") return "Catálogo verificado";
  if (connection === "error") return "Revisa la prueba";
  return "Simulador aislado";
}

function connectionDetail(connection: Connection, model: string) {
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
      role: message.senderType === "CUSTOMER" ? "user" : "assistant",
      text: message.content,
    }));
}

function simulationNotice(payload: SimulatorResponse) {
  if (payload.automationError) return payload.automationError;

  if (payload.aiSimulation?.provider === "openai") {
    return `Respuesta de prueba generada con ${payload.aiSimulation.model ?? "OpenAI"}. No se envió a ningún canal.`;
  }

  if (payload.aiSimulation?.provider === "verified") {
    return "La prueba usó el respaldo con datos verificados del catálogo. No se envió a ningún canal.";
  }

  return "Respuesta generada en el entorno de prueba. No se envió a ningún canal.";
}

export function SuperBotSimulator() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<Connection>("ready");
  const [model, setModel] = useState("");
  const [sessionKey, setSessionKey] = useState(() => createSessionKey());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [busy, turns]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;

    const optimisticTurn: Turn = {
      id: `pending-${Date.now()}`,
      mediaUrl: null,
      messageType: "TEXT",
      role: "user",
      text,
    };

    setTurns((current) => [...current, optimisticTurn]);
    setMessage("");
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/admin/conversations/simulate", {
        body: JSON.stringify({
          content: text,
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

  function reset() {
    if (busy) return;

    setSessionKey(createSessionKey());
    setTurns([]);
    setMessage("");
    setNotice("");
    setConnection("ready");
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
          <p>Usa las reglas, precios publicados y catálogo real en un hilo marcado solo para simulación.</p>
          <ul>
            <li>Sin activar canales</li>
            <li>Sin contacto real</li>
            <li>Sin confirmar pagos</li>
            <li>Sin revelar stock</li>
          </ul>
          <div className={styles.examples}>
            <span>Prueba una situación</span>
            {examples.map((example) => (
              <button disabled={busy} key={example} onClick={() => setMessage(example)} type="button">
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
          <header className={styles.chatHeader}>
            <div>
              <span>SUPER BOT</span>
              <h2>Conversación de prueba</h2>
            </div>
            <div className={styles.safeMark}>
              <Sparkles size={15} />
              Sin envíos
            </div>
          </header>

          <div aria-live="polite" className={styles.messages}>
            {!turns.length ? (
              <div className={styles.empty}>
                <Bot size={42} />
                <h3>Empieza como un cliente</h3>
                <p>Por ejemplo: “Busco un producto” o “¿Cómo puedo pagar?”.</p>
              </div>
            ) : (
              turns.map((turn) => (
                <article className={turn.role === "user" ? styles.userTurn : styles.botTurn} key={turn.id}>
                  <div className={styles.turnLabel}>
                    {turn.role === "user" ? <UserRound size={14} /> : <Bot size={14} />}
                    {turn.role === "user" ? "Cliente de prueba" : "Super Bot"}
                  </div>
                  {turn.messageType === "IMAGE" && turn.mediaUrl ? (
                    // Simulation attachments may come from arbitrary provider URLs, so they cannot use the app's fixed image loader.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={turn.text || "Imagen compartida en la simulación"} className={styles.mediaImage} src={turn.mediaUrl} />
                  ) : null}
                  {turn.messageType === "DOCUMENT" && turn.mediaUrl ? (
                    <a className={styles.document} href={turn.mediaUrl} rel="noreferrer" target="_blank">
                      <FileDown size={17} />
                      Abrir documento de prueba
                    </a>
                  ) : null}
                  {turn.text ? <p>{turn.text}</p> : null}
                </article>
              ))
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
            <div>
              <textarea
                autoComplete="off"
                disabled={busy}
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
              <button aria-label="Probar mensaje" disabled={busy || !message.trim()} type="submit">
                <Send size={17} />
              </button>
            </div>
            <small>La prueba usa el motor real en modo aislado y nunca envía mensajes a un canal.</small>
          </form>
        </section>
      </section>
    </main>
  );
}
