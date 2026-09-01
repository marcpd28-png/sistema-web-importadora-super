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
          <User size={24} />
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
