import { useState } from "react";
import { Expand, X, ChevronDown, Reply } from "lucide-react";
import { readMessageReply } from "@/lib/message-reply";
import type { ChatMessage } from "@/types/messages";
import { DocumentAttachment } from "./DocumentAttachment";
import { ycloudMediaKind } from "@/lib/ycloud-media";

interface Props { message: ChatMessage; onRetry?: (message: ChatMessage) => void; onReply?: (message: ChatMessage) => void; }

function getMediaSource(message: ChatMessage) {
  return message.mediaUrl && (() => {
    try { return ycloudMediaKind(message.mediaUrl) ? `/api/admin/messages/${encodeURIComponent(message.id)}/media` : message.mediaUrl; }
    catch { return message.mediaUrl; }
  })();
}

function MediaAttachment({ message, onOpen }: { message: ChatMessage; onOpen: () => void }) {
  const src = getMediaSource(message);
  const label = message.messageType === "VIDEO" ? "Video" : message.messageType === "AUDIO" ? "Audio" : "Documento";
  if (!src) return <span className="message-media-unavailable">{label} recibido. Archivo no disponible.</span>;
  if (message.messageType === "VIDEO") return <div className="message-media-attachment"><video controls preload="metadata" src={src}>Tu navegador no permite reproducir este video.</video><button className="message-media-open" onClick={onOpen} type="button"><Expand size={14} /> Ver video</button>{message.content && !/^video recibido$/i.test(message.content.trim()) ? <span>{message.content}</span> : null}</div>;
  if (message.messageType === "AUDIO") return <div className="message-media-attachment"><audio controls preload="metadata" src={src}>Tu navegador no permite reproducir este audio.</audio><button className="message-media-open" onClick={onOpen} type="button"><Expand size={14} /> Abrir audio</button></div>;
  return <DocumentAttachment key={src} src={src} originalUrl={message.mediaUrl || src} caption={message.content} metadata={message.metadata} />;
}

export function MessageBubble({ message, onRetry, onReply }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reply = readMessageReply(message.metadata);
  const canReply = Boolean(onReply && message.senderType === "CUSTOMER" && message.externalMessageId?.startsWith("wamid."));
  const [isMediaOpen, setIsMediaOpen] = useState(false);
  const isCustomer = message.senderType === "CUSTOMER";
  const isBot = message.senderType === "BOT";
  const isAgent = message.senderType === "AGENT";
  const isSending = message.status === "sending" || message.status === "pending";
  const isFailed = message.status === "failed";
  const failureReason = isFailed && message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata) ? String((message.metadata as Record<string, unknown>).error || "No se pudo enviar el mensaje.") : null;
  const mediaSource = getMediaSource(message);
  const bubbleClass = isAgent ? "message-agent" : isBot ? "message-bot" : "message-customer";
  const senderName = isCustomer ? "Cliente" : isBot ? "Bot" : "Asesor";
  const dateObj = new Date(message.createdAt);
  const timeStr = dateObj.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true });
  const isTextLike = message.messageType === "TEXT" || message.messageType === "UNKNOWN";

  return <div className={`message-bubble ${bubbleClass} ${isFailed ? "message-failed" : ""}`} onClick={(event) => {
    if (canReply && !(event.target as HTMLElement).closest("button, a, audio, video, [role=dialog]")) setMenuOpen(!menuOpen);
  }}>
    {canReply ? <div className="message-reply-actions" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
      <button type="button" className="message-options-toggle" aria-label="Opciones del mensaje" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><ChevronDown size={16} /></button>
      {menuOpen ? <button className="message-reply-option" type="button" onClick={() => { onReply?.(message); setMenuOpen(false); }}><Reply size={16} /> Responder</button> : null}
    </div> : null}
    <div className="message-sender">{senderName} {isBot ? <span className="message-bot-badge">🤖 Rocky</span> : null}</div>
    {reply ? <div className="message-quoted-reply"><strong>{reply.senderType === "CUSTOMER" ? "Cliente" : "Asesor"}</strong><span>{reply.content}</span></div> : null}
    <div className="message-content">
      {isTextLike ? <span>{message.content}</span> : null}
      {message.messageType === "IMAGE" && mediaSource ? <div className="message-media-attachment"><button className="message-image-preview" onClick={() => setIsMediaOpen(true)} type="button"><img alt={message.content || "Imagen enviada"} src={mediaSource} /><span><Expand size={16} /> Ampliar imagen</span></button>{message.content ? <span>{message.content}</span> : null}</div> : null}
      {message.messageType === "IMAGE" && !mediaSource ? <span className="message-media-unavailable">Imagen sin URL disponible</span> : null}
      {["VIDEO", "AUDIO", "DOCUMENT"].includes(message.messageType) ? <MediaAttachment message={message} onOpen={() => setIsMediaOpen(true)} /> : null}
    </div>
    <span className="message-time">{timeStr}</span>
    {(isAgent || isBot) && message.status === "accepted" ? <span className="message-delivery-status">Aceptado; entrega no confirmada.</span> : null}
    {message.status === "queued" ? <span className="message-sending-status">En cola; todavía no enviado.</span> : null}
    {message.status === "cancelled" ? <span className="message-delivery-status">Cancelado; no se envió.</span> : null}
    {message.status === "uncertain" ? <span className="message-failure-status">Entrega sin confirmar. Revisa WhatsApp antes de volver a enviar.</span> : null}
    {isSending ? <span className="message-sending-status">Enviando...</span> : null}
    {isFailed ? <span className="message-failure-status">{failureReason}</span> : null}
    {isFailed && onRetry ? <button className="message-retry" onClick={() => onRetry(message)} type="button">Reintentar</button> : null}
    {isMediaOpen && mediaSource ? <div aria-label="Vista ampliada del archivo" aria-modal="true" className="message-media-modal" onClick={() => setIsMediaOpen(false)} role="dialog"><div className="message-media-modal-content" onClick={(event) => event.stopPropagation()}><button aria-label="Cerrar vista ampliada" className="message-media-close" onClick={() => setIsMediaOpen(false)} type="button"><X size={20} /></button>{message.messageType === "IMAGE" ? <img alt={message.content || "Imagen enviada"} src={mediaSource} /> : null}{message.messageType === "VIDEO" ? <video autoPlay controls src={mediaSource}>Tu navegador no permite reproducir este video.</video> : null}{message.messageType === "AUDIO" ? <audio autoPlay controls src={mediaSource}>Tu navegador no permite reproducir este audio.</audio> : null}{message.messageType === "DOCUMENT" ? <a href={mediaSource} rel="noreferrer" target="_blank">Abrir documento en otra pestaña</a> : null}</div></div> : null}
  </div>;
}
