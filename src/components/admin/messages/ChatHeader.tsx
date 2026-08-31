import type { Conversation } from "@/types/messages";
import { ConversationStatus } from "./ConversationStatus";
import { UserPlus, StopCircle, PlayCircle, CheckCircle } from "lucide-react";

interface Props {
  conversation: Conversation;
  onToggleBot: () => void;
  onTakeConversation: () => void;
  onCloseConversation: () => void;
}

export function ChatHeader({ conversation, onToggleBot, onTakeConversation, onCloseConversation }: Props) {
  const { contact, botEnabled } = conversation;

  return (
    <div className="chat-header">
      <div className="chat-header-info">
        <div>
          <h3 className="chat-header-name">{contact.name}</h3>
          <div className="chat-header-meta">
            <span>{contact.phone || contact.phoneNormalized || 'Sin teléfono'}</span>
          </div>
        </div>
      </div>
      
      <ConversationStatus conversation={conversation} />
      
      <div className="chat-header-actions">
        {botEnabled ? (
          <button className="btn btn-outline" onClick={onToggleBot} type="button">
            <StopCircle size={14} /> Pausar Bot
          </button>
        ) : (
          <button className="btn btn-outline" onClick={onToggleBot} type="button">
            <PlayCircle size={14} /> Activar Bot
          </button>
        )}
        
        <button className="btn btn-primary" onClick={onTakeConversation} type="button">
          <UserPlus size={14} /> Tomar
        </button>
        
        <button className="btn btn-outline" onClick={onCloseConversation} title="Cerrar conversación" type="button">
          <CheckCircle size={14} />
        </button>
      </div>
    </div>
  );
}
