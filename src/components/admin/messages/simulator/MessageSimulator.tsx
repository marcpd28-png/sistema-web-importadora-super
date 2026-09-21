"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Bug, FileDown, RefreshCw, Send, UserRound } from "lucide-react";
import type { ChatMessage } from "@/types/messages";
import { SIMULATOR_MEDIA_ACCEPT, SIMULATOR_MEDIA_MAX_BYTES } from "@/lib/simulator-message";
import { sendSimulatorRequest } from "@/lib/simulator-request";
import type { RockyResult } from "@/lib/rocky/contracts";

type SimulatorResponse = {
  automationError: string | null;
  automationExecutionId: string | null;
  automationName: string | null;
  automationTriggered: boolean;
  conversationId: string;
  customerMessageId: string | null;
  pendingSince: string;
  messages: ChatMessage[];
  rocky?: RockyResult;
};

type MessagesResponse = {
  items: ChatMessage[];
  total: number;
};

function createSessionKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function linkedMessage(text: string) {
  return text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} href={part} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", overflowWrap: "anywhere" }}>{part}</a>
    : part);
}

export function MessageSimulator() {
  const [engine, setEngine] = useState<"BC" | "ROCKY">("ROCKY");
  const [rocky, setRocky] = useState<RockyResult | null>(null);
  const [feedback, setFeedback] = useState("");
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<{ type: "IMAGE" | "AUDIO"; dataUrl: string; name: string } | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const fileVersion = useRef(0);
  const [name, setName] = useState("Cliente Simulador");
  const [phone, setPhone] = useState("+51 999 888 777");
  const [sessionKey, setSessionKey] = useState(() => createSessionKey());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingCustomerMessageId, setPendingCustomerMessageId] = useState<string | null>(null);
  const [pendingSince, setPendingSince] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [waitingForN8n, setWaitingForN8n] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  const canSend = Boolean(content.trim() || attachment) && !busy && !readingFile;
  const conversationLabel = useMemo(() => phone.trim() || "sin telefono", [phone]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !waitingForN8n) {
      return undefined;
    }

    let stopped = false;
    let attempts = 0;

    async function refreshMessages() {
      attempts += 1;

      try {
        const response = await fetch(
          `/api/admin/conversations/${conversationId}/messages?limit=100&t=${Date.now()}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error("No se pudo refrescar la conversación simulada.");
        }

        const payload = (await response.json()) as MessagesResponse;
        if (stopped) {
          return;
        }

        setMessages(payload.items);

        const pendingIndex = pendingCustomerMessageId
          ? payload.items.findIndex((message) => message.id === pendingCustomerMessageId)
          : -1;
        const messagesAfterPending = pendingIndex >= 0
          ? payload.items.slice(pendingIndex + 1)
          : pendingSince
            ? payload.items.filter((message) => new Date(message.createdAt).getTime() >= new Date(pendingSince).getTime())
            : payload.items;
        const hasWorkflowReply = messagesAfterPending.some(
          (message) => message.senderType === "BOT" || message.senderType === "AGENT",
        );

        if (hasWorkflowReply) {
          setWaitingForN8n(false);
          setNotice("Respuesta recibida desde el flujo.");
        } else if (attempts >= 60) {
          setWaitingForN8n(false);
          setNotice("BC no guardó una respuesta visible en 2 minutos. Revisa la ejecución en n8n.");
        }
      } catch (error) {
        if (!stopped) {
          setWaitingForN8n(false);
          setNotice(error instanceof Error ? error.message : "No se pudo refrescar la conversación.");
        }
      }
    }

    const interval = window.setInterval(() => {
      void refreshMessages();
    }, 2000);

    void refreshMessages();

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [conversationId, pendingCustomerMessageId, pendingSince, waitingForN8n]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || activeRequest.current) {
      return;
    }

    const message = content.trim();
    const controller = new AbortController();
    activeRequest.current = controller;
    setElapsed(0);
    setBusy(true);
    setNotice(null);

    try {
      const payload = await sendSimulatorRequest<Partial<SimulatorResponse>>({
        engine, content: message, name, phone, sessionKey,
        attachment: attachment ? { type: attachment.type, dataUrl: attachment.dataUrl } : undefined,
      }, controller);
      if (controller.signal.aborted) return;
      if (!payload.messages) throw new Error("No se pudo simular el mensaje.");

      setMessages(payload.messages);
      setConversationId(payload.conversationId ?? null);
      setPendingCustomerMessageId(payload.customerMessageId ?? null);
      setPendingSince(payload.pendingSince ?? null);
      setRocky(payload.rocky ?? null);
      setFeedback(payload.rocky?.reply ?? "");

      if (payload.automationError) {
        setWaitingForN8n(false);
        setNotice(payload.automationError);
      } else if (payload.automationTriggered) {
        setContent("");
        setAttachment(null);
        setWaitingForN8n(!payload.rocky);
        setNotice(payload.rocky ? payload.rocky.requiresHuman ? "Rocky solicita atención humana. Inicia una nueva sesión para otra prueba." : "Respuesta de Rocky preparada. Puedes continuar la conversación." : "Puedes enviar más mensajes. El bot espera 12 segundos desde el último mensaje antes de preparar la respuesta.");
      }
    } catch (error) {
      setNotice(controller.signal.aborted ? "Terminó la espera. El mensaje puede haberse guardado en el servidor; inicia una nueva sesión si quieres repetir la prueba." : error instanceof Error ? error.message : "No se pudo simular el mensaje.");
    } finally {
      activeRequest.current = null;
      setBusy(false);
    }
  }

  function handleNewSession() {
    setRocky(null);
    setFeedback("");
    fileVersion.current += 1;
    setAttachment(null);
    setReadingFile(false);
    setSessionKey(createSessionKey());
    setConversationId(null);
    setPendingCustomerMessageId(null);
    setPendingSince(null);
    setMessages([]);
    setContent("");
    setWaitingForN8n(false);
    setNotice(null);
  }

  return (
    <div className="message-simulator">
      <aside className="message-simulator-panel">
        <div className="message-simulator-title">
          <div className="message-simulator-icon">
            <Bug size={20} />
          </div>
          <div>
            <h1>Simulador</h1>
            <p>{conversationLabel}</p>
          </div>
        </div>

        <label className="simulator-field">
          <span>Motor de conversación</span>
          <select value={engine} disabled={busy || waitingForN8n} onChange={event => { setEngine(event.target.value as "BC" | "ROCKY"); handleNewSession(); }}>
            <option value="BC">BC · actual</option>
            <option value="ROCKY">ROCKY · pruebas IA</option>
          </select>
        </label>

        <label className="simulator-field">
          <span>Cliente</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="simulator-field">
          <span>Telefono</span>
          <input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>

        <button className="btn btn-outline" disabled={busy} onClick={handleNewSession} type="button">
          <RefreshCw size={14} />
          Nueva sesion
        </button>

        <p className="message-simulator-help">
          {engine === "ROCKY" ? "Prueba Rocky con el catálogo real. Las respuestas se guardan solamente en esta conversación de prueba." : "Puedes escribir la consulta en varios mensajes. El bot los agrupa después de 12 segundos sin recibir otro mensaje."}
        </p>
        {rocky && <div className="message-simulator-help" aria-live="polite">
          <strong>ROCKY · {rocky.model}</strong>
          <p>Intención: {rocky.intent} · {Math.round(rocky.confidence * 100)}%</p>
          <p>Skill: {rocky.skill}</p>
          <p>Herramientas: {rocky.toolsRequested.join(", ") || "ninguna"}</p>
          <p>Productos: {rocky.products.map(p => p.code).join(", ") || "por precisar"}</p>
          <p>Fuentes: {rocky.sources.map(s => s.title).join(", ") || "catálogo / reglas internas"}</p>
          {rocky.reasonCode && <p>Motivo: {rocky.reasonCode}</p>}
          <details><summary>Corregir sugerencia</summary>
            <textarea aria-label="Respuesta corregida" value={feedback} maxLength={4000} onChange={event => setFeedback(event.target.value)} />
            <button type="button" className="btn btn-outline" onClick={async () => {
              const response = await fetch("/api/admin/rocky", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "feedback", runId: rocky.rockyRequestId, humanResponse: feedback }) });
              setNotice(response.ok ? "Corrección guardada para revisión humana." : "No se pudo guardar la corrección.");
            }}>Guardar corrección</button>
          </details>
        </div>}
      </aside>

      <section className="message-simulator-chat">
        <div className="message-simulator-chat-header">
          <div>
            <h2>{name || "Cliente Simulador"}</h2>
            <p>{engine === "ROCKY" ? "Conversación de prueba con Rocky" : "Dispara el flujo real de n8n en modo simulacion"}</p>
          </div>
          <span className="conversation-badge badge-automatico">
            {engine === "ROCKY" ? busy ? "ROCKY PENSANDO" : "ROCKY" : waitingForN8n ? "ESPERANDO N8N" : "N8N REAL"}
          </span>
        </div>

        <div className="message-simulator-messages">
          {messages.length === 0 ? (
            <div className="message-simulator-empty">
              <Bot size={44} />
              <p>{engine === "ROCKY" ? "Escribe una consulta para probar a Rocky." : "Escribe una consulta como cliente para disparar el workflow real."}</p>
            </div>
          ) : (
            messages.map((message) => {
              const isCustomer = message.senderType === "CUSTOMER";
              const isBot = message.senderType === "BOT";

              return (
                <div
                  className={`simulator-bubble ${isCustomer ? "is-customer" : "is-bot"}`}
                  key={message.id}
                >
                  <div className="simulator-bubble-meta">
                    {isCustomer ? <UserRound size={13} /> : <Bot size={13} />}
                    <span>{isCustomer ? "Cliente" : isBot ? engine === "ROCKY" ? "ROCKY" : "BC" : "Sistema"}</span>
                  </div>
                  {message.messageType === "IMAGE" && message.mediaUrl ? (
                    <div className="simulator-media-message">
                      <a href={message.mediaUrl} target="_blank" rel="noreferrer" title="Ver imagen completa">
                        <img alt={message.content || "Imagen enviada"} src={message.mediaUrl} />
                      </a>
                      {message.content ? <p>{linkedMessage(message.content)}</p> : null}
                    </div>
                  ) : message.messageType === "DOCUMENT" && message.mediaUrl ? (
                    <a className="simulator-document-message" href={message.mediaUrl} rel="noreferrer" target="_blank">
                      <FileDown size={22} />
                      <span><strong>{message.content || "Documento generado"}</strong><small>Abrir documento de prueba</small></span>
                    </a>
                  ) : message.messageType === "AUDIO" && message.mediaUrl ? (
                    <div><audio controls preload="none" src={message.mediaUrl} />{message.content ? <p>{linkedMessage(message.content)}</p> : null}</div>
                  ) : (
                    <p>{linkedMessage(message.content)}</p>
                  )}
                  <time>{formatTime(message.createdAt)}</time>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {busy && <div className="message-simulator-notice" role="status">
          {engine === "ROCKY" ? "Rocky está consultando tu mensaje" : "Enviando el mensaje al simulador"} · {elapsed} s.
          {elapsed >= 15 && " Está tardando más de lo habitual. La espera termina como máximo en 65 segundos."}
          <button type="button" className="btn btn-outline" onClick={() => activeRequest.current?.abort()}>Dejar de esperar</button>
        </div>}
        {notice ? <div className="message-simulator-notice" role="status">{notice}</div> : null}

        <label className="simulator-field">
          <span>Adjuntar foto, captura de redes o audio (hasta 4 MB)</span>
          <input type="file" accept={SIMULATOR_MEDIA_ACCEPT} disabled={busy || readingFile} onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!SIMULATOR_MEDIA_ACCEPT.split(",").includes(file.type) || file.size === 0 || file.size > SIMULATOR_MEDIA_MAX_BYTES) {
              setNotice("Selecciona una imagen JPG, PNG, WebP o un audio compatible de hasta 4 MB.");
              return;
            }
            const version = ++fileVersion.current;
            setReadingFile(true);
            try {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
                reader.readAsDataURL(file);
              });
              if (version === fileVersion.current) setAttachment({ type: file.type.startsWith("image/") ? "IMAGE" : "AUDIO", dataUrl, name: file.name });
            } catch {
              if (version === fileVersion.current) setNotice("No se pudo leer el archivo.");
            } finally {
              if (version === fileVersion.current) setReadingFile(false);
            }
          }} />
        </label>
        {attachment ? <div className="message-simulator-notice">
          {attachment.name}
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setAttachment(null)}>Quitar adjunto</button>
        </div> : null}

        <form className="message-simulator-input" onSubmit={handleSubmit}>
          <textarea
            disabled={busy}
            maxLength={1200}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Escribe como cliente..."
            rows={2}
            value={content}
          />
          <button className="btn btn-primary" disabled={!canSend} type="submit">
            <Send size={15} />
            {busy ? `Procesando · ${elapsed} s` : engine === "ROCKY" ? "Enviar a Rocky" : "Enviar a BC"}
          </button>
        </form>
      </section>
    </div>
  );
}
