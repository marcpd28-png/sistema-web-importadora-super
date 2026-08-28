import { Conversation } from "@/types/messages";
import { User, MessageSquare, Globe, MessageCircle } from "lucide-react";

interface Props {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationItem({ conversation, isActive, onClick }: Props) {
  const { contact, channel, unreadCount, status, botEnabled, lastMessageAt } = conversation;

  let channelIcon;
  switch (channel) {
    case "WHATSAPP": channelIcon = <MessageSquare size={12} color="#25D366" />; break;
    case "INSTAGRAM": channelIcon = <MessageCircle size={12} color="#E1306C" />; break;
    case "FACEBOOK": channelIcon = <MessageCircle size={12} color="#1877F2" />; break;
    case "TIKTOK": channelIcon = <MessageSquare size={12} color="#000000" />; break;
    case "WEB": channelIcon = <Globe size={12} color="#4B5563" />; break;
    default: channelIcon = <MessageSquare size={12} />; break;
  }

  const dateObj = lastMessageAt ? new Date(lastMessageAt) : null;
  const timeStr = dateObj 
    ? `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`
    : "";

  return (
    <div className={`conversation-item ${isActive ? "active" : ""}`} onClick={onClick}>
      <div className="conversation-avatar">
        {contact.avatar ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={contact.avatar} alt={contact.name} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
        ) : (
          <User size={24} color="#9CA3AF" />
        )}
        <div className="conversation-channel-icon">
          {channelIcon}
        </div>
      </div>
      
      <div className="conversation-info">
        <div className="conversation-header">
          <span className="conversation-name">{contact.name}</span>
          <span className="conversation-time">{timeStr}</span>
        </div>
        
        <div className="conversation-preview">
          {/* We might not fetch the actual last message content without a join, so leaving blank or finding an alternative */}
          <span className="conversation-last-msg" style={{ color: '#6B7280', fontSize: '12px' }}>
            {botEnabled ? '🤖 Bot activo' : '👤 Asesor'}
          </span>
          {unreadCount > 0 && (
            <span className="conversation-unread">{unreadCount}</span>
          )}
        </div>
        
        <div className="conversation-tags">
          <span className={`conversation-badge badge-${status.toLowerCase()}`}>
            {status.replace('_', ' ')}
          </span>
        </div>
      </div>
    </div>
  );
}
