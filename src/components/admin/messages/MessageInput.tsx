import { useState, useRef } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";
import { Paperclip, Smile, Send, Loader2 } from "lucide-react";

interface Props {
  onSendMessage: (content: string, mediaUrl?: string, type?: string) => Promise<void> | void;
}

export function MessageInput({ onSendMessage }: Props) {
  const [message, setMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiList = ["😀", "😂", "😊", "😍", "👍", "🙏", "❤️", "🔥", "🎉", "😢", "😮", "✅"];
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "documents");

      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Error al subir archivo");
        return;
      }

      const data = await res.json();
      
      let type = "DOCUMENT";
      if (file.type.startsWith("image/")) type = "IMAGE";
      else if (file.type.startsWith("video/")) type = "VIDEO";
      else if (file.type === "application/pdf") type = "DOCUMENT";
      
      const textContent = message.trim() || `Archivo adjunto: ${file.name}`;
      await onSendMessage(textContent, data.url, type);
      setMessage("");
    } catch (err) {
      console.error(err);
      alert("Error al enviar archivo");
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          onChange={handleFileChange}
          accept="image/*,video/*,application/pdf"
        />
        <button 
          className="icon-btn" 
          title="Adjuntar" 
          type="button" 
          onClick={triggerFileInput}
          disabled={isUploading}
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        
        <textarea 
          className="chat-input-textarea" 
          placeholder={isUploading ? "Subiendo archivo..." : "Escribe un mensaje..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isUploading}
          rows={1}
        />
        
        <div className="chat-input-actions">
          <button className="icon-btn" title="Emoji" type="button" disabled={isUploading}>
            <Smile size={18} />
          </button>
          <button 
            className="icon-btn" 
            style={{ color: message.trim() && !isUploading ? 'var(--primary)' : 'var(--text-muted)' }}
            onClick={handleSend}
            disabled={!message.trim() || isUploading}
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
