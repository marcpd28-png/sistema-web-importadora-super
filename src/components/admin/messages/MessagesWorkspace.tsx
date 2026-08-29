"use client";

import { useState, useEffect, useRef } from "react";
import { ConversationList } from "./ConversationList";
import { ChatHeader } from "./ChatHeader";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { CustomerPanel } from "./CustomerPanel";
import { Conversation, ChatMessage } from "@/types/messages";
import { MessageCircle } from "lucide-react";

export function MessagesWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(c => c.id === activeId);

  // Fetch conversations (polling)
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await fetch(`/api/admin/conversations?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setConversations(data.items);
        }
      } catch (error) {
        console.error("Failed to fetch conversations", error);
      } finally {
        setLoadingConversations(false);
      }
    };

    fetchConversations();
    const interval = setInterval(fetchConversations, 10000); // 10s poll
    return () => clearInterval(interval);
  }, []);

  // Fetch active messages (polling)
  useEffect(() => {
    if (!activeId) {
      setTimeout(() => setActiveMessages([]), 0);
      return;
    }

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/admin/conversations/${activeId}/messages?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          // Sort messages by createdAt asc just in case
          const sorted = data.items.sort((a: ChatMessage, b: ChatMessage) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          setActiveMessages(sorted);
        }
      } catch (error) {
        console.error("Failed to fetch messages", error);
      } finally {
        setLoadingMessages(false);
      }
    };

    setTimeout(() => setLoadingMessages(true), 0);
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // 5s poll for active chat
    return () => clearInterval(interval);
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length]);

  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    // Optimistic unread reset
    setConversations(prev => prev.map(c => 
      c.id === id ? { ...c, unreadCount: 0 } : c
    ));
  };

  const handleSendMessage = async (content: string) => {
    if (!activeId) return;
    
    // Optimistic UI
    const tempMessage: ChatMessage = {
      id: `m-new-${Date.now()}`,
      conversationId: activeId,
      direction: "OUTBOUND",
      senderType: "AGENT",
      messageType: "TEXT",
      content,
      status: "sending",
      createdAt: new Date(),
      externalMessageId: null,
      mediaUrl: null,
      metadata: null
    };

    setActiveMessages(prev => [...prev, tempMessage]);
    setConversations(prev => prev.map(c => 
      c.id === activeId ? { 
        ...c, 
        lastMessageAt: new Date(),
        status: c.status === "AUTOMATICO" ? "ATENDIENDO" : c.status,
        botEnabled: false
      } : c
    ));

    try {
      const res = await fetch(`/api/admin/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: "TEXT" })
      });
      if (!res.ok) throw new Error("Send failed");
      
      const savedMessage = await res.json();
      
      // Replace optimistic message
      setActiveMessages(prev => prev.map(m => m.id === tempMessage.id ? savedMessage : m));
    } catch (error) {
      console.error("Send error", error);
      // Mark optimistic as failed
      setActiveMessages(prev => prev.map(m => m.id === tempMessage.id ? { ...m, status: "failed" } : m));
    }
  };

  const handleToggleBot = async () => {
    if (!activeId) return;
    const current = activeConversation?.botEnabled;
    const newStatus = !current;
    
    // Optimistic
    setConversations(prev => prev.map(c => 
      c.id === activeId ? { ...c, botEnabled: newStatus } : c
    ));

    try {
      await fetch(`/api/admin/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botEnabled: newStatus })
      });
    } catch (e) {
      // Revert if error (simplified)
      setConversations(prev => prev.map(c => 
        c.id === activeId ? { ...c, botEnabled: current! } : c
      ));
    }
  };

  const handleTakeConversation = async () => {
    if (!activeId) return;
    
    setConversations(prev => prev.map(c => 
      c.id === activeId ? { 
        ...c, 
        botEnabled: false, 
        status: "ATENDIENDO"
      } : c
    ));

    await fetch(`/api/admin/conversations/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botEnabled: false, status: "ATENDIENDO" })
    });
  };

  const handleCloseConversation = async () => {
    if (!activeId) return;
    
    setConversations(prev => prev.map(c => 
      c.id === activeId ? { ...c, status: "CERRADO" } : c
    ));
    setActiveId(undefined);

    await fetch(`/api/admin/conversations/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CERRADO" })
    });
  };

  return (
    <div className={`messages-workspace ${activeId ? "chat-open" : ""}`}>
      <ConversationList 
        conversations={conversations} 
        activeId={activeId} 
        onSelect={handleSelectConversation} 
      />
      
      {activeConversation ? (
        <>
          <div className="messages-main">
            <ChatHeader 
              conversation={activeConversation}
              onToggleBot={handleToggleBot}
              onTakeConversation={handleTakeConversation}
              onCloseConversation={handleCloseConversation}
            />
            
            <div className="chat-messages">
              {loadingMessages && activeMessages.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center" }}>Cargando...</div>
              ) : (
                activeMessages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            
            <MessageInput onSendMessage={handleSendMessage} />
          </div>
          
          <CustomerPanel conversation={activeConversation} />
        </>
      ) : (
        <div className="messages-main" style={{ alignItems: 'center', justifyContent: 'center' }}>
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
