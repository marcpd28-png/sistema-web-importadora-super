"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  FileDown,
  FileText,
  FlaskConical,
  ImageIcon,
  Landmark,
  LoaderCircle,
  MessageCircle,
  Package,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import styles from "./SuperBotSimulator.module.css";

type CatalogPreviewDocument = {
  relativeUrl: string;
  filename: string;
  partNumber: number;
  partCount: number;
  productCount: number;
};

type CatalogPreview = {
  state: "ready" | "clarify" | "empty";
  title: string | null;
  productCount: number;
  fromConversationContext: boolean;
  documents?: CatalogPreviewDocument[];
};

type ProductPresentation = {
  id: string;
  name: string;
  code: string;
  price: number;
  imageUrl: string | null;
};

type PaymentPresentation = {
  imageUrl: string;
  alt: string;
};

type Turn = {
  role: "user" | "assistant";
  text: string;
  opening?: string;
  catalog?: CatalogPreview | null;
  product?: ProductPresentation | null;
  recommendations?: ProductPresentation[];
  payment?: PaymentPresentation | null;
  awaitingQuantity?: boolean;
};

type Connection = "checking" | "missing" | "ready" | "verified" | "rejected";
type ScenarioState = "idle" | "selected" | "evidence" | "review";

type SimulationReply = {
  text?: string;
  model?: string;
  providerUsed?: boolean;
  reason?: string;
  notice?: string;
  error?: string;
  opening?: string;
  catalog?: CatalogPreview | null;
  product?: ProductPresentation;
  recommendations?: ProductPresentation[];
  payment?: PaymentPresentation;
  awaitingQuantity?: boolean;
};

const scenarios = [
  {
    id: "greeting",
    group: "Conversación",
    label: "Saludo",
    prompt: "Hola",
    expected: "Presentación cálida, una sola vez.",
    icon: MessageCircle,
  },
  {
    id: "product",
    group: "Conversación",
    label: "Producto único",
    prompt: "Soporte de tablet MY-7671",
    expected: "Foto, precio y pregunta de cantidad.",
    icon: Package,
  },
  {
    id: "recommendation",
    group: "Conversación",
    label: "Recomendación",
    prompt: "¿Qué modelo de soporte me recomiendas, el más barato?",
    expected: "Opciones visuales verificadas.",
    icon: Sparkles,
  },
  {
    id: "payment",
    group: "Seguridad",
    label: "Pago",
    prompt: "¿Cómo puedo pagar?",
    expected: "Imagen oficial, sin confirmar pagos.",
    icon: Landmark,
  },
  {
    id: "handoff",
    group: "Seguridad",
    label: "Derivación",
    prompt: "Ya pagué, adjunto mi comprobante.",
    expected: "Pasa a un asesor humano.",
    icon: ShieldCheck,
  },
  {
    id: "catalog",
    group: "Evidencia",
    label: "Catálogo PDF",
    prompt: "Quiero catálogo de parlantes JBL",
    expected: "PDF descargable sin envío real.",
    icon: FileText,
  },
  {
    id: "unknown",
    group: "Evidencia",
    label: "No identificado",
    prompt: "Busco el producto ZXQ-99999",
    expected: "Pide aclaración; no inventa.",
    icon: Search,
  },
] as const;

type Scenario = (typeof scenarios)[number];
type ScenarioId = Scenario["id"];

type RunSnapshot = {
  durationMs: number;
  providerUsed: boolean;
  scenarioId: ScenarioId | null;
};

const scenarioGroups = ["Conversación", "Seguridad", "Evidencia"] as const;

function createScenarioStates(): Record<ScenarioId, ScenarioState> {
  return Object.fromEntries(scenarios.map((scenario) => [scenario.id, "idle"])) as Record<ScenarioId, ScenarioState>;
}
function connectionLabel(connection: Connection) {
  if (connection === "checking") return "Comprobando servidor…";
  if (connection === "missing") return "Clave no detectada";
  if (connection === "verified") return "OpenAI verificado";
  if (connection === "rejected") return "Clave rechazada por OpenAI";
  return "Clave detectada: envía una prueba";
}

function scenarioStateLabel(state: ScenarioState) {
  if (state === "selected") return "Listo";
  if (state === "evidence") return "Evidencia";
  if (state === "review") return "Revisar";
  return "Pendiente";
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return durationMs + " ms";
  if (durationMs < 10_000) return (durationMs / 1000).toFixed(1) + " s";
  return Math.round(durationMs / 1000) + " s";
}

function markNow() {
  return globalThis.performance?.now?.() ?? 0;
}

function isHumanHandoff(text: string) {
  return /asesor|persona|humano|te atenderá|te atendera/i.test(text);
}

function asksForClarification(text: string) {
  return /indica|indíqu|nombre|modelo|código|codigo|aclara|cuál|cual/i.test(text);
}

function scenarioHasEvidence(id: ScenarioId, reply: SimulationReply) {
  if (id === "greeting") return Boolean(reply.opening);
  if (id === "product") return Boolean(reply.product && reply.awaitingQuantity);
  if (id === "recommendation") return Boolean(reply.recommendations?.length);
  if (id === "payment") return Boolean(reply.payment?.imageUrl);
  if (id === "handoff") return isHumanHandoff(reply.text ?? "");
  if (id === "catalog") return Boolean(reply.catalog?.documents?.length);
  return asksForClarification(reply.text ?? "") && !isHumanHandoff(reply.text ?? "");
}

function ProductImage({
  product,
  imageClassName,
  fallbackClassName,
}: {
  product: ProductPresentation;
  imageClassName: string;
  fallbackClassName: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!product.imageUrl || failed) {
    return (
      <div aria-label="Imagen de producto no disponible" className={fallbackClassName}>
        <Package size={24} />
      </div>
    );
  }

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
  const [activeScenario, setActiveScenario] = useState<ScenarioId | null>(null);
  const [scenarioStates, setScenarioStates] = useState<Record<ScenarioId, ScenarioState>>(createScenarioStates);
  const [lastRun, setLastRun] = useState<RunSnapshot | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const latestAssistantTurn = useMemo(
    () => [...turns].reverse().find((turn) => turn.role === "assistant") ?? null,
    [turns],
  );
  const completedScenarios = Object.values(scenarioStates).filter((state) => state === "evidence" || state === "review").length;
  const evidenceScenarios = Object.values(scenarioStates).filter((state) => state === "evidence").length;
  const activeScenarioMeta = scenarios.find((scenario) => scenario.id === activeScenario) ?? null;

  useEffect(() => {
    let active = true;

    void fetch("/api/admin/rocky-ai", { cache: "no-store" })
      .then(async (response) => ({
        ok: response.ok,
        data: (await response.json()) as { configured?: boolean; config?: { model?: string } },
      }))
      .then(({ ok, data }) => {
        if (!active) return;
        setConnection(ok && data.configured ? "ready" : "missing");
        setModel(data.config?.model || "");
      })
      .catch(() => {
        if (active) setConnection("missing");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  function chooseScenario(id: ScenarioId) {
    if (busy) return;
    const scenario = scenarios.find((item) => item.id === id);
    if (!scenario) return;

    setActiveScenario(id);
    setScenarioStates((current) => {
      const next = { ...current };
      if (activeScenario && next[activeScenario] === "selected") next[activeScenario] = "idle";
      next[id] = "selected";
      return next;
    });
    setMessage(scenario.prompt);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;

    const scenarioId = activeScenario;
    const history = [...turns, { role: "user" as const, text }].slice(-12);
    const startedAt = markNow();

    setTurns(history);
    setMessage("");
    setActiveScenario(null);
    setBusy(true);
    setNotice("");

    try {
      const response = await fetch("/api/admin/rocky-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate_live",
          history: history.map((turn) => ({
            role: turn.role,
            text: turn.text,
            ...(turn.awaitingQuantity && turn.product ? { selectedProductId: turn.product.id } : {}),
          })),
        }),
      });
      const payload = (await response.json()) as SimulationReply;
      const replyText = payload.text;

      if (!response.ok || !replyText) {
        if (response.status === 409 && /clave|OpenAI/i.test(payload.error || "")) setConnection("rejected");
        throw new Error(payload.error || "No se pudo obtener una respuesta de prueba.");
      }

      setTurns((current) => [
        ...current,
        {
          role: "assistant" as const,
          text: replyText,
          opening: payload.opening,
          catalog: payload.catalog,
          product: payload.product ?? null,
          recommendations: payload.recommendations ?? [],
          payment: payload.payment ?? null,
          awaitingQuantity: Boolean(payload.awaitingQuantity),
        },
      ].slice(-12));

      if (payload.providerUsed) setConnection("verified");
      else setConnection((current) => (current === "rejected" ? current : "ready"));

      setModel(payload.model || model);
      setNotice(payload.notice || "Respuesta generada sin enviar mensajes a ningún canal.");
      setLastRun({
        durationMs: Math.max(0, Math.round(markNow() - startedAt)),
        providerUsed: Boolean(payload.providerUsed),
        scenarioId,
      });

      if (scenarioId) {
        setScenarioStates((current) => ({
          ...current,
          [scenarioId]: scenarioHasEvidence(scenarioId, payload) ? "evidence" : "review",
        }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo completar la prueba.");
      if (scenarioId) {
        setScenarioStates((current) => ({ ...current, [scenarioId]: "review" }));
      }
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
    setActiveScenario(null);
    setScenarioStates(createScenarioStates());
    setLastRun(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <div className={styles.eyebrow}>
            <FlaskConical size={15} />
            Laboratorio controlado
          </div>
          <span className={styles.heroSafety}>
            <ShieldCheck size={14} />
            Sin envíos reales
          </span>
        </div>

        <div className={styles.heroGrid}>
          <div>
            <p className={styles.heroKicker}>Mesa de control · Super Bot</p>
            <h1>Prueba lo que un cliente realmente verá.</h1>
            <p className={styles.heroCopy}>
              Carga un caso, revisa la evidencia visual y valida las respuestas antes de abrir un canal.
            </p>
          </div>
          <div className={styles.connection} data-state={connection}>
            <span className={styles.dot} />
            <div>
              <strong>{connectionLabel(connection)}</strong>
              <small>{model || "Modelo del servidor"}</small>
            </div>
          </div>
        </div>

        <div className={styles.preflight} aria-label="Protecciones del laboratorio">
          <span><Check size={13} />Catálogo publicado</span>
          <span><Check size={13} />Reglas reales</span>
          <span><Check size={13} />Sin conversaciones ni borradores</span>
        </div>
      </header>

      <section className={styles.workspace}>
        <aside className={styles.scenarioRail} aria-label="Plan de pruebas">
          <div className={styles.railHeading}>
            <div>
              <span>Plan de prueba</span>
              <h2>{evidenceScenarios}/{scenarios.length} con evidencia</h2>
            </div>
            <div aria-label={completedScenarios + " escenarios revisados"} className={styles.coverage}>
              {Math.round((completedScenarios / scenarios.length) * 100)}%
            </div>
          </div>
          <p className={styles.railHint}>Selecciona un caso para cargarlo. Tú decides cuándo consumir una prueba.</p>

          {scenarioGroups.map((group) => (
            <section className={styles.scenarioGroup} key={group}>
              <h3>{group}</h3>
              <div>
                {scenarios.filter((scenario) => scenario.group === group).map((scenario) => {
                  const ScenarioIcon = scenario.icon;
                  const state = scenarioStates[scenario.id];
                  const selected = activeScenario === scenario.id;

                  return (
                    <button
                      aria-pressed={selected}
                      className={styles.scenario}
                      data-selected={selected || undefined}
                      data-state={state}
                      disabled={busy}
                      key={scenario.id}
                      onClick={() => chooseScenario(scenario.id)}
                      type="button"
                    >
                      <span className={styles.scenarioIcon}><ScenarioIcon size={15} /></span>
                      <span className={styles.scenarioCopy}>
                        <strong>{scenario.label}</strong>
                        <small>{scenario.expected}</small>
                      </span>
                      <span className={styles.scenarioState}>
                        {state === "evidence" ? <Check size={12} /> : null}
                        {scenarioStateLabel(state)}
                      </span>
                      <ChevronRight className={styles.scenarioArrow} size={14} />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <button className={styles.reset} disabled={busy || turns.length === 0} onClick={reset} type="button">
            <RotateCcw size={15} />
            Reiniciar sesión
          </button>
        </aside>

        <section aria-label="Conversación de prueba con Super Bot" className={styles.chat}>
          <header className={styles.chatHeader}>
            <div>
              <span>SUPER BOT · SESIÓN AISLADA</span>
              <h2>Conversación de prueba</h2>
            </div>
            <div className={styles.chatMode}>
              <span className={styles.safeMark}><Sparkles size={14} />Sin envíos</span>
              {activeScenarioMeta ? <span className={styles.activeCase}>{activeScenarioMeta.label}</span> : null}
            </div>
          </header>

          <div aria-busy={busy} aria-label="Historial de conversación de prueba" className={styles.messages} role="log">
            {!turns.length ? (
              <div className={styles.empty}>
                <div className={styles.emptyOrb}><Bot size={30} /></div>
                <span>Sesión limpia</span>
                <h3>Empieza por un caso de prueba.</h3>
                <p>Elige un escenario a la izquierda o escribe la consulta que haría un cliente.</p>
                <button onClick={() => chooseScenario("product")} type="button">
                  Cargar producto único <ChevronRight size={15} />
                </button>
              </div>
            ) : (
              turns.map((turn, index) => {
                const hasRecommendations = Boolean(turn.recommendations?.length);

                return (
                  <article
                    className={[
                      turn.role === "user" ? styles.userTurn : styles.botTurn,
                      hasRecommendations ? styles.recommendationTurn : "",
                    ].filter(Boolean).join(" ")}
                    key={[turn.role, index, turn.text.slice(0, 24)].join("-")}
                  >
                    <div className={styles.turnLabel}>
                      {turn.role === "user" ? <UserRound size={14} /> : <Bot size={14} />}
                      {turn.role === "user" ? "Cliente de prueba" : "Super Bot"}
                    </div>

                    {turn.role === "assistant" && turn.product ? (
                      <section aria-label={"Producto verificado: " + turn.product.name} className={styles.productPresentation}>
                        <ProductImage
                          fallbackClassName={styles.productImageFallback}
                          imageClassName={styles.productImage}
                          product={turn.product}
                        />
                        <div>
                          <span>Producto verificado</span>
                          <strong>{turn.product.name}</strong>
                          <small>Código {turn.product.code}</small>
                          <b>S/ {turn.product.price.toFixed(2)} <em>c/u</em></b>
                        </div>
                      </section>
                    ) : null}

                    {turn.role === "assistant" && turn.payment ? (
                      <a
                        aria-label="Abrir imagen oficial de cuentas"
                        className={styles.paymentPresentation}
                        href={turn.payment.imageUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span><Landmark size={13} />Imagen oficial de pago · abrir</span>
                        {/* The official notice is intentionally shown as an image, never transcribed into the chat. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={turn.payment.alt} src={turn.payment.imageUrl} />
                      </a>
                    ) : null}

                    {hasRecommendations ? (
                      <section aria-label="Opciones verificadas" className={styles.recommendationShelf}>
                        {turn.opening ? <p className={styles.welcomeLine}>{turn.opening}</p> : null}
                        <div className={styles.recommendationGrid}>
                          {turn.recommendations?.map((product) => (
                            <button
                              aria-label={"Elegir " + product.name + ", código " + product.code + ", S/ " + product.price.toFixed(2)}
                              className={styles.recommendationCard}
                              disabled={busy}
                              key={product.id}
                              onClick={() => void send(product.code)}
                              type="button"
                            >
                              <ProductImage
                                fallbackClassName={styles.recommendationImageFallback}
                                imageClassName={styles.recommendationImage}
                                product={product}
                              />
                              <span className={styles.recommendationCode}>{product.code}</span>
                              <strong>{product.name}</strong>
                              <b>S/ {product.price.toFixed(2)} <small>c/u</small></b>
                              <em>Probar selección <ChevronRight size={13} /></em>
                            </button>
                          ))}
                        </div>
                        <p className={styles.selectionPrompt}>Selecciona una opción para continuar el flujo de compra.</p>
                      </section>
                    ) : (
                      <p>{turn.text}</p>
                    )}

                    {turn.role === "assistant" && turn.catalog ? (
                      <div className={styles.catalogPreview} data-state={turn.catalog.state}>
                        <div>
                          <strong>{turn.catalog.state === "ready" ? "Catálogo verificado" : "Solicitud de catálogo"}</strong>
                          {turn.catalog.title ? <span>{turn.catalog.title + " · " + turn.catalog.productCount + " productos"}</span> : null}
                        </div>
                        {turn.catalog.fromConversationContext ? <small>Alcance recuperado de la consulta anterior.</small> : null}
                        {turn.catalog.documents?.length ? (
                          <div className={styles.catalogDocuments}>
                            {turn.catalog.documents.map((document) => (
                              <a download={document.filename} href={document.relativeUrl} key={document.relativeUrl} rel="noreferrer" target="_blank">
                                <FileDown size={15} />
                                <span>{document.partCount > 1 ? "PDF " + document.partNumber + "/" + document.partCount : "Abrir PDF"}</span>
                                <small>{document.productCount + " productos"}</small>
                              </a>
                            ))}
                            <em>Generado sólo para esta sesión de prueba.</em>
                          </div>
                        ) : turn.catalog.state === "ready" ? <em>El PDF se generará con esta solicitud.</em> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}

            {busy ? (
              <article className={styles.typing}>
                <LoaderCircle size={15} />
                <span>Super Bot está comprobando reglas, catálogo y evidencia…</span>
              </article>
            ) : null}
            <div ref={endRef} />
          </div>

          {notice ? (
            <p className={styles.notice} data-state={connection === "rejected" ? "error" : "info"} role="status">
              <CircleAlert size={15} />
              {notice}
            </p>
          ) : null}

          <form className={styles.composer} onSubmit={submit}>
            <div className={styles.composerHeading}>
              <label htmlFor="simulator-message">Mensaje del cliente</label>
              {activeScenarioMeta ? <span>{"Esperado: " + activeScenarioMeta.expected}</span> : <span>Modo libre</span>}
            </div>
            <div>
              <textarea
                autoComplete="off"
                disabled={busy}
                id="simulator-message"
                maxLength={600}
                onChange={(event) => {
                  const nextMessage = event.target.value;
                  const selectedScenario = activeScenario ? scenarios.find((scenario) => scenario.id === activeScenario) : null;
                  if (selectedScenario && nextMessage !== selectedScenario.prompt) {
                    setActiveScenario(null);
                    setScenarioStates((current) => ({
                      ...current,
                      [selectedScenario.id]: current[selectedScenario.id] === "selected" ? "idle" : current[selectedScenario.id],
                    }));
                  }
                  setMessage(nextMessage);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Escribe aquí la consulta que haría un cliente…"
                ref={composerRef}
                rows={3}
                value={message}
              />
              <button aria-label="Ejecutar prueba" disabled={busy || !message.trim()} type="submit">
                <Send size={17} />
                <span>Probar</span>
              </button>
            </div>
            <small>Una prueba usa una llamada real de OpenAI. No activa canales, no crea borradores y no envía mensajes.</small>
          </form>
        </section>

        <aside className={styles.evidenceRail} aria-label="Evidencia de la prueba">
          <header>
            <div className={styles.evidenceIcon}><ImageIcon size={17} /></div>
            <div>
              <span>Evidencia</span>
              <h2>Lo que se detectó</h2>
            </div>
          </header>

          {!latestAssistantTurn ? (
            <div className={styles.evidenceEmpty}>
              <span>01</span>
              <p>Cuando llegue una respuesta, aquí verás si aportó foto, opciones, imagen de pago o PDF.</p>
            </div>
          ) : (
            <>
              <div
                className={styles.runResult}
                data-state={lastRun?.scenarioId && scenarioStates[lastRun.scenarioId] === "evidence" ? "evidence" : "review"}
              >
                <span>{lastRun?.scenarioId ? scenarios.find((scenario) => scenario.id === lastRun.scenarioId)?.label : "Modo libre"}</span>
                <strong>
                  {lastRun?.scenarioId && scenarioStates[lastRun.scenarioId] === "evidence" ? "Evidencia detectada" : "Revisión necesaria"}
                </strong>
                {lastRun ? <small><Clock size={12} />{formatDuration(lastRun.durationMs)}</small> : null}
              </div>

              <div className={styles.evidenceList}>
                <div data-active={Boolean(latestAssistantTurn.product) || undefined}>
                  <Package size={15} />
                  <span>Producto</span>
                  <strong>{latestAssistantTurn.product ? latestAssistantTurn.product.code : "Sin tarjeta"}</strong>
                </div>
                <div data-active={Boolean(latestAssistantTurn.recommendations?.length) || undefined}>
                  <Sparkles size={15} />
                  <span>Opciones</span>
                  <strong>{latestAssistantTurn.recommendations?.length ? latestAssistantTurn.recommendations.length + " visuales" : "Sin opciones"}</strong>
                </div>
                <div data-active={Boolean(latestAssistantTurn.payment) || undefined}>
                  <Landmark size={15} />
                  <span>Pago</span>
                  <strong>{latestAssistantTurn.payment ? "Imagen oficial" : "Sin imagen"}</strong>
                </div>
                <div data-active={Boolean(latestAssistantTurn.catalog?.documents?.length) || undefined}>
                  <FileDown size={15} />
                  <span>Catálogo</span>
                  <strong>{latestAssistantTurn.catalog?.documents?.length ? latestAssistantTurn.catalog.documents.length + " PDF" : "Sin PDF"}</strong>
                </div>
                <div data-active={isHumanHandoff(latestAssistantTurn.text) || undefined}>
                  <ShieldCheck size={15} />
                  <span>Humano</span>
                  <strong>{isHumanHandoff(latestAssistantTurn.text) ? "Derivado" : "No aplica"}</strong>
                </div>
              </div>
            </>
          )}

          <div className={styles.evidenceFooter}>
            <span>Motor</span>
            <strong>{lastRun?.providerUsed ? "OpenAI real" : model || "Verificando"}</strong>
            <small>El estado es evidencia técnica; revisa el contenido antes de aprobarlo para clientes.</small>
          </div>
        </aside>
      </section>
    </main>
  );
}
