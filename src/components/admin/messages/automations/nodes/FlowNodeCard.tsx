import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch, MessageCircle, PackageSearch, UserRound, Zap } from "lucide-react";
import { nodeLabels, type FlowNode } from "@/lib/automations/flow-definition";

const icons = { trigger: Zap, sendMessage: MessageCircle, condition: GitBranch, catalog: PackageSearch, handoff: UserRound };
export function FlowNodeCard({ data, type = "sendMessage", selected }: NodeProps<FlowNode>) {
  const Icon = icons[type];
  const preview = type === "trigger" ? (data.matchMode === "keyword" ? `Si contiene: ${data.keywords || "…"}` : "Cualquier mensaje de texto")
    : type === "condition" ? data.keywords || "Define las palabras clave"
      : type === "catalog" ? `Buscar: ${data.query || "{{mensaje}}"} · ${data.limit || 3} productos` : data.messageContent || "Escribe una respuesta";
  return (
    <div className={`automation-node is-${type}${selected ? " is-selected" : ""}`}>
      {type !== "trigger" && <Handle type="target" position={Position.Top} />}
      <div className="automation-node-title"><Icon size={17} /><strong>{data.label || nodeLabels[type]}</strong></div>
      <p>{preview}</p>
      {type === "condition" ? <>
        <div className="automation-branches"><span>Sí</span><span>No</span></div>
        <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "25%" }} />
        <Handle type="source" position={Position.Bottom} id="no" style={{ left: "75%" }} />
      </> : type !== "handoff" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
