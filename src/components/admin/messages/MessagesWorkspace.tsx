"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ChatHeader } from "./ChatHeader";
import { ConversationList, type ConversationFilters } from "./ConversationList";
import { CustomerPanel } from "./CustomerPanel";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import type { ChatMessage, Conversation } from "@/types/messages";

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
) {
  const params = buildConversationParams(filters, page);
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

function mergeMessages(base: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();

  for (const message of base) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  );
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
      dateFrom: debouncedFilters.dateFrom,
      dateTo: debouncedFilters.dateTo,
      q: debouncedFilters.q,
    }),
    [debouncedFilters.dateFrom, debouncedFilters.dateTo, debouncedFilters.q],
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
        const data = await fetchConversationsPage(filtersSnapshot, 1);
        const merged = mergeConversations(conversationsRef.current, data.items);
        setConversations(merged);
        setConversationTotal(data.total);
        setConversationHasMore(data.total > merged.length);
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
        const newItems = data.items.filter((message) => !knownIds.has(message.id));

        if (!newItems.length) {
          return;
        }

        const shouldScroll = isNearBottom(messagesContainerRef.current);
        setActiveMessages((current) => mergeMessages(current, newItems));
        setMessageTotal(data.total);

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

  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    );
    setActiveMessages([]);
    setMessageTotal(0);
    setMessageHasMore(false);
  };

  const handleSendMessage = async (content: string) => {
    if (!activeId) {
      return;
    }

    const now = new Date();
    const tempMessage: ChatMessage = {
      content,
      conversationId: activeId,
      createdAt: now,
      direction: "OUTBOUND",
      externalMessageId: null,
      id: `m-new-${now.getTime()}`,
      mediaUrl: null,
      messageType: "TEXT",
      metadata: null,
      senderType: "AGENT",
      status: "sending",
    };

    setActiveMessages((current) => [...current, tempMessage]);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              botEnabled: false,
              lastMessage: {
                content,
                createdAt: now,
                id: tempMessage.id,
                messageType: "TEXT",
                senderType: "AGENT",
              },
              lastMessageAt: now,
              status: conversation.status === "AUTOMATICO" ? "ATENDIENDO" : conversation.status,
            }
          : conversation,
      ),
    );
    window.requestAnimationFrame(() => scrollToBottom("smooth"));

    try {
      const response = await fetch(`/api/admin/conversations/${activeId}/messages`, {
        body: JSON.stringify({ content, type: "TEXT" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "No se pudo enviar el mensaje.");
      }

      const savedMessage = (await response.json()) as ChatMessage;
      setActiveMessages((current) =>
        mergeMessages(
          current.filter((message) => message.id !== tempMessage.id),
          [savedMessage],
        ),
      );
    } catch (error) {
      console.error("Send error", error);
      setActiveMessages((current) =>
        current.map((message) => (message.id === tempMessage.id ? { ...message, status: "failed" } : message)),
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
      await fetch(`/api/admin/conversations/${activeId}`, {
        body: JSON.stringify({ botEnabled: nextStatus }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
    } catch {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeId ? { ...conversation, botEnabled: Boolean(current) } : conversation,
        ),
      );
    }
  };

  const handleTakeConversation = async () => {
    if (!activeId) {
      return;
    }

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              botEnabled: false,
              status: "ATENDIENDO",
            }
          : conversation,
      ),
    );

    await fetch(`/api/admin/conversations/${activeId}`, {
      body: JSON.stringify({ botEnabled: false, status: "ATENDIENDO" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
  };

  const handleCloseConversation = async () => {
    if (!activeId) {
      return;
    }

    const conversationId = activeId;

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, status: "CERRADO" } : conversation,
      ),
    );
    setActiveId(undefined);
    setActiveMessages([]);
    setMessageTotal(0);
    setMessageHasMore(false);

    await fetch(`/api/admin/conversations/${conversationId}`, {
      body: JSON.stringify({ status: "CERRADO" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
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
                activeMessages.map((message) => <MessageBubble key={message.id} message={message} />)
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
