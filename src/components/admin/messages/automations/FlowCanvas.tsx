"use client";

import type { Dispatch, SetStateAction } from "react";
import { ReactFlow, Controls, Background, applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FlowNodeCard } from "./nodes/FlowNodeCard";
import type { FlowDefinition, FlowNode } from "@/lib/automations/flow-definition";

const nodeTypes = { trigger: FlowNodeCard, sendMessage: FlowNodeCard, condition: FlowNodeCard, catalog: FlowNodeCard, handoff: FlowNodeCard };
export function FlowCanvas({ flow, onChange, onSelect, disabled }: {
  flow: FlowDefinition; onChange: Dispatch<SetStateAction<FlowDefinition>>; onSelect: (id: string | null) => void; disabled: boolean;
}) {
  return <div className="automation-canvas" aria-label="Diagrama del flujo">
    <ReactFlow<FlowNode>
      nodes={flow.nodes.map((node) => node.type === "trigger" ? { ...node, deletable: false } : node)} edges={flow.edges} nodeTypes={nodeTypes}
      onNodesChange={(changes) => { if (!disabled) onChange((current) => {
        const nodes = applyNodeChanges(changes, current.nodes);
        const ids = new Set(nodes.map((n) => n.id));
        return { nodes, edges: current.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
      }); }}
      onEdgesChange={(changes) => { if (!disabled) onChange((current) => ({ ...current, edges: applyEdgeChanges(changes, current.edges) })); }}
      onConnect={(connection) => { if (!disabled) onChange((current) => ({ ...current, edges: addEdge(connection, current.edges) })); }}
      onNodeClick={(_, node) => onSelect(node.id)} onPaneClick={() => onSelect(null)}
      nodesDraggable={!disabled} nodesConnectable={!disabled} edgesReconnectable={false}
      deleteKeyCode={disabled ? null : ["Backspace", "Delete"]} fitView minZoom={0.3} maxZoom={1.5}
    >
      <Controls showInteractive={false} /><Background gap={20} size={1} />
    </ReactFlow>
  </div>;
}
