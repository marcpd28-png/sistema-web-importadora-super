import type { ChatMessage } from "@/types/messages";

interface Props {
  message: ChatMessage;
  onRetry?: (message: ChatMessage) => void;
}

function MediaAttachment({ message }: { message: ChatMessage }) {
  const src = message.mediaUrl;
  const label = message.messageType === "VIDEO" ? "Video" : message.messageType === "AUDIO" ? "Audio" : "Documento";
  if (!src) return <span style={{ fontSize: "13px", fontStyle: "italic", opacity: 0.8 }}>{label} recibido. Archivo no disponible.</span>;

  if (message.messageType === "VIDEO") return (
    <div style={{ margin: "4px 0", display: "grid", gap: "6px" }}>
      <video controls preload="metadata" src={src} style={{ borderRadius: "10px", maxHeight: "320px", maxWidth: "100%" }}>Tu navegador no permite reproducir este video.</video>
      <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: "12px", textDecoration: "underline" }}>Abrir video</a>
      {message.content && !/^video recibido$/i.test(message.content.trim()) ? <span>{message.content}</span> : null}
    </div>
  );
  if (message.messageType === "AUDIO") return (
    <div style={{ margin: "4px 0", display: "grid", gap: "6px" }}>
      <audio controls preload="metadata" src={src} style={{ maxWidth: "100%", width: "300px" }}>Tu navegador no permite reproducir este audio.</audio>
      <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: "12px", textDecoration: "underline" }}>Abrir audio</a>
    </div>
  );
  return <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: "13px", textDecoration: "underline" }}>Abrir documento adjunto</a>;
}

export function MessageBubble({ message, onRetry }: Props) {
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

  const senderName = isCustomer ? "Cliente" : isBot ? "Bot" : "Asesor";

  const dateObj = new Date(message.createdAt);
  const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

  // If it's UNKNOWN or TEXT, we just render the content as text.
  const isTextLike = message.messageType === "TEXT" || message.messageType === "UNKNOWN";

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
        {senderName} {isBot && <span style={{ marginLeft: "4px", background: "#dcfce7", color: "#15803d", padding: "2px 4px", borderRadius: "4px", fontSize: "9px" }}>🤖 n8n Auto</span>}
      </div>
      
      <div className="message-content" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
        {isTextLike && <span>{message.content}</span>}
        {message.messageType === "IMAGE" && message.mediaUrl && (
          <div style={{ margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <img
              alt={message.content || "Imagen enviada"}
              src={message.mediaUrl}
              style={{
                borderRadius: '10px',
                display: 'block',
                height: 'auto',
                maxHeight: '260px',
                maxWidth: '100%',
                objectFit: 'cover',
              }}
            />
            {message.content ? (
              <span style={{ fontSize: '13px', whiteSpace: 'pre-wrap' }}>{message.content}</span>
            ) : null}
          </div>
        )}
        {message.messageType === "IMAGE" && !message.mediaUrl && (
          <div style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontStyle: 'italic', opacity: 0.8 }}>Imagen sin URL disponible</span>
          </div>
        )}
        {["VIDEO", "AUDIO", "DOCUMENT"].includes(message.messageType) && <MediaAttachment message={message} />}
      </div>
      
      <span style={{ fontSize: '10px', color: '#667781', textAlign: 'right', marginTop: '4px' }}>
        {timeStr}
      </span>
      {isAcceptedForDelivery && <span style={{ fontSize: '10px', color: '#667781' }}>Aceptado; entrega no confirmada.</span>}
      {isSending && <span style={{ fontSize: '10px', color: '#92400e' }}>Enviando...</span>}
      {isFailed && <span style={{ fontSize: '10px', color: '#b91c1c' }}>{failureReason}</span>}
      {isFailed && onRetry && (
        <button type="button" onClick={() => onRetry(message)} style={{ alignSelf: "flex-end", color: "#b91c1c", fontSize: "11px", fontWeight: 700 }}>
          Reintentar
        </button>
      )}
    </div>
  );
}
