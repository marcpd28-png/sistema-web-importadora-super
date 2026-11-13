export type SocialChannel = "messenger" | "tiktok";
export type SocialSystemEvent = "provider_handover";
export type SocialAttachment = {
  id: string;
  name: string | null;
  url: string | null;
  fileType?: string;
  mimeType?: string;
  // ChatbotX keeps these paths for its own storage. They are intentionally
  // never returned to the browser because they are not public download URLs.
  originPath?: string | null;
  thumbnailPath?: string | null;
};
export type SocialAttachmentKind = "image" | "audio" | "video" | "document";
export type SocialMessage = {
  id: string; text: string | null; createdAt: string; contactInboxId: string;
  messageType: string; deletedAt: string | null; sendError: string | null;
  sourceId?: string | null; senderType?: string | null; systemEvent?: SocialSystemEvent | null;
  attachments?: SocialAttachment[];
};
export type SocialConversation = {
  id: string; botEnabled: boolean;
  contact?: {
    id?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
  } | null;
  contactInboxes: {
    id: string;
    inboxId: string;
    channel: string;
    lastIncomingMessageAt: string | null;
    sourceUsername?: string | null;
    inbox: { name: string };
  }[];
  messages?: SocialMessage[];
};
type SocialProfileRefresh = {
  status?: "updated" | "skipped" | "unavailable" | "failed";
  contact?: NonNullable<SocialConversation["contact"]>;
};
export type SocialProfileSyncSummary = {
  scanned: number;
  requested: number;
  updated: number;
  skipped: number;
  unavailable: number;
  failed: number;
  nextCursor: string | null;
};
export type SocialPage<T> = { data: T[]; nextCursor: string | null };
type SocialMediaFile = {
  id: string;
  path: string;
  url: string;
  mimeType: string;
  name: string;
  size: number;
};

export class SocialInboxError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const SOCIAL_REPLY_DEDUPLICATION_MS = 10_000;
const SOCIAL_REPLY_PENDING_MS = 30_000;
const SOCIAL_ECHO_FALLBACK_MS = 15_000;
const SOCIAL_PROFILE_REFRESH_SUCCESS_COOLDOWN_MS = 30 * 60_000;
const SOCIAL_PROFILE_REFRESH_UNAVAILABLE_COOLDOWN_MS = 5 * 60_000;
const SOCIAL_PROFILE_REFRESH_FAILURE_COOLDOWN_MS = 30_000;
const MAX_SOCIAL_PROFILE_REFRESH_CACHE_ENTRIES = 1_000;
const SOCIAL_INBOX_DEFAULT_API_URL = "https://chatbot.tiendavirtualsuper.com/api";
const recentSocialReplies = new Map<string, { expiresAt: number; result: Promise<SocialMessage> }>();
type CachedSocialProfileRefresh = {
  expiresAt: number;
  status: SocialProfileRefreshResult["status"];
  contact: SocialConversation["contact"];
};
const socialProfileRefreshCache = new Map<string, CachedSocialProfileRefresh>();
const socialProfileRefreshInFlight = new Map<string, Promise<CachedSocialProfileRefresh>>();
const SOCIAL_ID_FIELDS = new Set(["id", "contactId", "contactInboxId", "inboxId"]);

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function displayText(value: string | null | undefined) {
  return typeof value === "string" ? compactText(value) : "";
}

function providerDisplayName(value: string | null | undefined) {
  const name = displayText(value);
  return name.toLocaleLowerCase("es-PE") === "cliente" ? "" : name;
}

/**
 * ChatbotX can expose a Messenger contact through separate name fields before
 * it has populated fullName. Keep the provider's identity visible instead of
 * collapsing those conversations into the same generic "Cliente" label.
 */
export function socialConversationDisplayName(conversation: SocialConversation, channel: SocialChannel) {
  const fullName = providerDisplayName(conversation.contact?.fullName);
  if (fullName) return fullName;

  const contactName = [
    providerDisplayName(conversation.contact?.firstName),
    providerDisplayName(conversation.contact?.lastName),
  ].filter(Boolean).join(" ");
  if (contactName) return contactName;

  const sourceUsername = conversation.contactInboxes
    .filter((inbox) => inbox.channel === channel)
    .map((inbox) => providerDisplayName(inbox.sourceUsername))
    .find(Boolean);
  if (sourceUsername) return sourceUsername.startsWith("@") ? sourceUsername : `@${sourceUsername}`;

  const identity = displayText(conversation.id);
  return identity ? `Cliente sin nombre · ${identity.slice(-6)}` : "Cliente sin nombre";
}

/**
 * Messenger initially creates some contacts with the placeholder "Cliente".
 * ChatbotX can then ask Facebook for the profile behind that contact inbox.
 * A username is still useful as a temporary label, but it is not a Facebook
 * display name, so it must not prevent that profile lookup.
 */
export function socialConversationNeedsProfileRefresh(conversation: SocialConversation, channel: SocialChannel) {
  if (channel !== "messenger") return false;

  return !providerDisplayName(conversation.contact?.fullName) && ![
    providerDisplayName(conversation.contact?.firstName),
    providerDisplayName(conversation.contact?.lastName),
  ].some(Boolean);
}

/**
 * Asks the connected Messenger provider to obtain the customer's current
 * Facebook name. Failures are intentionally non-fatal: a temporary Facebook
 * or provider issue must never stop the inbox itself from loading.
 */
type SocialProfileRefreshResult = {
  conversation: SocialConversation;
  status: "not_needed" | "skipped" | "updated" | "unavailable" | "failed";
};

function socialProfileRefreshKey(conversation: SocialConversation, channel: SocialChannel) {
  const contactId = displayText(conversation.contact?.id);
  const matchingInboxes = conversation.contactInboxes.filter((inbox) => inbox.channel === channel);
  if (!contactId || matchingInboxes.length !== 1 || !/^\d+$/.test(matchingInboxes[0].id)) return null;
  return `${channel}\u0000${contactId}\u0000${matchingInboxes[0].id}`;
}

function socialProfileRefreshCooldown(status: SocialProfileRefreshResult["status"]) {
  if (status === "updated") return SOCIAL_PROFILE_REFRESH_SUCCESS_COOLDOWN_MS;
  if (status === "failed") return SOCIAL_PROFILE_REFRESH_FAILURE_COOLDOWN_MS;
  return SOCIAL_PROFILE_REFRESH_UNAVAILABLE_COOLDOWN_MS;
}

function pruneSocialProfileRefreshCache(now: number) {
  for (const [key, cached] of socialProfileRefreshCache) {
    if (cached.expiresAt <= now) socialProfileRefreshCache.delete(key);
  }
  if (socialProfileRefreshCache.size < MAX_SOCIAL_PROFILE_REFRESH_CACHE_ENTRIES) return;
  for (const key of socialProfileRefreshCache.keys()) {
    socialProfileRefreshCache.delete(key);
    if (socialProfileRefreshCache.size < MAX_SOCIAL_PROFILE_REFRESH_CACHE_ENTRIES) return;
  }
}

function applyCachedSocialProfileRefresh(conversation: SocialConversation, cached: CachedSocialProfileRefresh): SocialProfileRefreshResult {
  return {
    conversation: cached.contact ? { ...conversation, contact: { ...conversation.contact, ...cached.contact } } : conversation,
    status: cached.status,
  };
}

async function refreshSocialConversationProfileResult(
  conversation: SocialConversation,
  channel: SocialChannel,
): Promise<SocialProfileRefreshResult> {
  if (!socialConversationNeedsProfileRefresh(conversation, channel)) {
    return { conversation, status: "not_needed" };
  }

  const contactId = displayText(conversation.contact?.id);
  const matchingInboxes = conversation.contactInboxes.filter((inbox) => inbox.channel === channel);
  if (!contactId || contactId.length > 200 || matchingInboxes.length !== 1 || !/^\d+$/.test(matchingInboxes[0].id)) {
    return { conversation, status: "skipped" };
  }

  try {
    const refreshed = await socialRequest<SocialProfileRefresh>(
      `/contacts/${encodeURIComponent(`id:${contactId}`)}/refresh-profile`,
      { contactInboxId: matchingInboxes[0].id },
    );
    const status = refreshed.status === "updated" || refreshed.status === "skipped" || refreshed.status === "unavailable"
      ? refreshed.status
      : "failed";
    if (status !== "updated" || !refreshed.contact) return { conversation, status };

    return {
      status,
      conversation: { ...conversation, contact: { ...conversation.contact, ...refreshed.contact } },
    };
  } catch {
    return { conversation, status: "failed" };
  }
}

export async function refreshSocialConversationProfile(conversation: SocialConversation, channel: SocialChannel) {
  return (await refreshSocialConversationProfileResult(conversation, channel)).conversation;
}

/**
 * The inbox polls for fresh conversations, while Facebook profile lookups are
 * much more tightly rate-limited. Share both successful lookups and in-flight
 * work across those polls so a placeholder name cannot cause a burst of calls.
 */
async function refreshSocialConversationProfileForInbox(conversation: SocialConversation, channel: SocialChannel) {
  const key = socialProfileRefreshKey(conversation, channel);
  if (!key) return refreshSocialConversationProfileResult(conversation, channel);

  const now = Date.now();
  pruneSocialProfileRefreshCache(now);
  const cached = socialProfileRefreshCache.get(key);
  if (cached && cached.expiresAt > now) return applyCachedSocialProfileRefresh(conversation, cached);

  let request = socialProfileRefreshInFlight.get(key);
  if (!request) {
    request = refreshSocialConversationProfileResult(conversation, channel).then((result) => {
      const value: CachedSocialProfileRefresh = {
        expiresAt: Date.now() + socialProfileRefreshCooldown(result.status),
        status: result.status,
        contact: result.conversation.contact,
      };
      socialProfileRefreshCache.set(key, value);
      return value;
    }).finally(() => {
      socialProfileRefreshInFlight.delete(key);
    });
    socialProfileRefreshInFlight.set(key, request);
  }
  return applyCachedSocialProfileRefresh(conversation, await request);
}

/** Refresh only unresolved names and limit concurrent Facebook lookups. */
export async function refreshSocialConversationProfiles(conversations: SocialConversation[], channel: SocialChannel) {
  if (channel !== "messenger") return conversations;

  const refreshed = [...conversations];
  const pending = conversations
    .map((conversation, index) => ({ conversation, index }))
    .filter(({ conversation }) => socialConversationNeedsProfileRefresh(conversation, channel));
  let cursor = 0;

  await Promise.all(Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (cursor < pending.length) {
      const current = pending[cursor++];
      refreshed[current.index] = (await refreshSocialConversationProfileForInbox(current.conversation, channel)).conversation;
    }
  }));

  return refreshed;
}

/**
 * Refresh one bounded page of historic Messenger profiles. The operation never
 * sends a customer message or changes bot ownership; it only asks the provider
 * to hydrate the public display name behind an existing PSID.
 */
export async function syncSocialProfilePage(channel: SocialChannel, cursor?: string | null): Promise<SocialProfileSyncSummary> {
  if (channel !== "messenger") {
    return { scanned: 0, requested: 0, updated: 0, skipped: 0, unavailable: 0, failed: 0, nextCursor: null };
  }

  const query = new URLSearchParams({ channel, botCategory: "all", perPage: "50" });
  if (cursor) query.set("cursor", cursor);
  const page = await socialRequest<SocialPage<SocialConversation>>(`/conversations?${query}`);
  const pending = page.data.filter((conversation) => socialConversationNeedsProfileRefresh(conversation, channel));
  const results: SocialProfileRefreshResult[] = [];
  let index = 0;

  // Facebook profile lookups are provider-rate-limited. Four concurrent
  // requests keep this operator action responsive without producing a burst.
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (index < pending.length) {
      const conversation = pending[index++];
      results.push(await refreshSocialConversationProfileResult(conversation, channel));
    }
  }));

  return {
    scanned: page.data.length,
    requested: pending.length,
    updated: results.filter((result) => result.status === "updated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    unavailable: results.filter((result) => result.status === "unavailable").length,
    failed: results.filter((result) => result.status === "failed").length,
    nextCursor: page.nextCursor,
  };
}

function socialReplyKey(channel: SocialChannel, conversationId: string, text: string, mediaFileId?: string) {
  return [channel, conversationId, compactText(text), mediaFileId || ""].join("\u0001");
}

function socialSystemEvent(message: SocialMessage): SocialSystemEvent | null {
  // Providers can write this ownership notification as an outgoing message. It
  // is a status event for the adviser, not text that should be presented as a reply.
  return /^you took over this chat from your ai agent\.?$/i.test(compactText(message.text || ""))
    ? "provider_handover"
    : null;
}

function messagePriority(message: SocialMessage) {
  const sender = message.senderType?.toLowerCase();
  return sender === "user" ? 2 : sender === "api" ? 1 : 0;
}

function attachmentFingerprint(message: SocialMessage) {
  return (message.attachments || [])
    .map((attachment) => [attachment.id, attachment.name || "", attachment.fileType || "", attachment.mimeType || "", attachment.url || "", attachment.originPath || "", attachment.thumbnailPath || ""].join("\u0002"))
    .sort()
    .join("\u0003");
}

function isUnidentifiedProviderEcho(first: SocialMessage, second: SocialMessage) {
  // sourceId is the authoritative key. This fallback is deliberately narrow:
  // it handles only the API acknowledgement + webhook echo shape observed for
  // outgoing messages when one row lacks that provider identifier.
  if (first.sourceId && second.sourceId) return false;
  if (first.contactInboxId !== second.contactInboxId) return false;
  if (first.messageType.toLowerCase() !== "outgoing" || second.messageType.toLowerCase() !== "outgoing") return false;
  if (compactText(first.text || "") !== compactText(second.text || "")) return false;
  if (attachmentFingerprint(first) !== attachmentFingerprint(second)) return false;

  const senders = new Set([first.senderType?.toLowerCase(), second.senderType?.toLowerCase()]);
  if (senders.size !== 2 || !senders.has("api") || !senders.has("user")) return false;

  const firstAt = Date.parse(first.createdAt);
  const secondAt = Date.parse(second.createdAt);
  return Number.isFinite(firstAt) && Number.isFinite(secondAt) && Math.abs(firstAt - secondAt) <= SOCIAL_ECHO_FALLBACK_MS;
}

export function dedupeSocialMessages(messages: SocialMessage[]) {
  const unique = new Map<string, SocialMessage>();
  for (const message of messages) {
    // The provider can return the API acknowledgement and its webhook echo as
    // distinct rows. They carry the same sourceId and represent one delivery.
    const key = message.sourceId ? `source:${message.sourceId}` : `message:${message.id}`;
    const current = unique.get(key);
    if (!current || messagePriority(message) >= messagePriority(current)) unique.set(key, message);
  }

  const visible: SocialMessage[] = [];
  for (const message of unique.values()) {
    const echoIndex = visible.findIndex((current) => isUnidentifiedProviderEcho(current, message));
    if (echoIndex === -1) {
      visible.push(message);
      continue;
    }

    // The webhook copy includes the provider's final representation, so keep
    // it over the provisional API acknowledgement.
    if (messagePriority(message) >= messagePriority(visible[echoIndex])) {
      visible[echoIndex] = message;
    }
  }
  return visible;
}

export function parseSocialChannel(value: string): SocialChannel {
  if (value !== "messenger" && value !== "tiktok") throw new SocialInboxError("Canal no válido.", 404);
  return value;
}

export function socialInboxApiUrl() {
  return process.env.SOCIAL_INBOX_API_URL || SOCIAL_INBOX_DEFAULT_API_URL;
}

/**
 * ChatbotX currently serializes its bigint primary keys as JSON numbers.
 * Messenger IDs exceed JavaScript's safe integer range, so Response.json()
 * silently changes their final digits before the profile refresh can use them.
 *
 * Keep only identifier values as JSON strings while leaving every other value
 * untouched. This small scanner deliberately recognizes keys only outside of
 * JSON strings, so a customer's message containing text such as `"id": 123`
 * cannot be rewritten.
 */
export function parseSocialResponse<T>(raw: string): T {
  let result = "";
  let index = 0;

  while (index < raw.length) {
    if (raw[index] !== '"') {
      result += raw[index++];
      continue;
    }

    const keyStart = index++;
    let escaped = false;
    while (index < raw.length) {
      const character = raw[index++];
      if (!escaped && character === '"') break;
      escaped = !escaped && character === "\\";
      if (character !== "\\") escaped = false;
    }

    const keyEnd = index;
    result += raw.slice(keyStart, keyEnd);
    let separator = index;
    while (/\s/.test(raw[separator] || "")) separator++;
    if (raw[separator] !== ":") continue;

    let valueStart = separator + 1;
    while (/\s/.test(raw[valueStart] || "")) valueStart++;
    const numericValue = raw.slice(valueStart).match(/^-?\d+/)?.[0];
    let key: string;
    try {
      key = JSON.parse(raw.slice(keyStart, keyEnd));
    } catch {
      continue;
    }
    if (!numericValue || !SOCIAL_ID_FIELDS.has(key)) continue;

    result += raw.slice(index, valueStart);
    result += `"${numericValue}"`;
    index = valueStart + numericValue.length;
  }

  return JSON.parse(result) as T;
}

export async function socialRequest<T>(path: string, body?: unknown, requestId?: string): Promise<T> {
  const token = process.env.SOCIAL_INBOX_API_TOKEN;
  if (!token) throw new SocialInboxError("La conexión de mensajería necesita configuración.", 503);
  let response: Response;
  try {
    response = await fetch(`${socialInboxApiUrl()}/v1${path}`, {
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
  try {
    return parseSocialResponse<T>(await response.text());
  } catch {
    throw new SocialInboxError("El canal devolvió una respuesta no válida.");
  }
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

type SocialAttachmentContext = { channel: SocialChannel; conversationId: string };

function directAttachmentUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function proxyableAttachmentUrl(value: string | null | undefined) {
  if (!value) return false;
  const raw = value.trim();
  // A rooted provider path is resolved server-side against the configured
  // ChatbotX origin. Do not accept protocol-relative paths (//host/path).
  if (raw.startsWith("/") && !raw.startsWith("//")) return true;
  try {
    // ChatbotX's self-hosted storage signs this internal Docker host. It is
    // reachable only through the store's loopback storage proxy.
    return new URL(raw).origin === "http://filesystem:9000";
  } catch {
    return false;
  }
}

function proxyableStoragePath(value: string | null | undefined) {
  if (!value) return false;
  const source = value.trim();
  try {
    const absolute = new URL(source);
    return absolute.origin === "http://filesystem:9000" && !absolute.username && !absolute.password;
  } catch {
    // Continue with a storage key relative to the fixed storage origin.
  }
  const raw = source.replace(/^\/+/, "");
  if (!raw || raw.length > 2048 || /[\\?#\x00-\x1f\x7f]/.test(raw)) return false;
  return raw.split("/").every((segment) => {
    if (!segment) return false;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\\");
    } catch {
      return false;
    }
  });
}

function safeSocialIdentifier(value: string) {
  return value.length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f\\/]/.test(value) && value !== "." && value !== "..";
}

/**
 * Browser-safe path for a private provider attachment. The route rechecks the
 * conversation, exact inbox, message and attachment before it reads storage;
 * this function never exposes the provider's internal storage URL.
 */
export function socialAttachmentProxyPath(channel: SocialChannel, conversationId: string, messageId: string, attachmentId: string) {
  if (!/^\d+$/.test(conversationId) || !safeSocialIdentifier(messageId) || !safeSocialIdentifier(attachmentId)) return null;
  return `/api/admin/social/${channel}/attachments/${encodeURIComponent(conversationId)}/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}`;
}

/**
 * ChatbotX has returned both category values (for example `IMAGE`) and full
 * MIME values (for example `image/jpeg`) in `fileType`. Prefer a MIME value
 * wherever it appears so media is rendered with its native browser player
 * instead of being mistaken for a document.
 */
export function socialAttachmentKind(file: SocialAttachment): SocialAttachmentKind {
  const values = [file.mimeType, file.fileType]
    .filter((value): value is string => typeof value === "string")
    .map(value => value.trim().toLowerCase());

  for (const value of values) {
    if (value.startsWith("image/")) return "image";
    if (value.startsWith("video/")) return "video";
    if (value.startsWith("audio/")) return "audio";
  }
  if (values.some(value => value === "image")) return "image";
  if (values.some(value => value === "video")) return "video";
  if (values.some(value => value === "audio")) return "audio";

  const name = file.name?.trim().toLowerCase() || "";
  if (/\.(avif|gif|jpe?g|png|webp)$/.test(name)) return "image";
  if (/\.(m4v|mov|mp4|webm)$/.test(name)) return "video";
  if (/\.(aac|m4a|mp3|ogg|opus|wav)$/.test(name)) return "audio";
  return "document";
}

function browserAttachmentUrl(messageId: string, file: SocialAttachment, context?: SocialAttachmentContext) {
  const direct = directAttachmentUrl(file.url);
  if (direct) return direct;
  if (!context || (!proxyableAttachmentUrl(file.url) && !proxyableStoragePath(file.originPath) && !proxyableStoragePath(file.thumbnailPath))) return null;
  return socialAttachmentProxyPath(context.channel, context.conversationId, messageId, file.id);
}

export function safeSocialMessage(message: SocialMessage, context?: SocialAttachmentContext): SocialMessage {
  const systemEvent = socialSystemEvent(message);
  return { id: message.id, text: message.deletedAt || systemEvent ? null : message.text, createdAt: message.createdAt,
    contactInboxId: message.contactInboxId, messageType: message.messageType,
    // Keep these provider identifiers so the browser can merge an API
    // acknowledgement with its later Messenger echo across separate refreshes.
    sourceId: message.sourceId || null, senderType: message.senderType || null,
    systemEvent,
    deletedAt: message.deletedAt, sendError: message.sendError
      ? /\b2018300\b/.test(message.sendError)
        ? "Facebook rechazó el envío porque otra app controla esta conversación. Revisa el enrutamiento de Messenger de la página."
        : "El canal no confirmó el envío."
      : null,
    attachments: message.deletedAt ? [] : (message.attachments || []).map((file) => ({ id: file.id, name: file.name, fileType: file.fileType, mimeType: file.mimeType,
      url: browserAttachmentUrl(message.id, file, context) })),
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

async function disableSocialBotAfterVerification(conversationId: string, requestId: string) {
  const result = await socialRequest<{ success?: boolean }>(
    `/conversations/${conversationId}/disable-bot`,
    {},
    requestId,
  );
  // Older ChatbotX deployments acknowledge this mutation with an empty object;
  // only an explicit negative acknowledgement is considered a failed handoff.
  if (result?.success === false) {
    throw new SocialInboxError("El canal no confirmó la derivación a un asesor.");
  }
}

/**
 * Permanently hands one provider conversation to the human queue. This is
 * used by Super Bot only after it has deliberately decided not to answer.
 */
export async function disableSocialBot(channel: SocialChannel, conversationId: string, requestId: string) {
  await socialConversation(conversationId, channel);
  await disableSocialBotAfterVerification(conversationId, requestId);
}

/**
 * Restoring automation is an explicit operator action after a human handoff.
 * It never sends a customer message and must not be called as a side effect of
 * loading a conversation or delivering a manual reply.
 */
export async function enableSocialBot(channel: SocialChannel, conversationId: string, requestId: string) {
  // Verify that this conversation belongs to exactly one matching inbox
  // before changing the provider state. Re-enabling itself is not a reply, so
  // it deliberately does not require an active 24-hour messaging window.
  await socialConversation(conversationId, channel);
  const result = await socialRequest<{ success?: boolean }>(
    `/conversations/${conversationId}/enable-bot`,
    {},
    requestId,
  );
  if (result?.success !== true) {
    throw new SocialInboxError("El canal no confirmó la reactivación de Super Bot.");
  }
}

function mediaFileFromResponse(value: unknown): SocialMediaFile | null {
  if (!value || typeof value !== "object") return null;
  return "data" in value ? (value as { data: SocialMediaFile }).data : value as SocialMediaFile;
}

async function socialReplyMediaFile(mediaFileId: string) {
  const response = await socialRequest<SocialMediaFile | { data: SocialMediaFile }>(`/media-library/files/${encodeURIComponent(mediaFileId)}`);
  const media = mediaFileFromResponse(response);
  if (
    !media ||
    media.id !== mediaFileId ||
    typeof media.path !== "string" || !media.path.trim() || media.path.length > 2048 ||
    typeof media.url !== "string" || !media.url.trim() || media.url.length > 4096 ||
    typeof media.mimeType !== "string" || !media.mimeType.trim() ||
    typeof media.name !== "string" || !media.name.trim() || media.name.length > 180 ||
    !Number.isSafeInteger(media.size) || media.size <= 0 || media.size > 5 * 1024 * 1024
  ) {
    throw new SocialInboxError("El archivo cargado no está listo para enviarse. Vuelve a adjuntarlo.", 409);
  }
  return { path: media.path, url: media.url, mimeType: media.mimeType, name: media.name, size: media.size };
}

async function sendSocialReplyOnce(channel: SocialChannel, conversationId: string, text: string, requestId: string, mediaFileId?: string) {
  if (mediaFileId && (channel !== "messenger" || !/^\d+$/.test(mediaFileId))) throw new SocialInboxError("Adjunto no válido para este canal.", 400);
  // Resolve the provider-owned record before pausing automation. A bad or
  // incomplete upload must not change the conversation's bot state.
  const mediaFile = mediaFileId ? await socialReplyMediaFile(mediaFileId) : undefined;
  const inbox = await socialReplyInbox(channel, conversationId);
  // Messenger is a durable human handoff. TikTok is handled by the dedicated
  // bridge, where an adviser composing is only a short-lived lease; a manual
  // TikTok reply must not silence later customer turns indefinitely.
  if (channel === "messenger") {
    await disableSocialBotAfterVerification(conversationId, `${requestId}:handoff`);
  }
  // ChatbotX's message attachment `url` is nullable when only an internal ID
  // is supplied. Resolve the media record and send its documented public file
  // reference so the outgoing message retains a displayable URL after reload.
  const message = await socialRequest<SocialMessage>(`/conversations/${conversationId}/messages`, { ...(text ? { text } : {}), inboxId: inbox.inboxId, ...(mediaFile ? { mediaFile } : {}) }, requestId);
  if (!message?.id) throw new SocialInboxError("El envío no está confirmado. Revisa la conversación antes de repetirlo.");
  return safeSocialMessage(message, { channel, conversationId });
}

export function sendSocialReply(channel: SocialChannel, conversationId: string, text: string, requestId: string, mediaFileId?: string) {
  const key = socialReplyKey(channel, conversationId, text, mediaFileId);
  const now = Date.now();
  for (const [cachedKey, cached] of recentSocialReplies) {
    if (cached.expiresAt <= now) recentSocialReplies.delete(cachedKey);
  }
  const existing = recentSocialReplies.get(key);
  if (existing && existing.expiresAt > now) return existing.result;
  if (existing) recentSocialReplies.delete(key);

  const result = sendSocialReplyOnce(channel, conversationId, text, requestId, mediaFileId);
  const entry = { expiresAt: now + SOCIAL_REPLY_PENDING_MS, result };
  recentSocialReplies.set(key, entry);
  void result.then(
    () => {
      if (recentSocialReplies.get(key) === entry) entry.expiresAt = Date.now() + SOCIAL_REPLY_DEDUPLICATION_MS;
    },
    () => {
      if (recentSocialReplies.get(key) === entry) recentSocialReplies.delete(key);
    },
  );
  return result;
}
