"use client";

import { useMemo, useState } from "react";
import type { Conversation } from "@/types/messages";
import { ConversationStatus } from "./ConversationStatus";
import { ArrowLeft, ArrowRightLeft, CheckCircle, PlayCircle, StopCircle, UserPlus } from "lucide-react";
import { DynamicAvatar } from "./ConversationItem";

type AssignmentViewer = {
  id: string;
  name: string;
  isMessagingOwner: boolean;
};

type AdvisorTarget = {
  id: string;
  name: string;
};

interface Props {
  advisorTargets: AdvisorTarget[];
  assignmentBusy: boolean;
  canManageBot?: boolean;
  conversation: Conversation;
  onToggleBot?: () => void;
  onTakeConversation: () => void;
  onCloseConversation: () => void;
  onBack: () => void;
  onTransferConversation: (advisorId: string) => void;
  viewer: AssignmentViewer;
}

export function ChatHeader({
  advisorTargets,
  assignmentBusy,
  canManageBot = true,
  conversation,
  onToggleBot,
  onTakeConversation,
  onCloseConversation,
  onBack,
  onTransferConversation,
  viewer,
}: Props) {
  const { contact, botEnabled, assignedUser } = conversation;
  const [targetSelection, setTargetSelection] = useState({ scope: "", advisorId: "" });
  const isCurrentAdvisor = assignedUser?.id === viewer.id;
  const canTransfer = viewer.isMessagingOwner || isCurrentAdvisor;
  const transferScope = `${conversation.id}:${assignedUser?.id ?? "unassigned"}`;
  const targetId = targetSelection.scope === transferScope ? targetSelection.advisorId : "";
  const targets = useMemo(
    () => advisorTargets.filter((advisor) => advisor.id !== assignedUser?.id),
    [advisorTargets, assignedUser?.id],
  );

  const assignmentLabel = assignedUser
    ? assignedUser.id === viewer.id
      ? "Asignada a ti"
      : `Asignada a ${assignedUser.name}`
    : "Sin asignar";

  return (
    <div className="chat-header">
      <button aria-label="Volver a conversaciones" className="icon-btn chat-header-back" disabled={assignmentBusy} onClick={onBack} type="button">
        <ArrowLeft size={20} />
      </button>
      <div className="chat-header-info">
        <div className="chat-header-avatar">
          {contact.avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img alt={contact.name} src={contact.avatar} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <DynamicAvatar name={contact.name} />
          )}
        </div>
        <div>
          <h3 className="chat-header-name">{contact.name}</h3>
          <div className="chat-header-meta">
            <span>{conversation.channel === "TELEGRAM" ? "Telegram · Super Importaciones" : contact.phone || contact.phoneNormalized || "Sin teléfono"}</span>
          </div>
        </div>
      </div>

      <div className="chat-header-assignment" aria-label={`Asignación: ${assignmentLabel}`}>
        <span className={`chat-assignment-chip${assignedUser ? "" : " is-unassigned"}`}>{assignmentLabel}</span>
        {canTransfer && targets.length > 0 ? (
          <div className="chat-transfer-control">
            <label className="sr-only" htmlFor={`transfer-${conversation.id}`}>Derivar conversación a</label>
            <select
              disabled={assignmentBusy}
              id={`transfer-${conversation.id}`}
              onChange={(event) => setTargetSelection({ scope: transferScope, advisorId: event.target.value })}
              value={targetId}
            >
              <option value="">Derivar a…</option>
              {targets.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
            </select>
            <button
              className="btn btn-outline chat-transfer-button"
              disabled={!targetId || assignmentBusy}
              onClick={() => onTransferConversation(targetId)}
              type="button"
            >
              <ArrowRightLeft size={14} /> Transferir
            </button>
          </div>
        ) : null}
      </div>

      <ConversationStatus conversation={conversation} />

      <div className="chat-header-actions">
        {canManageBot && botEnabled ? (
          <button className="btn btn-outline" disabled={assignmentBusy} onClick={onToggleBot} type="button">
            <StopCircle size={14} /> Pausar Bot
          </button>
        ) : canManageBot ? (
          <button className="btn btn-outline" disabled={assignmentBusy} onClick={onToggleBot} type="button">
            <PlayCircle size={14} /> Activar Bot
          </button>
        ) : null}

        {viewer.isMessagingOwner && !isCurrentAdvisor ? (
          <button className="btn btn-primary" disabled={assignmentBusy} onClick={onTakeConversation} type="button">
            <UserPlus size={14} /> Tomar
          </button>
        ) : null}

        <button aria-label="Cerrar conversación" className="btn btn-outline chat-header-close" disabled={assignmentBusy} onClick={onCloseConversation} title="Cerrar conversación" type="button">
          <CheckCircle size={14} />
        </button>
      </div>
    </div>
  );
}
