import type { Conversation } from "@/types/messages";
import { useState } from "react";
import { ConversationStatus } from "./ConversationStatus";
import { ArrowLeft, UserPlus, StopCircle, PlayCircle, CheckCircle } from "lucide-react";
import { DynamicAvatar } from "./ConversationItem";

interface Props {
  conversation: Conversation;
  onToggleBot: () => void;
  onTakeConversation: () => void;
  onCloseConversation: () => void;
  onBack: () => void;
}

export function ChatHeader({ conversation, onToggleBot, onTakeConversation, onCloseConversation, onBack }: Props) {
  const { contact, botEnabled } = conversation;
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div className="chat-header" data-actions-open={actionsOpen}>
      <button aria-label="Volver a conversaciones" className="icon-btn chat-header-back" onClick={onBack} type="button">
        <ArrowLeft size={20} />
      </button>
      <div className="chat-header-info">
        <div style={{ width: '40px', height: '40px', marginRight: '12px' }}>
          {contact.avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img 
              alt={contact.name} 
              src={contact.avatar} 
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
            />
          ) : (
            <DynamicAvatar name={contact.name} />
          )}
        </div>
        <div>
          <h3 className="chat-header-name">{contact.name}</h3>
          <div className="chat-header-meta">
            <span>{contact.phone || contact.phoneNormalized || 'Sin teléfono'}</span>
          </div>
        </div>
      </div>
      
      <ConversationStatus conversation={conversation} />
      
      <button className="messages-mobile-actions-toggle" type="button" aria-expanded={actionsOpen} aria-controls="chat-conversation-actions" onClick={() => setActionsOpen(!actionsOpen)}>Acciones</button>
      <div className="chat-header-actions" id="chat-conversation-actions">
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
        
        <button aria-label="Cerrar conversación" className="btn btn-outline chat-header-close" onClick={onCloseConversation} title="Cerrar conversación" type="button">
          <CheckCircle size={14} />
        </button>
      </div>
    </div>
  );
}
