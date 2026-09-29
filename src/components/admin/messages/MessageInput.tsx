import { useState, useRef } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";
import { Paperclip, Send, Loader2 } from "lucide-react";

interface Props {
  onSendMessage: (content: string, mediaUrl?: string, type?: string) => Promise<void> | void;
}

export function MessageInput({ onSendMessage }: Props) {
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "documents");

      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as { error?: string };
        setUploadError(error.error || "No se pudo subir el archivo. Intenta nuevamente.");
        return;
      }

      const data = await res.json();
      
      let type = "DOCUMENT";
      if (file.type.startsWith("image/")) type = "IMAGE";
      else if (file.type.startsWith("video/")) type = "VIDEO";
      else if (file.type.startsWith("audio/")) type = "AUDIO";
      
      const textContent = message.trim() || `Archivo adjunto: ${file.name}`;
      await onSendMessage(textContent, data.url, type);
      setMessage("");
    } catch (err) {
      console.error(err);
      setUploadError("No se pudo enviar el archivo. Revisa tu conexión e intenta nuevamente.");
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
          accept="image/*,video/*,audio/*,application/pdf"
        />
        <button 
          aria-label="Adjuntar archivo"
          className="icon-btn" 
          title="Adjuntar" 
          type="button" 
          onClick={triggerFileInput}
          disabled={isUploading}
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        
        <textarea 
          aria-describedby="message-input-help"
          aria-label="Mensaje para el cliente"
          className="chat-input-textarea" 
          placeholder={isUploading ? "Subiendo archivo..." : "Escribe un mensaje..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isUploading}
          rows={1}
        />
        
        <div className="chat-input-actions">
          <button 
            aria-label="Enviar mensaje"
            className="icon-btn" 
            onClick={handleSend}
            disabled={!message.trim() || isUploading}
            title="Enviar"
            type="button"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      <div className="chat-input-help" id="message-input-help">
        Presiona Enter para enviar, Shift + Enter para salto de línea.
      </div>
      {uploadError ? <p className="chat-input-error" role="alert">{uploadError}</p> : null}
    </div>
  );
}
