"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ChatHeader } from "./ChatHeader";
import { ConversationList, type ConversationFilters } from "./ConversationList";
import { CustomerPanel } from "./CustomerPanel";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import type { ChatMessage, Conversation } from "@/types/messages";
import { mergeMessages } from "@/lib/messages-core";

const CONVERSATION_PAGE_SIZE = 30;
const MESSAGE_PAGE_SIZE = 60;
const CONVERSATION_POLL_MS = 10000;
const MESSAGE_POLL_MS = 5000;

const DEFAULT_FILTERS: ConversationFilters = {
  dateFrom: "",
  dateTo: "",
  phone: "",
  q: "",
  search: "",
  status: "",
  unreadOnly: false,
};

type ConversationsResponse = {
  hasMore: boolean;
  items: Conversation[];
  page: number;
  total: number;
  totalPages: number;
};

type MessagesResponse = {
  hasMore: boolean;
  items: ChatMessage[];
  latestId: string | null;
  latestAt: string | null;
  nextBeforeId: string | null;
  nextBefore: string | null;
  total: number;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function appendParam(params: URLSearchParams, key: string, value: string | boolean | undefined) {
  if (typeof value === "boolean") {
    if (value) {
      params.set(key, "true");
    }
    return;
  }

  if (value?.trim()) {
    params.set(key, value.trim());
  }
}

function buildConversationParams(filters: ConversationFilters, page: number) {
  const params = new URLSearchParams({
    limit: String(CONVERSATION_PAGE_SIZE),
    page: String(page),
    t: String(Date.now()),
  });

  appendParam(params, "search", filters.search);
  appendParam(params, "phone", filters.phone);
  appendParam(params, "q", filters.q);
  appendParam(params, "dateFrom", filters.dateFrom);
  appendParam(params, "dateTo", filters.dateTo);
  appendParam(params, "status", filters.status || undefined);
  appendParam(params, "unreadOnly", filters.unreadOnly);

  return params;
}

function buildMessageParams(
  filters: ConversationFilters,
  extra?: { after?: string; afterId?: string; before?: string; beforeId?: string },
) {
  const params = new URLSearchParams({
    limit: String(MESSAGE_PAGE_SIZE),
    t: String(Date.now()),
  });

  appendParam(params, "q", filters.q);
  appendParam(params, "dateFrom", filters.dateFrom);
  appendParam(params, "dateTo", filters.dateTo);
  appendParam(params, "before", extra?.before);
  appendParam(params, "beforeId", extra?.beforeId);
  appendParam(params, "after", extra?.after);
  appendParam(params, "afterId", extra?.afterId);

  return params;
}

async function fetchConversationsPage(
  filters: ConversationFilters,
  page: number,
  signal?: AbortSignal,
  customLimit?: number
) {
  const params = buildConversationParams(filters, page);
  if (customLimit) params.set("limit", String(customLimit));
  const response = await fetch(`/api/admin/conversations?${params.toString()}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar las conversaciones.");
  }

  return (await response.json()) as ConversationsResponse;
}

async function fetchMessagesPage(
  conversationId: string,
  filters: ConversationFilters,
  extra?: { after?: string; afterId?: string; before?: string; beforeId?: string },
  signal?: AbortSignal,
) {
  const params = buildMessageParams(filters, extra);
  const response = await fetch(`/api/admin/conversations/${conversationId}/messages?${params.toString()}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los mensajes.");
  }

  return (await response.json()) as MessagesResponse;
}

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

function mergeConversations(base: Conversation[], incoming: Conversation[]) {
  const byId = new Map<string, Conversation>();

  for (const conversation of base) {
    byId.set(conversation.id, conversation);
  }

  for (const conversation of incoming) {
    byId.set(conversation.id, conversation);
  }

  return sortConversations([...byId.values()]);
}

function isNearBottom(element: HTMLDivElement | null) {
  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

export function MessagesWorkspace() {
  const [filters, setFilters] = useState<ConversationFilters>(DEFAULT_FILTERS);
  const debouncedFilters = useDebouncedValue(filters, 350);
  const messageFilters = useMemo(
    () => ({
      ...DEFAULT_FILTERS,
    }),
    [],
  );

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [messageTotal, setMessageTotal] = useState(0);
  const [messageHasMore, setMessageHasMore] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeMessagesRef = useRef<ChatMessage[]>([]);
  const conversationsRef = useRef<Conversation[]>([]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const debouncedConversationKey = useMemo(() => JSON.stringify(debouncedFilters), [debouncedFilters]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    activeMessagesRef.current = activeMessages;
  }, [activeMessages]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const controller = new AbortController();
    const filtersSnapshot = debouncedFilters;

    const loadInitialConversations = async () => {
      setLoadingConversations(true);
      setConversationPage(1);

      try {
        const data = await fetchConversationsPage(filtersSnapshot, 1, controller.signal);
        setConversations(data.items);
        setConversationTotal(data.total);
        setConversationHasMore(data.hasMore);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Failed to fetch conversations", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingConversations(false);
        }
      }
    };

    loadInitialConversations();

    const interval = window.setInterval(async () => {
        try {
          const currentLimit = conversationsRef.current.length > 0 
            ? Math.max(CONVERSATION_PAGE_SIZE, conversationsRef.current.length) 
            : CONVERSATION_PAGE_SIZE;
          const data = await fetchConversationsPage(filtersSnapshot, 1, undefined, currentLimit);
          setConversations(data.items);
          setConversationTotal(data.total);
          setConversationHasMore(data.total > data.items.length);
        } catch (error) {
          console.error("Failed to refresh conversations", error);
        }
      }, CONVERSATION_POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedConversationKey, refreshNonce]);

  useEffect(() => {
    if (!activeId) {
      return undefined;
    }

    const controller = new AbortController();
    const filtersSnapshot = messageFilters;

    const loadInitialMessages = async () => {
      setLoadingMessages(true);

      try {
        const data = await fetchMessagesPage(activeId, filtersSnapshot, undefined, controller.signal);
        setActiveMessages(data.items);
        setMessageTotal(data.total);
        setMessageHasMore(data.hasMore);
        window.requestAnimationFrame(() => scrollToBottom("auto"));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Failed to fetch messages", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingMessages(false);
        }
      }
    };

    loadInitialMessages();

    return () => controller.abort();
  }, [activeId, messageFilters, scrollToBottom]);

  useEffect(() => {
    if (!activeId) {
      return undefined;
    }

    const filtersSnapshot = messageFilters;
    const interval = window.setInterval(async () => {
      const latestMessage = activeMessagesRef.current.at(-1);

      if (!latestMessage) {
        return;
      }

      try {
        const data = await fetchMessagesPage(activeId, filtersSnapshot, {
          afterId: latestMessage.id,
          after: new Date(latestMessage.createdAt).toISOString(),
        });

        const knownIds = new Set(activeMessagesRef.current.map((message) => message.id));
        const trulyNewItems = data.items.filter((message) => !knownIds.has(message.id));

        if (data.items.length > 0) {
          setActiveMessages((current) => mergeMessages(current, data.items));
          setMessageTotal(data.total);
        }

        const hasNewInbound = trulyNewItems.some(
          (message) => message.direction === "INBOUND" || message.senderType === "CUSTOMER",
        );

        if (hasNewInbound && activeId) {
          try {
            const res = await fetch(`/api/admin/conversations/${activeId}/read`, {
              method: "POST",
            });
            if (res.ok) {
              setConversations((current) =>
                current.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)),
              );
            }
          } catch {
            // Ignore polling read error
          }
        }

        const shouldScroll = trulyNewItems.length > 0 && isNearBottom(messagesContainerRef.current);
        if (shouldScroll) {
          window.requestAnimationFrame(() => scrollToBottom("smooth"));
        }
      } catch (error) {
        console.error("Failed to poll messages", error);
      }
    }, MESSAGE_POLL_MS);

    return () => window.clearInterval(interval);
  }, [activeId, messageFilters, scrollToBottom]);

  const handleFiltersChange = useCallback((nextFilters: Partial<ConversationFilters>) => {
    setFilters((current) => ({ ...current, ...nextFilters }));
  }, []);

  const handleLoadMoreConversations = useCallback(async () => {
    if (loadingConversations || loadingMoreConversations || !conversationHasMore) {
      return;
    }

    const nextPage = conversationPage + 1;
    setLoadingMoreConversations(true);

    try {
      const data = await fetchConversationsPage(debouncedFilters, nextPage);
      setConversations((current) => mergeConversations(current, data.items));
      setConversationPage(nextPage);
      setConversationTotal(data.total);
      setConversationHasMore(data.hasMore);
    } catch (error) {
      console.error("Failed to load more conversations", error);
    } finally {
      setLoadingMoreConversations(false);
    }
  }, [
    conversationHasMore,
    conversationPage,
    debouncedFilters,
    loadingConversations,
    loadingMoreConversations,
  ]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!activeId || loadingMessages || loadingOlderMessages || !messageHasMore) {
      return;
    }

    const oldestMessage = activeMessagesRef.current[0];

    if (!oldestMessage) {
      return;
    }

    const container = messagesContainerRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const previousTop = container?.scrollTop ?? 0;
    setLoadingOlderMessages(true);

    try {
      const data = await fetchMessagesPage(activeId, messageFilters, {
        beforeId: oldestMessage.id,
        before: new Date(oldestMessage.createdAt).toISOString(),
      });

      setActiveMessages((current) => mergeMessages(data.items, current));
      setMessageTotal(data.total);
      setMessageHasMore(data.hasMore);

      window.requestAnimationFrame(() => {
        if (!container) {
          return;
        }

        container.scrollTop = container.scrollHeight - previousHeight + previousTop;
      });
    } catch (error) {
      console.error("Failed to load older messages", error);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [activeId, loadingMessages, loadingOlderMessages, messageFilters, messageHasMore]);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;

    if (container && container.scrollTop < 120) {
      void handleLoadOlderMessages();
    }
  }, [handleLoadOlderMessages]);

  const handleSelectConversation = async (id: string) => {
    setActiveId(id);
    const targetConv = conversations.find((c) => c.id === id);
    const previousUnread = targetConv?.unreadCount ?? 0;

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    );
    setActiveMessages([]);
    setMessageTotal(0);
    setMessageHasMore(false);

    if (previousUnread > 0) {
      try {
        const response = await fetch(`/api/admin/conversations/${id}/read`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Failed to mark conversation as read");
        }
      } catch {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === id ? { ...conversation, unreadCount: previousUnread } : conversation,
          ),
        );
      }
    }
  };

  const handleSendMessage = async (content: string, mediaUrl?: string, type: string = "TEXT", clientRequestId?: string) => {
    if (!activeId) return;

    let isForceRetry = false;
    if (clientRequestId) {
      const existingMsg = activeMessages.find(m => m.clientRequestId === clientRequestId);
      if (existingMsg?.status === 'unknown') {
        if (!window.confirm("El estado del envío es desconocido. El mensaje podría haberse enviado.\n\n¿Reintentar forzosamente y arriesgar duplicación?")) {
          return;
        }
        isForceRetry = true;
      }
      setActiveMessages(prev => prev.filter(m => m.clientRequestId !== clientRequestId));
    }

    const now = new Date();
    const requestIdToUse = clientRequestId || crypto.randomUUID();

    const tempMessage: ChatMessage = {
      content,
      conversationId: activeId,
      createdAt: now,
      direction: "OUTBOUND",
      externalMessageId: null,
      id: `m-new-${now.getTime()}`,
      clientRequestId: requestIdToUse,
      mediaUrl: mediaUrl || null,
      messageType: type as "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO",
      metadata: null,
      senderType: "AGENT",
      status: "sending",
    };

    setActiveMessages((current) => [...current, tempMessage]);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? { ...conversation, lastMessageAt: now, botEnabled: false, status: "ATENDIENDO" }
          : conversation,
      ),
    );

    let failureStatus: "failed" | "unknown" = "failed";

    try {
      const response = await fetch(`/api/admin/conversations/${activeId}/messages`, {
        body: JSON.stringify({
          content,
          type,
          mediaUrl: mediaUrl || undefined,
          clientRequestId: requestIdToUse,
          forceRetry: isForceRetry || undefined
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.code === "N8N_TIMEOUT") {
          failureStatus = "unknown";
        }
        throw new Error(payload?.error || "Send failed");
      }

      const sentMessage = await response.json();
      
      if (sentMessage.id) {
        setActiveMessages((current) =>
          current.map((msg) => (msg.id === tempMessage.id ? sentMessage : msg)),
        );
      }
    } catch {
      setActiveMessages((current) =>
        current.map((msg) => (msg.id === tempMessage.id ? { ...msg, status: failureStatus } : msg)),
      );
    }
  };

  const handleToggleBot = async () => {
    if (!activeId) {
      return;
    }

    const current = activeConversation?.botEnabled;
    const nextStatus = !current;

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === activeId ? { ...conversation, botEnabled: nextStatus } : conversation,
      ),
    );

    try {
      const res = await fetch(`/api/admin/conversations/${activeId}`, {
        body: JSON.stringify({ botEnabled: nextStatus }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Toggle bot failed");
    } catch {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeId ? { ...conversation, botEnabled: current ?? false } : conversation,
        ),
      );
    }
  };

  
  const handleTakeConversation = async () => {
    if (!activeId) return;
    
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    const prevStatus = conv.status;
    const prevBot = conv.botEnabled;
    const prevAssigned = conv.assignedUserId;

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === activeId
          ? { ...conversation, botEnabled: false, status: "ATENDIENDO", assignedUserId: "admin" }
          : conversation,
      ),
    );

    try {
      const res = await fetch(`/api/admin/conversations/${activeId}/take`, {
        method: "POST",
      });
      if (!res.ok) {
        if (res.status === 409) {
          alert("Esta conversación ya fue tomada por otro asesor.");
        }
        throw new Error("Take failed");
      }
    } catch {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeId
            ? { ...conversation, botEnabled: prevBot, status: prevStatus, assignedUserId: prevAssigned }
            : conversation,
        ),
      );
    }
  };

  const handleCloseConversation = async () => {
    if (!activeId) return;

    const conversationId = activeId;
    const conv = conversations.find(c => c.id === conversationId);
    const prevStatus = conv?.status;

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, status: "CERRADO" } : conversation,
      ),
    );

    try {
      const res = await fetch(`/api/admin/conversations/${conversationId}`, {
        body: JSON.stringify({ status: "CERRADO" }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Close failed");
      setActiveId(undefined);
      setActiveMessages([]);
      setMessageTotal(0);
      setMessageHasMore(false);
    } catch {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, status: prevStatus || conversation.status } : conversation,
        ),
      );
    }
  };

  return (
    <div className={`messages-workspace ${activeId ? "chat-open" : ""}`}>
      <ConversationList
        activeId={activeId}
        conversations={conversations}
        filters={filters}
        hasMore={conversationHasMore}
        loading={loadingConversations}
        loadingMore={loadingMoreConversations}
        onFiltersChange={handleFiltersChange}
        onLoadMore={handleLoadMoreConversations}
        onRefresh={() => setRefreshNonce((current) => current + 1)}
        onSelect={handleSelectConversation}
        total={conversationTotal}
      />

      {activeConversation ? (
        <>
          <div className="messages-main">
            <ChatHeader
              conversation={activeConversation}
              onCloseConversation={handleCloseConversation}
              onTakeConversation={handleTakeConversation}
              onToggleBot={handleToggleBot}
            />

            <div className="chat-messages" onScroll={handleMessagesScroll} ref={messagesContainerRef}>
              {loadingOlderMessages ? <div className="messages-list-loader">Cargando mensajes antiguos...</div> : null}
              {!loadingOlderMessages && messageHasMore ? (
                <button className="messages-load-older" onClick={handleLoadOlderMessages} type="button">
                  Ver mensajes anteriores
                </button>
              ) : null}

              {loadingMessages && activeMessages.length === 0 ? (
                <div className="messages-list-loader">Cargando mensajes...</div>
              ) : (
                activeMessages.map((message) => <MessageBubble key={message.id} message={message} onRetry={(msg) => handleSendMessage(msg.content, msg.mediaUrl || undefined, msg.messageType, msg.clientRequestId || undefined)} />)
              )}

              {!loadingMessages && activeMessages.length === 0 ? (
                <div className="empty-state compact">
                  <p>No hay mensajes para los filtros actuales.</p>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>

            <div className="chat-count">{activeMessages.length} de {messageTotal} mensajes cargados</div>
            <MessageInput onSendMessage={handleSendMessage} />
          </div>

          <CustomerPanel conversation={activeConversation} />
        </>
      ) : (
        <div className="messages-main messages-empty-main">
          <div className="empty-state">
            <MessageCircle size={64} />
            <h2>Centro de Mensajes</h2>
            <p>Selecciona una conversación para comenzar a chatear</p>
          </div>
        </div>
      )}
    </div>
  );
}
