export type SocialChannel = "messenger" | "tiktok";
export type SocialMessage = {
  id: string; text: string | null; createdAt: string; contactInboxId: string;
  messageType: string; deletedAt: string | null; sendError: string | null;
  attachments?: { id: string; name: string | null; url: string | null; fileType?: string; mimeType?: string }[];
};
export type SocialConversation = {
  id: string; botEnabled: boolean; contact?: { fullName: string | null } | null;
  contactInboxes: { id: string; inboxId: string; channel: string; lastIncomingMessageAt: string | null; inbox: { name: string } }[];
  messages?: SocialMessage[];
};
export type SocialPage<T> = { data: T[]; nextCursor: string | null };

export class SocialInboxError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const DEFAULT_MESSENGER_META_RESUME_MINUTES = 15;

export function messengerMetaResumeMinutes(value = process.env.MESSENGER_META_AI_RESUME_MINUTES) {
  if (value === undefined || value.trim() === "") return DEFAULT_MESSENGER_META_RESUME_MINUTES;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 10080
    ? minutes
    : DEFAULT_MESSENGER_META_RESUME_MINUTES;
}

export function parseSocialChannel(value: string): SocialChannel {
  if (value !== "messenger" && value !== "tiktok") throw new SocialInboxError("Canal no válido.", 404);
  return value;
}

export async function socialRequest<T>(path: string, body?: unknown, requestId?: string): Promise<T> {
  const token = process.env.SOCIAL_INBOX_API_TOKEN;
  if (!token) throw new SocialInboxError("La conexión de mensajería necesita configuración.", 503);
  let response: Response;
  try {
    response = await fetch(`${process.env.SOCIAL_INBOX_API_URL || "https://chatbot.tiendavirtualsuper.com/api"}/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(requestId ? { "Idempotency-Key": requestId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000),
    });
  } catch { throw new SocialInboxError(body === undefined ? "No se pudo consultar el canal. Actualiza la bandeja." : "No se pudo confirmar la operación. Revisa la conversación antes de volver a enviar.", 504); }
  if (!response.ok) {
    // Provider responses can contain configuration and tokens. Never forward them to the browser.
    throw new SocialInboxError(response.status === 401 || response.status === 403
      ? "La conexión necesita revisar sus permisos de acceso."
      : response.status === 429 ? "Hay demasiadas solicitudes. Espera unos segundos."
      : "El canal rechazó la operación. Revisa la conexión y el plazo para responder.", response.status === 429 ? 429 : 502);
  }
  return response.json() as Promise<T>;
}

export function channelInbox(conversation: SocialConversation, channel: SocialChannel) {
  const matches = conversation.contactInboxes.filter((inbox) => inbox.channel === channel);
  if (matches.length !== 1) throw new SocialInboxError("No se puede identificar una única cuenta para esta conversación.", 409);
  return matches[0];
}

export async function socialConnectionStatus(channel: SocialChannel) {
  let authorizedAccounts = 0;
  let connectedAccounts = 0;
  for (let page = 1; ; page++) {
    const inboxes = await socialRequest<{ data: { channel: string; status: string }[]; pageCount: number }>(`/inboxes?page=${page}&perPage=50`);
    for (const inbox of inboxes.data) {
      if (inbox.channel !== channel) continue;
      authorizedAccounts++;
      if (inbox.status === "connected") connectedAccounts++;
    }
    if (page >= inboxes.pageCount) break;
    if (page >= 100) throw new SocialInboxError("No se pudo comprobar todas las cuentas del canal.");
  }
  return { authorizedAccounts, connectedAccounts };
}

export async function socialConversation(id: string, channel: SocialChannel) {
  if (!/^\d+$/.test(id)) throw new SocialInboxError("Conversación no válida.", 400);
  const { data: conversation } = await socialRequest<{ data: SocialConversation }>(`/conversations/${id}`);
  const inbox = channelInbox(conversation, channel);
  return { conversation, inbox };
}

export function safeSocialMessage(message: SocialMessage): SocialMessage {
  return { id: message.id, text: message.deletedAt ? null : message.text, createdAt: message.createdAt,
    contactInboxId: message.contactInboxId, messageType: message.messageType,
    deletedAt: message.deletedAt, sendError: message.sendError
      ? /\b2018300\b/.test(message.sendError)
        ? "Facebook rechazó el envío porque otra app controla esta conversación. Revisa el enrutamiento de Messenger de la página."
        : "El canal no confirmó el envío."
      : null,
    attachments: message.deletedAt ? [] : (message.attachments || []).map((file) => ({ id: file.id, name: file.name, fileType: file.fileType, mimeType: file.mimeType,
      url: file.url && /^https:\/\//i.test(file.url) ? file.url : null })),
  };
}

export async function socialReplyInbox(channel: SocialChannel, conversationId: string) {
  const { inbox } = await socialConversation(conversationId, channel);
  const lastIncoming = inbox.lastIncomingMessageAt ? Date.parse(inbox.lastIncomingMessageAt) : NaN;
  if (channel === "messenger" && (!Number.isFinite(lastIncoming) || Date.now() - lastIncoming >= 86400000)) {
    throw new SocialInboxError("Messenger permite responder durante las 24 horas posteriores al último mensaje del cliente.", 409);
  }
  return inbox;
}

export async function sendSocialReply(channel: SocialChannel, conversationId: string, text: string, requestId: string, mediaFileId?: string) {
  if (mediaFileId && (channel !== "messenger" || !/^\d+$/.test(mediaFileId))) throw new SocialInboxError("Adjunto no válido para este canal.", 400);
  const inbox = await socialReplyInbox(channel, conversationId);
  if (channel === "messenger" && process.env.MESSENGER_CONTROL_TOKEN) {
    const { messengerControl } = await import("./messenger-control");
    await messengerControl(conversationId, { action: "manual", minutes: messengerMetaResumeMinutes(), actor: "store-reply", resumeTarget: "meta" });
  }
  await socialRequest(`/conversations/${conversationId}/disable-bot`, {}, `${requestId}:handoff`);
  const message = await socialRequest<SocialMessage>(`/conversations/${conversationId}/messages`, { ...(text ? { text } : {}), inboxId: inbox.inboxId, ...(mediaFileId ? { mediaFileId } : {}) }, requestId);
  if (!message?.id) throw new SocialInboxError("El envío no está confirmado. Revisa la conversación antes de repetirlo.");
  return safeSocialMessage(message);
}
