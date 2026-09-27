"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, FlaskConical, Pause, Play, Save, TriangleAlert } from "lucide-react";
import type { RockyResult } from "@/lib/rocky/contracts";
import type { RockyReviewConversation } from "@/lib/rocky/recent-review";
import styles from "./rocky-review.module.css";

type ReplayState = { status: "pending" | "running" | "complete" | "skipped" | "failed"; result?: RockyResult; reason?: string };

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function makeReviewId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-review`;
}

export function RockyReviewWorkspace({ conversations, since, hours }: { conversations: RockyReviewConversation[]; since: string; hours: number }) {
  const [states, setStates] = useState<Record<string, ReplayState>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const reviewId = useRef(makeReviewId());
  const replayable = useMemo(() => conversations.flatMap(conversation => conversation.turns.map(turn => ({ conversation, turn }))).filter(item => item.turn.canReplay), [conversations]);
  const completed = Object.values(states).filter(state => state.status === "complete").length;
  const handoffs = Object.values(states).filter(state => state.result?.requiresHuman).length;
  const lowConfidence = Object.values(states).filter(state => state.result && state.result.confidence < 0.65).length;

  async function runReview() {
    stop.current = false;
    setRunning(true);
    setNotice(null);
    for (const { conversation, turn } of conversations.flatMap(conversation => conversation.turns.map(turn => ({ conversation, turn })))) {
      if (stop.current) break;
      if (!turn.canReplay) {
        setStates(current => ({ ...current, [turn.key]: { status: "skipped", reason: `No se reprodujo ${turn.mediaTypes.join(", ").toLowerCase()} sin el archivo original.` } }));
        continue;
      }
      setStates(current => ({ ...current, [turn.key]: { status: "running" } }));
      try {
        const response = await fetch("/api/admin/rocky/recent-review", {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(180_000),
          body: JSON.stringify({ conversationId: conversation.id, turnKey: turn.key, reviewId: reviewId.current, since }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo evaluar el turno.");
        if (payload.skipped) setStates(current => ({ ...current, [turn.key]: { status: "skipped", reason: payload.reason } }));
        else {
          setStates(current => ({ ...current, [turn.key]: { status: "complete", result: payload.result } }));
          setDrafts(current => ({ ...current, [turn.key]: payload.result.reply }));
        }
      } catch (error) {
        setStates(current => ({ ...current, [turn.key]: { status: "failed", reason: error instanceof Error ? error.message : "Error de evaluación" } }));
      }
    }
    setRunning(false);
    setNotice(stop.current ? "Evaluación pausada. Puedes continuar cuando quieras." : "Evaluación terminada. Revisa las respuestas marcadas y guarda las correcciones útiles.");
  }

  async function saveCorrection(turnKey: string, runId: string) {
    const response = await fetch("/api/admin/rocky", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "feedback", runId, humanResponse: drafts[turnKey] }) });
    setNotice(response.ok ? "Corrección guardada para revisión humana." : "No se pudo guardar la corrección.");
  }

  return <main className={styles.workspace}>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}><FlaskConical size={16} /> Laboratorio supervisado</p><h1>Evaluación de Rocky · últimas {hours} horas</h1>
        <p>Reproduce los mensajes recientes en conversaciones de prueba. No envía respuestas a clientes ni modifica las conversaciones originales.</p></div>
      <button className="btn btn-primary" disabled={running || replayable.length === 0} onClick={() => void runReview()}>{running ? <><Pause size={16} /> Analizando {completed}/{replayable.length}</> : <><Play size={16} /> {completed ? "Continuar análisis" : "Analizar con Rocky"}</>}</button>
      {running && <button className="btn btn-outline" onClick={() => { stop.current = true; }}>Pausar después de este turno</button>}
    </header>
    <section className={styles.metrics}>
      <article><strong>{conversations.length}</strong><span>conversaciones</span></article>
      <article><strong>{replayable.length}</strong><span>turnos evaluables</span></article>
      <article><strong>{completed}</strong><span>respondidos por Rocky</span></article>
      <article><strong>{lowConfidence + handoffs}</strong><span>para revisar primero</span></article>
    </section>
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    {!conversations.length && <section className={styles.empty}><Bot size={38} /><h2>No hay mensajes de clientes en esta ventana</h2><p>Actualiza la página cuando entren conversaciones nuevas.</p></section>}
    <section className={styles.conversations}>
      {conversations.map((conversation, index) => <details className={styles.conversation} key={conversation.id} open={index === 0}>
        <summary><span><strong>{conversation.contactLabel}</strong><small>{conversation.channel} · {conversation.turns.length} turno{conversation.turns.length === 1 ? "" : "s"}</small></span></summary>
        <div className={styles.turns}>{conversation.turns.map(turn => {
          const state = states[turn.key] || { status: "pending" as const };
          const result = state.result;
          return <article className={styles.turn} key={turn.key}>
            <div className={styles.turnHeading}><time>{formatTime(turn.createdAt)}</time><span className={`${styles.status} ${styles[state.status]}`}>{state.status === "complete" ? <CheckCircle2 size={14} /> : state.status === "failed" ? <TriangleAlert size={14} /> : <Bot size={14} />}{state.status === "pending" ? "Pendiente" : state.status === "running" ? "Rocky pensando" : state.status === "complete" ? "Respondido" : state.status === "skipped" ? "Revisión multimedia" : "Falló"}</span></div>
            <div className={styles.comparison}>
              <section><h3>Cliente</h3><p>{turn.customerText}</p></section>
              <section><h3>Respuesta registrada</h3><p>{turn.actualReply || "No aparece una respuesta saliente en el Centro de Mensajes."}</p></section>
              <section className={styles.rocky}><h3>Rocky en pruebas</h3>{result ? <><p>{result.reply}</p><div className={styles.evidence}><span>{result.intent}</span><span>{Math.round(result.confidence * 100)}% confianza</span><span>{result.products.map(product => product.code).join(", ") || "sin producto confirmado"}</span>{result.requiresHuman && <span>requiere asesor</span>}</div></> : <p>{state.reason || (state.status === "running" ? "Consultando catálogo, reglas y contexto…" : "Ejecuta el análisis para generar esta respuesta.")}</p>}</section>
            </div>
            {result && <div className={styles.correction}><label>Respuesta que debería dar Rocky<textarea value={drafts[turn.key] ?? result.reply} maxLength={4000} onChange={event => setDrafts(current => ({ ...current, [turn.key]: event.target.value }))} /></label>
              <button className="btn btn-outline" onClick={() => void saveCorrection(turn.key, result.rockyRequestId)} disabled={!drafts[turn.key]?.trim()}><Save size={15} /> Guardar corrección</button></div>}
          </article>;
        })}</div>
      </details>)}
    </section>
  </main>;
}
