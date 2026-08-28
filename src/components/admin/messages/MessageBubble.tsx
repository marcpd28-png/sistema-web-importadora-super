import { ChatMessage } from "@/types/messages";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isCustomer = message.senderType === "CUSTOMER";
  const isBot = message.senderType === "BOT";
  
  let bubbleClass = "message-customer";
  if (isBot) bubbleClass = "message-bot";
  if (message.senderType === "AGENT") bubbleClass = "message-agent";

  const senderName = isCustomer ? "Cliente" : isBot ? "Bot" : "Asesor";

  const dateObj = new Date(message.createdAt);
  const timeStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div className={`message-bubble ${bubbleClass}`}>
      <div className="message-sender">{senderName}</div>
      <div className="message-content">
        {message.messageType === "TEXT" && <p style={{ margin: 0 }}>{message.content}</p>}
        {message.messageType === "IMAGE" && (
          <div style={{ margin: '8px 0' }}>
             <span style={{ fontSize: '12px' }}>📷 Imagen adjunta</span>
          </div>
        )}
      </div>
      <span className="message-time">{timeStr}</span>
    </div>
  );
}
