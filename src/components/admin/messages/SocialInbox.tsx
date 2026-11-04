"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dedupeSocialMessages, type SocialChannel, type SocialMessage } from "@/lib/social-inbox";
import { ArrowLeft, RefreshCw, MessageCircle } from "lucide-react";
import { MessageInput } from "./MessageInput";
import { DynamicAvatar } from "./ConversationItem";
import { DocumentAttachment } from "./DocumentAttachment";
import styles from "./SocialInbox.module.css";

type Conversation = { id: string; name: string; preview: string; botEnabled: boolean };
type Page<T> = { data: T[]; nextCursor: string | null };
async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo actualizar la bandeja.");
  return body as T;
}

export function SocialInbox({ channel, authorizationUrl, configured }: { channel: SocialChannel; authorizationUrl: string; configured: boolean }) {
  const title = channel === "messenger" ? "Messenger de Facebook" : "TikTok";
  const base = `/api/admin/social/${channel}`;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const listQuery = useRef<string | null>(null);
  const loadedMore = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reactivatingBot, setReactivatingBot] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [authorizedAccounts, setAuthorizedAccounts] = useState<number | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState(0);
  const selectedId = useRef<string | null>(null);
  const sendLock = useRef(false);
  const sendQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSendCount = useRef(0);
  useEffect(() => { const timer = setTimeout(() => setKeyword(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { if (followBottom.current) bottom.current?.scrollIntoView({ block: "end" }); }, [messages]);
  const refresh = useCallback(async () => {
    if (listQuery.current !== keyword) loadedMore.current = false;
    listQuery.current = keyword;
    try {
      const [page, status] = await Promise.all([get<Page<Conversation>>(`${base}?keyword=${encodeURIComponent(keyword)}`), get<{ authorizedAccounts: number; connectedAccounts: number }>(`${base}?status=1`)]);
      if (listQuery.current !== keyword) return;
      setAuthorizedAccounts(status.authorizedAccounts); setConnectedAccounts(status.connectedAccounts);
      setConversations(previous => loadedMore.current ? [...new Map([...page.data, ...previous.filter(c => !page.data.some(fresh => fresh.id === c.id))].map(c => [c.id, c])).values()] : page.data);
      if (!loadedMore.current) setCursor(page.nextCursor);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [base, keyword]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refresh]);
  const loadMessages = useCallback(async (id: string, older?: string, initial = false) => {
    const page = await get<Page<SocialMessage> & { botEnabled: boolean }>(`${base}?conversationId=${id}${older ? `&cursor=${encodeURIComponent(older)}` : ""}`);
    if (selectedId.current !== id) return;
    setSelected(current => current?.id === id ? { ...current, botEnabled: page.botEnabled } : current);
    setMessages(previous => {
      const visibleMessages = page.data.filter(message => !message.systemEvent);
      // Messenger returns an API acknowledgement first and later its webhook
      // echo. They use different row ids but share sourceId, so dedupe after
      // merging with earlier refreshes as well as within this page.
      return dedupeSocialMessages([...previous, ...visibleMessages])
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    });
    if (older || initial) setMessageCursor(page.nextCursor);
  }, [base]);
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => { if (!document.hidden && !sendLock.current) void loadMessages(selected.id).catch(e => setError(e.message)); }, 10000);
    return () => clearInterval(timer);
  }, [selected, loadMessages]);
  async function select(conversation: Conversation) {
    selectedId.current = conversation.id; setSelected(conversation); setMessages([]); setMessageCursor(null); followBottom.current = true; setUncertain(false); setReactivatingBot(false); setMessageLoading(true); setError("");
    try { await loadMessages(conversation.id, undefined, true); } catch (e) { setError((e as Error).message); }
    finally { if (selectedId.current === conversation.id) setMessageLoading(false); }
  }
  async function send(text: string, mediaFileId?: string) {
    if (!selected || (!text.trim() && !mediaFileId) || uncertain) throw new Error("Revisa la conversación antes de enviar.");
    // MessageInput normally remains busy, but this synchronous guard also
    // closes the tiny window before React has painted the disabled composer.
    if (sendLock.current) return sendQueue.current;
    const id = selected.id;
    const requestId = crypto.randomUUID();
    const pendingId = `pending:${requestId}`;
    const optimisticMessage: SocialMessage = {
      id: pendingId, text: text.trim() || "Archivo adjunto", createdAt: new Date().toISOString(),
      contactInboxId: "", messageType: "outgoing", deletedAt: null, sendError: null,
    };
    const replacePendingMessage = (message: SocialMessage) => {
      if (selectedId.current !== id) return;
      setMessages(current => {
        const next = current.map(item => item.id === pendingId ? message : item);
        // A provider acknowledgement and its echo can have the same id. Keep
        // only the confirmed delivery so a fast double-click never shows twice.
        return [...new Map(next.map(item => [item.id, item])).values()]
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      });
    };

    followBottom.current = true;
    setError("");
    setMessages(current => [...current, optimisticMessage]);
    pendingSendCount.current += 1;
    sendLock.current = true;
    setSending(true);

    const operation = async () => {
      let definitiveFailure = false;
      try {
        const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: id, text: text.trim(), mediaFileId, requestId }) });
        const result = await response.json().catch(() => ({})) as { error?: string; message?: SocialMessage };
        if (!response.ok) {
          definitiveFailure = response.status < 500;
          const message = result.error || "No se pudo enviar.";
          replacePendingMessage({ ...optimisticMessage, sendError: message });
          setError(message);
          if (!definitiveFailure) setUncertain(true);
          return;
        }

        const confirmed = result.message ? { ...optimisticMessage, ...result.message, sendError: null } : optimisticMessage;
        replacePendingMessage(confirmed);
        setSelected(current => current?.id === id ? { ...current, botEnabled: false } : current);
        // Reconcile in the background. The acknowledgement has already made
        // the reply visible, so this must never hold up the composer.
        void loadMessages(id).catch(error => setError((error as Error).message));
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo confirmar el envío.";
        replacePendingMessage({ ...optimisticMessage, sendError: message });
        setError(message);
        if (!definitiveFailure) setUncertain(true);
      }
    };

    const queued = sendQueue.current.catch(() => undefined).then(operation);
    sendQueue.current = queued;
    try {
      await queued;
    } finally {
      pendingSendCount.current -= 1;
      if (pendingSendCount.current === 0) {
        sendLock.current = false;
        setSending(false);
      }
    }
  }
  async function reactivateSuperBot() {
    if (!selected || channel !== "messenger" || selected.botEnabled || reactivatingBot) return;
    const id = selected.id;
    setReactivatingBot(true);
    setError("");
    try {
      const response = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, requestId: crypto.randomUUID() }),
      });
      const result = await response.json().catch(() => ({})) as { botEnabled?: boolean; error?: string };
      if (!response.ok || result.botEnabled !== true) {
        throw new Error(result.error || "No se pudo reactivar Super Bot.");
      }
      if (selectedId.current !== id) return;
      setSelected(current => current?.id === id ? { ...current, botEnabled: true } : current);
      setConversations(current => current.map(conversation => conversation.id === id ? { ...conversation, botEnabled: true } : conversation));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo reactivar Super Bot.");
    } finally {
      setReactivatingBot(false);
    }
  }
  async function upload(file: File) {
    if (!selected) throw new Error("Selecciona una conversación.");
    setUploading(true);
    try {
    const form = new FormData(); form.append("file", file); form.append("conversationId", selected.id);
    const response = await fetch(`${base}/uploads`, { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo cargar el archivo.");
    return result.mediaFileId as string;
    } finally { setUploading(false); }
  }
  return <div className="messages-inbox-page">
    <header className="messages-page-header"><div><p className="eyebrow">Centro de Mensajes</p><h1>{title}</h1></div>
      <div className={styles.connection}><span className="messages-live-indicator"><i aria-hidden="true" />{authorizedAccounts === null ? "Comprobando conexión…" : connectedAccounts > 0 ? `${connectedAccounts} cuenta conectada` : "Sin conexión"}</span><a className="btn btn-outline" href={authorizationUrl} target="_blank" rel="noopener noreferrer">{authorizedAccounts ? "Administrar cuentas" : "Vincular cuenta"}</a></div>
    </header>
    {authorizedAccounts !== null && !connectedAccounts && <p className={styles.notice}>{configured ? "Vincula tu cuenta o revisa su autorización para recibir y responder mensajes." : "La conexión del servidor está pendiente de configuración."}</p>}
    <div className="messages-inbox-workspace"><div className={`messages-workspace ${selected ? "chat-open" : ""}`}>
      {error && <div className="messages-workspace-alert" role="alert"><span>{error}</span><button className="icon-btn" aria-label="Cerrar aviso" onClick={() => setError("")}>×</button></div>}
      <aside className="messages-sidebar" aria-label="Conversaciones">
        <div className="messages-sidebar-header"><div className={styles.toolbar}><strong>Conversaciones</strong><button className="icon-btn" aria-label="Actualizar conversaciones" onClick={() => void refresh()}><RefreshCw size={17} /></button></div><input className="messages-search" aria-label="Buscar conversaciones" placeholder="Buscar cliente…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="messages-list">
          {loading ? <p className="messages-list-loader">Cargando…</p> : conversations.length === 0 ? <p className="messages-list-hint">No hay conversaciones para esta búsqueda.</p> : conversations.map(c => <button key={c.id} disabled={sending || uploading || reactivatingBot} aria-pressed={selected?.id === c.id} onClick={() => void select(c)} className={`conversation-item ${selected?.id === c.id ? "active" : ""}`}><div className="conversation-avatar"><DynamicAvatar name={c.name} /></div><div className="conversation-info"><div className="conversation-header"><strong className="conversation-name">{c.name}</strong></div><div className="conversation-preview"><span className="conversation-last-msg">{c.preview}</span></div><span className="conversation-owner">{channel === "messenger" ? `Messenger · ${c.botEnabled ? "Super Bot" : "Asesor"}` : c.botEnabled ? "Bot activo" : "Asesor"}</span></div></button>)}
          {cursor && <button className="messages-load-older" onClick={async () => { const query = keyword; try { const page = await get<Page<Conversation>>(`${base}?keyword=${encodeURIComponent(query)}&cursor=${encodeURIComponent(cursor)}`); if (listQuery.current !== query) return; loadedMore.current = true; setConversations(old => [...new Map([...old, ...page.data].map(c => [c.id, c])).values()]); setCursor(page.nextCursor); } catch (e) { setError((e as Error).message); } }}>Ver más conversaciones</button>}
        </div>
      </aside>
      <section className="messages-main" aria-label="Mensajes">
        {!selected ? <div className="empty-state"><MessageCircle size={64} /><h2>Centro de Mensajes</h2><p>Selecciona una conversación de {title} para responder.</p></div> : <>
          <div className="chat-header"><button className="icon-btn chat-header-back" aria-label="Volver a conversaciones" disabled={sending || uploading || reactivatingBot} onClick={() => { selectedId.current = null; setSelected(null); }}><ArrowLeft size={20} /></button><div className="chat-header-info"><div className="chat-header-avatar"><DynamicAvatar name={selected.name} /></div><div><h3 className="chat-header-name">{selected.name}</h3><div className="chat-header-meta">{title} · {selected.botEnabled ? "Super Bot activo" : "Atención por asesor"}</div></div></div></div>
          <div className="chat-messages" aria-live="polite" onScroll={e => { const el = e.currentTarget; followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
            {messageLoading && <p>Cargando mensajes…</p>}
            {messageCursor && <button className="messages-load-older" onClick={() => { followBottom.current = false; void loadMessages(selected.id, messageCursor).catch(e => setError(e.message)); }}>Ver mensajes anteriores</button>}
            {messages.map(m => <article key={m.id} className={`message-bubble ${m.messageType === "outgoing" ? "message-agent" : "message-customer"} ${m.sendError ? "message-failed" : ""}`}><div className="message-content"><p className={styles.messageText}>{m.deletedAt ? "Mensaje eliminado" : m.text}</p>{m.attachments?.map(a => <SocialAttachment key={a.id} file={a} />)}</div><span className="message-time">{new Date(m.createdAt).toLocaleString("es-PE")}</span>{m.sendError && <small className={styles.sendError}>{m.sendError}</small>}</article>)}
            <div ref={bottom} />
          </div>
          <div className="chat-count">{messages.length} mensajes cargados · {channel === "messenger" ? "Responde dentro de las 24 horas del último mensaje del cliente." : "La disponibilidad depende de tu cuenta de TikTok."}</div>
          {channel === "messenger" && !selected.botEnabled && <div className={styles.notice} role="status"><strong>Super Bot está pausado en esta conversación.</strong> La atención humana no lo reactiva automáticamente. <button className="btn btn-outline" type="button" disabled={!configured || sending || uploading || messageLoading || uncertain || reactivatingBot} onClick={() => void reactivateSuperBot()}>{reactivatingBot ? "Reactivando…" : "Reactivar Super Bot"}</button></div>}
          {uncertain && <p className={styles.notice}>Comprueba el envío antes de repetirlo. <button className="btn btn-outline" onClick={async () => { try { await loadMessages(selected.id); setUncertain(false); setError(""); } catch (e) { setError((e as Error).message); } }}>Revisar conversación</button></p>}
          <MessageInput key={`composer:${selected.id}`} disabled={sending || uploading || messageLoading || uncertain || reactivatingBot} onSendMessage={send} onUploadFile={upload} maxFileSizeMB={5} maxLength={1000} attachmentsEnabled={channel === "messenger"} accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
          <div className={styles.help}>{channel === "messenger" ? "Adjunta imágenes, PDF, documentos, videos o audio (hasta 5 MB). " : ""}Al responder se pausa la automatización de esta conversación.</div>
        </>}
      </section>
    </div></div>
  </div>;
}

function SocialAttachment({ file }: { file: NonNullable<SocialMessage["attachments"]>[number] }) {
  if (!file.url) return <span>El proveedor no entregó un enlace descargable para este adjunto.</span>;
  const type = file.fileType?.toLowerCase() || file.mimeType?.split("/")[0];
  if (type === "image") return <a href={file.url} target="_blank" rel="noopener noreferrer" className={styles.image}>{/* Provider media uses signed remote URLs. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={file.url} alt={file.name || "Imagen adjunta"} loading="lazy" /></a>;
  if (type === "audio") return <audio className={styles.media} controls preload="none" src={file.url} />;
  if (type === "video") return <video className={styles.media} controls preload="metadata" src={file.url} />;
  return <DocumentAttachment src={file.url} originalUrl={file.url} metadata={{ filename: file.name }} />;
}
