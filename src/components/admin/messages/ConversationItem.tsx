import type { Conversation } from "@/types/messages";
import { Bot, Globe, MessageSquare, User, UserRound } from "lucide-react";

interface Props {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  AUDIO: "Audio",
  CONTACT: "Contacto",
  DOCUMENT: "Documento",
  IMAGE: "Imagen",
  LOCATION: "Ubicación",
  VIDEO: "Video",
};

function formatConversationTime(value: Conversation["lastMessageAt"]) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}

function getPreview(conversation: Conversation) {
  const lastMessage = conversation.lastMessage;

  if (!lastMessage) {
    return conversation.botEnabled ? "Bot activo" : "Asesor";
  }

  const content =
    lastMessage.messageType === "TEXT" || lastMessage.messageType === "UNKNOWN"
      ? lastMessage.content
      : MESSAGE_TYPE_LABELS[lastMessage.messageType] ?? "Mensaje";

  if (lastMessage.senderType === "AGENT") {
    return `Asesor: ${content}`;
  }

  if (lastMessage.senderType === "BOT") {
    return `Bot: ${content}`;
  }

  return content;
}

export function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name: string) {
  if (!name) return "#64748b";
  const colors = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function DynamicAvatar({ name }: { name: string }) {
  return (
    <div 
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        backgroundColor: getAvatarColor(name),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '16px'
      }}
    >
      {getInitials(name)}
    </div>
  );
}

export function ConversationItem({ conversation, isActive, onClick }: Props) {
  const { contact, channel, unreadCount, status, botEnabled, lastMessageAt } = conversation;
  const ChannelIcon = channel === "WEB" ? Globe : MessageSquare;
  const OwnerIcon = botEnabled ? Bot : UserRound;

  return (
    <button className={`conversation-item ${isActive ? "active" : ""}`} onClick={onClick} type="button">
      <div className="conversation-avatar">
        {contact.avatar ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img alt={contact.name} className="conversation-avatar-img" src={contact.avatar} />
        ) : (
          <DynamicAvatar name={contact.name} />
        )}
        <div className="conversation-channel-icon">
          <ChannelIcon size={12} />
        </div>
      </div>

      <div className="conversation-info">
        <div className="conversation-header">
          <span className="conversation-name">{contact.name}</span>
          <span className="conversation-time">{formatConversationTime(lastMessageAt)}</span>
        </div>

        <div className="conversation-phone">{contact.phone || contact.phoneNormalized || "Sin teléfono"}</div>

        <div className="conversation-preview">
          <span className="conversation-last-msg">{getPreview(conversation)}</span>
          {unreadCount > 0 ? <span className="conversation-unread">{unreadCount}</span> : null}
        </div>

        <div className="conversation-tags">
          <span className={`conversation-badge badge-${status.toLowerCase()}`}>{status.replace("_", " ")}</span>
          <span className="conversation-owner">
            <OwnerIcon size={11} />
            {botEnabled ? "Bot" : "Asesor"}
          </span>
        </div>
      </div>
    </button>
  );
}
