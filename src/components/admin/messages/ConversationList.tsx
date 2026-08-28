import { useState } from "react";
import { Conversation } from "@/types/messages";
import { ConversationItem } from "./ConversationItem";
import { Search, RotateCw } from "lucide-react";

interface Props {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
}

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "unread", label: "No leídos" },
  { id: "requiere_asesor", label: "Requiere asesor" },
  { id: "automatico", label: "Automático" },
  { id: "atendiendo", label: "Atendiendo" },
  { id: "cerrados", label: "Cerrados" }
];

export function ConversationList({ conversations, activeId, onSelect }: Props) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = conversations.filter(c => {
    // 1. Search filter
    if (search && !c.contact.name.toLowerCase().includes(search.toLowerCase()) && !c.contact.phone?.includes(search)) {
      return false;
    }
    
    // 2. Status filter
    switch (filter) {
      case "all": return true;
      case "requiere_asesor": return c.status === "REQUIERE_ASESOR";
      case "automatico": return c.status === "AUTOMATICO";
      case "atendiendo": return c.status === "ATENDIENDO";
      case "cerrados": return c.status === "CERRADO";
      case "unread": return c.unreadCount > 0;
      default: return true;
    }
  });

  return (
    <div className="messages-sidebar">
      <div className="messages-sidebar-header">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input 
              type="text" 
              className="messages-search" 
              placeholder="Buscar cliente..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>
          <button className="icon-btn" title="Actualizar">
            <RotateCw size={18} />
          </button>
        </div>
        
        <div className="messages-filters">
          {FILTERS.map(f => (
            <button 
              key={f.id}
              className={`messages-filter-btn ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="messages-list">
        {filtered.length > 0 ? (
          filtered.map(c => (
            <ConversationItem 
              key={c.id} 
              conversation={c} 
              isActive={c.id === activeId} 
              onClick={() => onSelect(c.id)} 
            />
          ))
        ) : (
          <div className="empty-state" style={{ padding: '20px' }}>
            <p>No se encontraron conversaciones.</p>
          </div>
        )}
      </div>
    </div>
  );
}
