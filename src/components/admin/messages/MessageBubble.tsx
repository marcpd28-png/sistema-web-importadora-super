import { ChatMessage } from "@/types/messages";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isCustomer = message.senderType === "CUSTOMER";
  const isBot = message.senderType === "BOT";
  const isAgent = message.senderType === "AGENT";
  
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
      backgroundColor: isCustomer ? '#ffffff' : isBot ? '#f0fdf4' : '#dcf8c6', // WhatsApp-like colors
      color: '#111b21',
      border: isCustomer ? '1px solid #e5e7eb' : '1px solid transparent',
      borderTopLeftRadius: isCustomer ? '0' : '12px',
      borderTopRightRadius: isCustomer ? '12px' : '0',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: isCustomer ? '#6b7280' : '#166534', marginBottom: '2px' }}>
        {senderName}
      </div>
      
      <div className="message-content" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
        {isTextLike && <span>{message.content}</span>}
        {message.messageType === "IMAGE" && (
          <div style={{ margin: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
             <span style={{ fontSize: '16px' }}>📷</span>
             <span style={{ fontSize: '13px', fontStyle: 'italic', opacity: 0.8 }}>Imagen recibida</span>
          </div>
        )}
      </div>
      
      <span style={{ fontSize: '10px', color: '#667781', textAlign: 'right', marginTop: '4px' }}>
        {timeStr}
      </span>
    </div>
  );
}
