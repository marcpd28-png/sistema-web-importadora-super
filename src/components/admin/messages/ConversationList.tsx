import type { UIEvent } from "react";
import type { Conversation, ConversationState } from "@/types/messages";
import { ConversationItem } from "./ConversationItem";
import { CalendarDays, Hash, Phone, RotateCw, Search } from "lucide-react";

export type ConversationFilters = {
  dateFrom: string;
  dateTo: string;
  phone: string;
  q: string;
  search: string;
  status: ConversationState | "";
  unreadOnly: boolean;
};

interface Props {
  activeId?: string;
  conversations: Conversation[];
  filters: ConversationFilters;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onFiltersChange: (filters: Partial<ConversationFilters>) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  total: number;
}

const FILTERS: Array<{
  id: string;
  label: string;
  status: ConversationState | "";
  unreadOnly?: boolean;
}> = [
  { id: "all", label: "Todos", status: "" },
  { id: "unread", label: "No leídos", status: "", unreadOnly: true },
  { id: "requiere_asesor", label: "Requiere asesor", status: "REQUIERE_ASESOR" },
  { id: "automatico", label: "Automático", status: "AUTOMATICO" },
  { id: "atendiendo", label: "Atendiendo", status: "ATENDIENDO" },
  { id: "cerrados", label: "Cerrados", status: "CERRADO" },
];

function getActiveFilter(filters: ConversationFilters) {
  if (filters.unreadOnly) {
    return "unread";
  }

  return FILTERS.find((filter) => filter.status === filters.status)?.id ?? "all";
}

export function ConversationList({
  activeId,
  conversations,
  filters,
  hasMore,
  loading,
  loadingMore,
  onFiltersChange,
  onLoadMore,
  onRefresh,
  onSelect,
  total,
}: Props) {
  const activeFilter = getActiveFilter(filters);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (remaining < 160 && hasMore && !loadingMore && !loading) {
      onLoadMore();
    }
  };

  return (
    <div className="messages-sidebar">
      <div className="messages-sidebar-header">
        <div className="messages-search-row">
          <div className="messages-field messages-field-grow">
            <Search size={16} />
            <input
              className="messages-search"
              onChange={(event) => onFiltersChange({ search: event.target.value })}
              placeholder="Cliente"
              type="search"
              value={filters.search}
            />
          </div>
          <button className="icon-btn" disabled={loading} onClick={onRefresh} title="Actualizar" type="button">
            <RotateCw className={loading ? "spin" : undefined} size={18} />
          </button>
        </div>

        <div className="messages-filter-grid">
          <div className="messages-field">
            <Phone size={15} />
            <input
              className="messages-search"
              inputMode="tel"
              onChange={(event) => onFiltersChange({ phone: event.target.value })}
              placeholder="Número"
              type="search"
              value={filters.phone}
            />
          </div>
          <div className="messages-field">
            <Hash size={15} />
            <input
              className="messages-search"
              onChange={(event) => onFiltersChange({ q: event.target.value })}
              placeholder="Palabra clave"
              type="search"
              value={filters.q}
            />
          </div>
        </div>

        <div className="messages-date-row">
          <label className="messages-date-field">
            <CalendarDays size={14} />
            <input
              aria-label="Fecha desde"
              onChange={(event) => onFiltersChange({ dateFrom: event.target.value })}
              type="date"
              value={filters.dateFrom}
            />
          </label>
          <label className="messages-date-field">
            <CalendarDays size={14} />
            <input
              aria-label="Fecha hasta"
              onChange={(event) => onFiltersChange({ dateTo: event.target.value })}
              type="date"
              value={filters.dateTo}
            />
          </label>
        </div>

        <div className="messages-filters">
          {FILTERS.map((filter) => (
            <button
              className={`messages-filter-btn ${activeFilter === filter.id ? "active" : ""}`}
              key={filter.id}
              onClick={() =>
                onFiltersChange({
                  status: filter.status,
                  unreadOnly: Boolean(filter.unreadOnly),
                })
              }
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="messages-result-count">
          {loading && conversations.length === 0 ? "Cargando..." : `${conversations.length} de ${total}`}
        </div>
      </div>

      <div className="messages-list" onScroll={handleScroll}>
        {conversations.length > 0 ? (
          conversations.map((conversation) => (
            <ConversationItem
              conversation={conversation}
              isActive={conversation.id === activeId}
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
            />
          ))
        ) : (
          <div className="empty-state compact">
            <p>{loading ? "Cargando conversaciones..." : "No se encontraron conversaciones."}</p>
          </div>
        )}

        {loadingMore ? <div className="messages-list-loader">Cargando más conversaciones...</div> : null}
        {!loadingMore && hasMore ? <div className="messages-list-hint">Desliza para ver más</div> : null}
      </div>
    </div>
  );
}
