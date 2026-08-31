import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Paperclip, Smile, Send } from "lucide-react";

interface Props {
  onSendMessage: (content: string) => Promise<void> | void;
}

export function MessageInput({ onSendMessage }: Props) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <button className="icon-btn" title="Adjuntar" type="button">
          <Paperclip size={18} />
        </button>
        
        <textarea 
          className="chat-input-textarea" 
          placeholder="Escribe un mensaje..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        
        <div className="chat-input-actions">
          <button className="icon-btn" title="Emoji" type="button">
            <Smile size={18} />
          </button>
          <button 
            className="icon-btn" 
            style={{ color: message.trim() ? 'var(--primary)' : 'var(--text-muted)' }}
            onClick={handleSend}
            disabled={!message.trim()}
            title="Enviar"
            type="button"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
        Presiona Enter para enviar, Shift + Enter para salto de línea.
      </div>
    </div>
  );
}
