import type { ChatMessage } from "@/types/messages";

interface Props {
  message: ChatMessage;
  onRetry?: (msg: ChatMessage) => void;
}

export function MessageBubble({ message, onRetry }: Props) {
  const isCustomer = message.senderType === "CUSTOMER";
  const isBot = message.senderType === "BOT";
  const isAgent = message.senderType === "AGENT";
  const isSending = message.status === "sending";
  const isFailed = message.status === "failed";
  const isUnknown = message.status === "unknown";
  
  let bubbleClass = "message-customer";
  if (isBot) bubbleClass = "message-bot";
  if (isAgent) bubbleClass = "message-agent";

  const senderName = isCustomer ? "Cliente" : isBot ? "Bot" : "Asesor";

  const dateObj = new Date(message.createdAt);
  const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

  const isTextLike = message.messageType === "TEXT" || message.messageType === "UNKNOWN";
  
  const mediaUrl = isCustomer 
    ? `/api/admin/conversations/${message.conversationId}/messages/${message.id}/media`
    : (message.mediaUrl || "");

  // Status visual indicator
  let statusIcon = "";
  if (!isCustomer) {
    if (message.status === "sending") statusIcon = "🕒";
    else if (message.status === "sent") statusIcon = "✓";
    else if (message.status === "delivered") statusIcon = "✓✓";
    else if (message.status === "read") statusIcon = "✓✓ (Leído)";
    else if (message.status === "failed") statusIcon = "⚠ Error";
    else if (message.status === "unknown") statusIcon = "⚠ Desconocido";
  }

  return (
    <div className={`message-bubble ${bubbleClass}`} style={{
      maxWidth: '75%',
      padding: '8px 12px',
      borderRadius: '12px',
      fontSize: '14px',
      position: 'relative',
      alignSelf: isCustomer ? 'flex-start' : 'flex-end',
      backgroundColor: (isFailed || isUnknown) ? '#fee2e2' : isCustomer ? '#ffffff' : isBot ? '#f0fdf4' : '#dcf8c6',
      color: '#111b21',
      border: (isFailed || isUnknown) ? '1px solid #fca5a5' : isCustomer ? '1px solid #e5e7eb' : '1px solid transparent',
      borderTopLeftRadius: isCustomer ? '0' : '12px',
      borderTopRightRadius: isCustomer ? '12px' : '0',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: isCustomer ? '#6b7280' : '#166534', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
        <span>{senderName}</span>
      </div>
      
      <div className="message-content" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
        {isTextLike && <span>{message.content}</span>}
        {message.messageType === "IMAGE" && (
          <div style={{ margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
             <img src={mediaUrl} alt="Multimedia" style={{ maxWidth: '100%', borderRadius: '8px', maxHeight: '300px', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.removeAttribute('hidden'); }} />
             <div hidden style={{ fontSize: '13px', fontStyle: 'italic', opacity: 0.8 }}>📷 Imagen adjunta (No se pudo cargar)</div>
             {message.content && <span>{message.content}</span>}
          </div>
        )}
        {message.messageType === "VIDEO" && (
          <div style={{ margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
             <video src={mediaUrl} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
             {message.content && <span>{message.content}</span>}
          </div>
        )}
        {message.messageType === "AUDIO" && (
          <div style={{ margin: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
             <audio src={mediaUrl} controls style={{ maxWidth: '100%' }} />
          </div>
        )}
        {message.messageType === "DOCUMENT" && (
          <div style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
             <a href={mediaUrl} target="_blank" rel="noreferrer" style={{ color: '#0284c7', textDecoration: 'underline' }}>📄 Descargar Documento</a>
             {message.content && <span>{message.content}</span>}
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
        <span style={{ fontSize: '10px', color: '#667781' }}>{timeStr}</span>
        {!isCustomer && <span style={{ fontSize: '10px', color: (isFailed || isUnknown) ? '#b91c1c' : '#667781', fontWeight: message.status === 'read' ? 'bold' : 'normal' }}>{statusIcon}</span>}
      </div>
      
      {isUnknown && <div style={{ fontSize: '10px', color: '#92400e', marginTop: '4px' }}>El estado del envío es desconocido. Puede haberse enviado.</div>}
      
      {(isFailed || isUnknown) && onRetry && (
        <button onClick={() => onRetry(message)} style={{ marginTop: '6px', padding: '4px 8px', fontSize: '12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', color: '#b91c1c' }}>
          Reintentar envío
        </button>
      )}
    </div>
  );
}
