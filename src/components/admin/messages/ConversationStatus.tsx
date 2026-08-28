import { Conversation } from "@/types/messages";
import { Bot, User } from "lucide-react";

interface Props {
  conversation: Conversation;
}

export function ConversationStatus({ conversation }: Props) {
  const { botEnabled, status, assignedUser } = conversation;

  return (
    <div className="conversation-status-bar">
      <div className="status-indicator">
        {botEnabled ? (
          <>
            <Bot size={16} color="#25D366" />
            <span>Bot Automático</span>
          </>
        ) : (
          <>
            <User size={16} color="#6366F1" />
            <span>Asesor: {assignedUser?.name || 'Desconocido'}</span>
          </>
        )}
      </div>
      
      <div className="status-tags">
        <span className={`conversation-badge badge-${status.toLowerCase()}`}>
          Estado: {status.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
}
