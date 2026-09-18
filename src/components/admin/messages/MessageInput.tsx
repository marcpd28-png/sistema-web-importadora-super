import { useState, useRef } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";
import { FileText, Paperclip, Send, Loader2, X } from "lucide-react";
import { TemplatePicker } from "./TemplatePicker";
import type { TemplateSelection } from "@/lib/message-templates";

interface Props {
  onSendMessage: (content: string, mediaUrl?: string, type?: string, template?: TemplateSelection) => Promise<boolean>;
  contact: { name?: string | null; phone?: string | null; phoneNormalized?: string | null };
}

export function MessageInput({ onSendMessage, contact }: Props) {
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [template, setTemplate] = useState<(TemplateSelection & { name: string }) | undefined>();
  const busy = isUploading || isSending;

  const handleSend = async () => {
    if (!message.trim() || busy || sendingRef.current) return;
    if (template && (/\{\{|\}\}/.test(message) || message.trim().length > 4000)) {
      setUploadError("Completa las variables y verifica que el mensaje no supere los 4000 caracteres.");
      return;
    }
    sendingRef.current = true;
    setIsSending(true);
    setShowTemplates(false);
    setUploadError(null);
    try {
      if (await onSendMessage(message.trim(), undefined, "TEXT", template)) { setMessage(""); setTemplate(undefined); }
      else setUploadError("El envío falló. Conservamos tu borrador; revisa el error del mensaje antes de reintentar.");
    } catch { setUploadError("No se pudo enviar. Tu borrador se ha conservado."); }
    finally { sendingRef.current = false; setIsSending(false); }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || busy || sendingRef.current) return;
    if (template && (/\{\{|\}\}/.test(message) || message.trim().length > 4000)) {
      setUploadError("Completa las variables y verifica el tamaño del mensaje antes de adjuntar.");
      return;
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setIsUploading(true);
    sendingRef.current = true;
    setShowTemplates(false);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "documents");
      formData.append("purpose", "message");

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
      else if (file.type === "application/pdf") type = "DOCUMENT";
      
      const textContent = message.trim() || `Archivo adjunto: ${file.name}`;
      const mediaUrl = new URL(data.url, window.location.origin).href;
      if (await onSendMessage(textContent, mediaUrl, type, template)) { setMessage(""); setTemplate(undefined); }
      else setUploadError("No se pudo enviar el archivo. Conservamos tu borrador.");
    } catch (err) {
      console.error(err);
      setUploadError("No se pudo enviar el archivo. Revisa tu conexión e intenta nuevamente.");
    } finally {
      setIsUploading(false);
      sendingRef.current = false;
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="chat-input-container">
      {showTemplates && <TemplatePicker contact={contact} hasDraft={!!message.trim()} onClose={() => setShowTemplates(false)} onSelect={(content, selection, name) => {
        setMessage(content); setTemplate({ ...selection, name }); setShowTemplates(false); setUploadError(null); textareaRef.current?.focus();
      }} />}
      {template && <div className="template-draft-label"><span>Plantilla: {template.name} · Puedes editar el texto antes de enviar.</span><button className="icon-btn" type="button" disabled={busy} aria-label="Quitar plantilla y borrar su texto" title="Quitar plantilla y borrar su texto" onClick={() => { setTemplate(undefined); setMessage(""); }}><X size={14} /></button></div>}
      <div className="chat-input-wrapper">
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          onChange={handleFileChange}
          accept="image/*,video/*,application/pdf"
        />
        <button 
          aria-label="Adjuntar archivo"
          className="icon-btn" 
          title="Adjuntar" 
          type="button" 
          onClick={triggerFileInput}
          disabled={busy}
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>
        <button aria-label="Usar plantilla" aria-expanded={showTemplates} className="icon-btn" title="Usar plantilla" type="button" disabled={busy} onClick={() => setShowTemplates((open) => !open)}><FileText size={18} /></button>
        
        <textarea 
          ref={textareaRef}
          aria-describedby="message-input-help"
          aria-label="Mensaje para el cliente"
          className="chat-input-textarea" 
          placeholder={isUploading ? "Subiendo archivo..." : "Escribe un mensaje..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          rows={1}
        />
        
        <div className="chat-input-actions">
          <button 
            aria-label="Enviar mensaje"
            className="icon-btn" 
            onClick={handleSend}
            disabled={!message.trim() || busy}
            title="Enviar"
            type="button"
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
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
