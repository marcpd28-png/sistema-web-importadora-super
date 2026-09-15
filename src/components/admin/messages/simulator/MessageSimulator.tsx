"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Bug, RefreshCw, Send, UserRound } from "lucide-react";
import type { ChatMessage } from "@/types/messages";

type SimulatorResponse = {
  automationError: string | null;
  automationExecutionId: string | null;
  automationName: string | null;
  automationTriggered: boolean;
  conversationId: string;
  customerMessageId: string | null;
  pendingSince: string;
  messages: ChatMessage[];
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

export function MessageSimulator() {
  const [content, setContent] = useState("");
  const [name, setName] = useState("Cliente Simulador");
  const [phone, setPhone] = useState("+51 999 888 777");
  const [sessionKey, setSessionKey] = useState(() => createSessionKey());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingCustomerMessageId, setPendingCustomerMessageId] = useState<string | null>(null);
  const [pendingSince, setPendingSince] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingForN8n, setWaitingForN8n] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const canSend = content.trim().length > 0 && !busy;
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
        } else if (attempts >= 15) {
          setWaitingForN8n(false);
          setNotice("n8n fue disparado, pero no guardó una respuesta visible en 30 segundos.");
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
    if (!canSend) {
      return;
    }

    const message = content.trim();
    setContent("");
    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/conversations/simulate", {
        body: JSON.stringify({
          content: message,
          name,
          phone,
          sessionKey,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const payload = (await response.json()) as Partial<SimulatorResponse> & { error?: string };
      if (!response.ok || !payload.messages) {
        throw new Error(payload.error || "No se pudo simular el mensaje.");
      }

      setMessages(payload.messages);
      setConversationId(payload.conversationId ?? null);
      setPendingCustomerMessageId(payload.customerMessageId ?? null);
      setPendingSince(payload.pendingSince ?? null);

      if (payload.automationError) {
        setWaitingForN8n(false);
        setNotice(payload.automationError);
      } else if (payload.automationTriggered) {
        setWaitingForN8n(true);
        setNotice(
          payload.automationName
            ? `Flujo real disparado: ${payload.automationName}. Esperando respuesta de n8n...`
            : "Webhook real de n8n disparado. Esperando respuesta...",
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo simular el mensaje.");
    } finally {
      setBusy(false);
    }
  }

  function handleNewSession() {
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
          <span>Cliente</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="simulator-field">
          <span>Telefono</span>
          <input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>

        <button className="btn btn-outline" onClick={handleNewSession} type="button">
          <RefreshCw size={14} />
          Nueva sesion
        </button>

        <p className="message-simulator-help">
          Esta conversacion queda aislada del inbox y solo se usa para probar n8n.
        </p>
      </aside>

      <section className="message-simulator-chat">
        <div className="message-simulator-chat-header">
          <div>
            <h2>{name || "Cliente Simulador"}</h2>
            <p>Dispara el flujo real de n8n en modo simulacion</p>
          </div>
          <span className="conversation-badge badge-automatico">
            {waitingForN8n ? "ESPERANDO N8N" : "N8N REAL"}
          </span>
        </div>

        <div className="message-simulator-messages">
          {messages.length === 0 ? (
            <div className="message-simulator-empty">
              <Bot size={44} />
              <p>Escribe una consulta como cliente para disparar el workflow real.</p>
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
                    <span>{isCustomer ? "Cliente" : isBot ? "Bot" : "Sistema"}</span>
                  </div>
                  {message.messageType === "IMAGE" && message.mediaUrl ? (
                    <div className="simulator-media-message">
                      <img alt={message.content || "Imagen enviada"} src={message.mediaUrl} />
                      {message.content ? <p>{message.content}</p> : null}
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                  <time>{formatTime(message.createdAt)}</time>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {notice ? <div className="message-simulator-notice">{notice}</div> : null}

        <form className="message-simulator-input" onSubmit={handleSubmit}>
          <textarea
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
            {busy ? "Disparando" : "Enviar a n8n"}
          </button>
        </form>
      </section>
    </div>
  );
}
