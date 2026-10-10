import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent, ChangeEvent, ClipboardEvent } from "react";
import { Paperclip, Send, Loader2, X } from "lucide-react";
import type { MessageReply } from "@/lib/message-reply";
import { AudioRecorder } from "./AudioRecorder";

interface Props {
  disabled?: boolean;
  maxFileSizeMB?: number;
  maxLength?: number;
  attachmentsEnabled?: boolean;
  accept?: string;
  onUploadFile?: (file: File) => Promise<string>;
  replyTo?: MessageReply | null;
  onCancelReply?: () => void;
  onSendMessage: (content: string, mediaUrl?: string, type?: string) => Promise<void> | void;
}

export function MessageInput({ onSendMessage, replyTo, onCancelReply, disabled = false, maxFileSizeMB = 25, maxLength, attachmentsEnabled = true, accept = "image/*,video/*,audio/*,application/pdf", onUploadFile }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (replyTo) textareaRef.current?.focus(); }, [replyTo]);
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const selectAttachment = (file: File) => {
    if (disabled || !attachmentsEnabled) return;
    if (!file.size || file.size > maxFileSizeMB * 1024 * 1024) {
      setUploadError(file.size ? `El archivo supera el tamaño permitido de ${maxFileSizeMB} MB.` : "El archivo está vacío.");
      return;
    }
    setUploadError(null);
    setAttachment(file);
    setPreviewUrl(file.type.startsWith("image/") || file.type.startsWith("audio/") ? URL.createObjectURL(file) : null);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) {
      for (const item of Array.from(event.clipboardData.items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    if (!files.length) return; // Preserve the browser's normal text paste.
    event.preventDefault();
    if (sendingRef.current || isRecording) return;
    if (files.length > 1) {
      setUploadError("Pega una sola imagen o archivo a la vez.");
      return;
    }
    selectAttachment(files[0]);
  };

  const handleSend = async () => {
    if (disabled || sendingRef.current || isRecording) return;
    if (attachment) {
      void uploadAndSend(attachment);
      return;
    }
    if (message.trim()) {
      sendingRef.current = true;
      setIsUploading(true);
      setUploadError(null);
      try { await onSendMessage(message.trim()); setMessage(""); }
      catch (error) { setUploadError(error instanceof Error ? error.message : "No se pudo enviar el mensaje."); }
      finally { sendingRef.current = false; setIsUploading(false); }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    selectAttachment(file);
  };

  const uploadAndSend = async (file: File) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setIsUploading(true);
    setUploadError(null);
    try {
      if (onUploadFile) {
        const mediaId = await onUploadFile(file);
        await onSendMessage(message.trim(), mediaId);
        setMessage(""); setAttachment(null); setPreviewUrl(null);
        return;
      }
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
      setAttachment(null);
      setPreviewUrl(null);
    } catch (err) {
      console.error(err);
      setUploadError(err instanceof Error ? err.message : "No se pudo enviar el archivo. Revisa tu conexión e intenta nuevamente.");
    } finally {
      sendingRef.current = false;
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="chat-input-container">
      {replyTo ? <div className="chat-reply-preview" role="status"><div className="message-quoted-reply"><strong>Respondiendo al cliente</strong><span>{replyTo.content}</span></div><button type="button" className="icon-btn" aria-label="Cancelar respuesta" onClick={onCancelReply}><X size={18} /></button></div> : null}
      {attachment ? (
        <div className="chat-input-attachment" role="group" aria-label="Archivo listo para enviar">
          {previewUrl && attachment.type.startsWith("audio/") ? <audio className="chat-audio-preview" controls src={previewUrl} aria-label="Escuchar audio antes de enviar" /> : previewUrl ? (
            // Clipboard previews use a local blob URL, not a server image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Vista previa de la imagen adjunta" />
          ) : <Paperclip size={24} aria-hidden="true" />}
          <span>{attachment.name || "Imagen pegada"}<small>Listo para enviar</small></span>
          <button type="button" className="icon-btn" aria-label="Quitar archivo adjunto" disabled={isUploading} onClick={() => { setAttachment(null); setPreviewUrl(null); setUploadError(null); }}><X size={18} /></button>
        </div>
      ) : null}
      <div className={`chat-input-wrapper${isRecording ? " is-recording" : ""}`}>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          onChange={handleFileChange}
          accept={accept}
        />
        {attachmentsEnabled && <button
          aria-label="Adjuntar archivo"
          className="icon-btn" 
          title="Adjuntar" 
          type="button" 
          onClick={triggerFileInput}
          disabled={disabled || isUploading || isRecording}
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
        </button>}
        
        <textarea 
          ref={textareaRef}
          aria-describedby="message-input-help"
          aria-label="Mensaje para el cliente"
          className="chat-input-textarea" 
          placeholder={isUploading ? "Subiendo archivo..." : "Escribe un mensaje..."}
          value={message}
          maxLength={maxLength}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isUploading || isRecording}
          rows={1}
        />
        
        <div className="chat-input-actions">
          {attachmentsEnabled && <AudioRecorder disabled={disabled || isUploading || Boolean(attachment) || Boolean(message.trim())} onRecorded={selectAttachment} onBusyChange={setIsRecording} onError={setUploadError} />}
          {!isRecording ? <button 
            aria-label="Enviar mensaje"
            className="icon-btn" 
            onClick={handleSend}
            disabled={disabled || (!message.trim() && !attachment) || isUploading || isRecording}
            title="Enviar"
            type="button"
          >
            <Send size={18} />
          </button> : null}
        </div>
      </div>
      <div className="chat-input-help" id="message-input-help">
        Puedes pegar texto o imágenes con Ctrl+V (⌘+V en Mac). Enter para enviar; Shift + Enter para salto de línea.
      </div>
      {uploadError ? <p className="chat-input-error" role="alert">{uploadError}</p> : null}
    </div>
  );
}
