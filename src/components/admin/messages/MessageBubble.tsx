"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types/messages";
import { getMessageMedia, getMessageMediaSrc } from "@/lib/message-media";
import { MessageImageViewer } from "./MessageImageViewer";

interface Props {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

function MessageMedia({ type, src, content }: { type: string; src: string | null; content: string }) {
  const [failed, setFailed] = useState(false);
  const label = type === "AUDIO" ? "Audio" : type === "STICKER" ? "Sticker" : "Imagen";
  return (
    <div style={{ margin: "4px 0", display: "flex", flexDirection: "column", gap: "6px", maxWidth: "100%" }}>
      {type === "AUDIO" && <span style={{ fontSize: "12px", fontWeight: 600 }}>Audio</span>}
      {src && !failed ? type === "AUDIO" ? (
        <audio aria-label="Audio del mensaje" controls preload="none" src={src} onError={() => setFailed(true)} style={{ width: "300px", maxWidth: "100%" }}>
          Tu navegador no permite reproducir este audio.
        </audio>
      ) : (
        <MessageImageViewer
          alt={type === "STICKER" ? "Sticker" : content || "Imagen enviada"}
          src={src}
          sticker={type === "STICKER"}
          onError={() => setFailed(true)}
        />
      ) : (
        <span role="status" style={{ fontSize: "13px", color: "#667781" }}>
          {failed ? `No se pudo cargar el ${label.toLowerCase()}.` : `${label} recibido. Archivo no disponible.`}
        </span>
      )}
      {failed && src && <button type="button" onClick={() => setFailed(false)} style={{ alignSelf: "flex-start", fontSize: "12px", textDecoration: "underline" }}>Volver a cargar</button>}
      {type === "AUDIO" && src && <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: "12px", textDecoration: "underline" }}>Abrir audio</a>}
      {content && !/^(audio|sticker|imagen|image) recibido$/i.test(content.trim()) && <span style={{ fontSize: "13px" }}>{content}</span>}
    </div>
  );
}

export function MessageBubble({ message, onRetry }: Props) {
  const isExternalSync = Boolean(message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
    && (message.metadata as Record<string, unknown>).externalSync === true);
  const retryBlocked = Boolean(message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
    && (message.metadata as Record<string, unknown>).retryBlocked === true);
  const isCustomer = message.senderType === "CUSTOMER";
  const isBot = message.senderType === "BOT";
  const isAgent = message.senderType === "AGENT";
  const isSending = message.status === "sending" || message.status === "pending";
  const isFailed = message.status === "failed";
  const isAcceptedForDelivery = isAgent && message.status === "sent";
  const failureReason = isFailed && message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
    ? String((message.metadata as Record<string, unknown>).error || "No se pudo enviar el mensaje.")
    : null;
  
  let bubbleClass = "message-customer";
  if (isBot) bubbleClass = "message-bot";
  if (isAgent) bubbleClass = "message-agent";

  const senderName = isExternalSync ? (isBot ? "ManyChat · Automatización" : "ManyChat · Asesor")
    : isCustomer ? "Cliente" : isBot ? "Bot" : "Asesor";

  const dateObj = new Date(message.createdAt);
  const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

  const media = getMessageMedia(message);
  const mediaSrc = getMessageMediaSrc(message);
  const hasMediaRenderer = ["IMAGE", "AUDIO", "STICKER"].includes(media.type);

  return (
    <div className={`message-bubble ${bubbleClass}`} style={{
      maxWidth: '75%',
      padding: '8px 12px',
      borderRadius: '12px',
      fontSize: '14px',
      position: 'relative',
      alignSelf: isCustomer ? 'flex-start' : 'flex-end',
      backgroundColor: isFailed ? '#fee2e2' : isCustomer ? '#ffffff' : isBot ? '#f0fdf4' : '#dcf8c6', // WhatsApp-like colors
      color: '#111b21',
      border: isFailed ? '1px solid #fca5a5' : isCustomer ? '1px solid #e5e7eb' : '1px solid transparent',
      borderTopLeftRadius: isCustomer ? '0' : '12px',
      borderTopRightRadius: isCustomer ? '12px' : '0',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: isCustomer ? '#6b7280' : '#166534', marginBottom: '2px' }}>
        {senderName} {isBot && !isExternalSync && <span style={{ marginLeft: "4px", background: "#dcfce7", color: "#15803d", padding: "2px 4px", borderRadius: "4px", fontSize: "9px" }}>🤖 n8n Auto</span>}
      </div>
      
      <div className="message-content" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
        {hasMediaRenderer ? <MessageMedia key={mediaSrc ?? message.id} type={media.type} src={mediaSrc} content={message.content} /> : <span>{message.content || "Mensaje recibido"}</span>}
      </div>
      
      <span style={{ fontSize: '10px', color: '#667781', textAlign: 'right', marginTop: '4px' }}>
        {timeStr}
      </span>
      {isAcceptedForDelivery && <span style={{ fontSize: '10px', color: '#667781' }}>Aceptado; entrega no confirmada.</span>}
      {isSending && <span style={{ fontSize: '10px', color: '#92400e' }}>Enviando...</span>}
      {isFailed && <span style={{ fontSize: '10px', color: '#b91c1c' }}>{failureReason}</span>}
      {isFailed && onRetry && !isExternalSync && !retryBlocked && (
        <button type="button" onClick={() => onRetry(message)} style={{ alignSelf: "flex-end", color: "#b91c1c", fontSize: "11px", fontWeight: 700 }}>
          Reintentar
        </button>
      )}
    </div>
  );
}
