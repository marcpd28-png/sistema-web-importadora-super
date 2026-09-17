import { z } from "zod";
import type { Edge, Node } from "@xyflow/react";

export const nodeKinds = ["trigger", "sendMessage", "condition", "catalog", "handoff"] as const;
export type NodeKind = (typeof nodeKinds)[number];
export type FlowNodeData = {
  label?: string;
  messageContent?: string;
  keywords?: string;
  matchMode?: "always" | "keyword";
  query?: string;
  limit?: number;
};
export type FlowNode = Node<FlowNodeData, NodeKind>;
export type FlowDefinition = { nodes: FlowNode[]; edges: Edge[] };

export const flowSchema = z.object({
  nodes: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    type: z.enum(nodeKinds),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    data: z.object({
      label: z.string().max(80).optional(),
      messageContent: z.string().max(3000).optional(),
      keywords: z.string().max(500).optional(),
      matchMode: z.enum(["always", "keyword"]).optional(),
      query: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(5).optional(),
    }),
  })).max(24),
  edges: z.array(z.object({
    id: z.string().max(180), source: z.string().max(80), target: z.string().max(80),
    sourceHandle: z.string().nullable().optional(), targetHandle: z.string().nullable().optional(),
  })).max(48),
});

export const nodeLabels: Record<NodeKind, string> = {
  trigger: "Mensaje recibido", sendMessage: "Enviar respuesta", condition: "Según el mensaje",
  catalog: "Consultar productos", handoff: "Derivar a un asesor",
};

export function createFlowNode(type: NodeKind, id: string, x: number, y: number): FlowNode {
  return {
    id, type, position: { x, y }, data: {
      label: nodeLabels[type],
      ...(type === "trigger" ? { matchMode: "always" as const, keywords: "" } : {}),
      ...(type === "sendMessage" ? { messageContent: "¡Hola, {{nombre}}! Bienvenido a Importadora Super. ¿Qué producto estás buscando?" } : {}),
      ...(type === "condition" ? { keywords: "asesor, persona, ayuda" } : {}),
      ...(type === "catalog" ? { query: "{{mensaje}}", limit: 3 } : {}),
      ...(type === "handoff" ? { messageContent: "Te derivaré a un asesor para continuar con tu consulta." } : {}),
    },
  };
}

export function createFlowTemplate(template: "welcome" | "sales" = "welcome"): FlowDefinition {
  if (template === "welcome") return {
    nodes: [createFlowNode("trigger", "start", 250, 40), createFlowNode("sendMessage", "welcome", 250, 220)],
    edges: [{ id: "start-welcome", source: "start", target: "welcome" }],
  };
  return {
    nodes: [
      createFlowNode("trigger", "start", 280, 0),
      createFlowNode("condition", "advisor", 280, 160),
      createFlowNode("handoff", "handoff", 0, 360),
      { ...createFlowNode("condition", "greeting", 530, 360), data: { label: "¿Es un saludo?", keywords: "hola, buenos días, buenas tardes, buenas noches" } },
      createFlowNode("sendMessage", "welcome", 280, 560),
      createFlowNode("catalog", "products", 800, 560),
    ],
    edges: [
      { id: "start-advisor", source: "start", target: "advisor" },
      { id: "advisor-yes", source: "advisor", sourceHandle: "yes", target: "handoff" },
      { id: "advisor-no", source: "advisor", sourceHandle: "no", target: "greeting" },
      { id: "greeting-yes", source: "greeting", sourceHandle: "yes", target: "welcome" },
      { id: "greeting-no", source: "greeting", sourceHandle: "no", target: "products" },
    ],
  };
}

export function validateFlow(flow: FlowDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set(flow.nodes.map((n) => n.id));
  const triggers = flow.nodes.filter((n) => n.type === "trigger");
  if (ids.size !== flow.nodes.length) errors.push("Hay bloques con identificadores repetidos.");
  if (new Set(flow.edges.map((e) => e.id)).size !== flow.edges.length) errors.push("Hay conexiones repetidas.");
  if (triggers.length !== 1) errors.push("El flujo debe tener exactamente un inicio.");
  if (flow.nodes.length < 2) errors.push("Añade al menos una acción después del inicio.");
  if (flow.nodes.filter((n) => ["sendMessage", "catalog", "handoff"].includes(n.type!)).length > 8) errors.push("Usa como máximo ocho acciones por flujo.");
  for (const edge of flow.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push("Hay una conexión a un bloque que ya no existe.");
    if (triggers.some((t) => t.id === edge.target)) errors.push("El inicio no puede recibir conexiones.");
  }
  for (const node of flow.nodes) {
    const outgoing = flow.edges.filter((e) => e.source === node.id);
    const label = node.data.label || nodeLabels[node.type!];
    if (["sendMessage", "handoff"].includes(node.type!) && !node.data.messageContent?.trim()) errors.push(`${label}: escribe una respuesta.`);
    if ((node.type === "condition" || (node.type === "trigger" && node.data.matchMode === "keyword")) && !node.data.keywords?.split(",").some((s) => s.trim())) errors.push(`${label}: escribe palabras clave separadas por comas.`);
    if (node.type === "catalog" && !node.data.query?.trim()) errors.push(`${label}: escribe una búsqueda o usa {{mensaje}}.`);
    for (const text of [node.data.messageContent, node.data.query]) {
      for (const match of (text || "").matchAll(/{{\s*([^}]+?)\s*}}/g)) {
        if (!["nombre", "mensaje"].includes(match[1])) errors.push(`${label}: la variable {{${match[1]}}} no está disponible.`);
      }
    }
    if (node.type === "condition") {
      if (outgoing.length !== 2 || outgoing.filter((e) => e.sourceHandle === "yes").length !== 1 || outgoing.filter((e) => e.sourceHandle === "no").length !== 1) errors.push(`${label}: conecta las salidas Sí y No.`);
    } else if (node.type === "handoff" ? outgoing.length > 0 : outgoing.length > 1) {
      errors.push(`${label}: ${node.type === "handoff" ? "la derivación debe cerrar el flujo" : "usa una sola salida"}.`);
    }
    if (node.type === "trigger" && outgoing.length !== 1) errors.push("Conecta el inicio con el siguiente bloque.");
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function walk(id: string) {
    if (visiting.has(id)) { errors.push("El flujo contiene un ciclo. Conecta los bloques sin volver a un paso anterior."); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of flow.edges.filter((e) => e.source === id)) walk(edge.target);
    visiting.delete(id); visited.add(id);
  }
  if (triggers[0]) walk(triggers[0].id);
  if (flow.nodes.some((n) => !visited.has(n.id))) errors.push("Hay bloques desconectados del inicio.");
  return [...new Set(errors)];
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesKeywords(message: string, keywords: string) {
  const text = ` ${normalized(message)} `;
  return keywords.split(",").some((keyword) => {
    const word = normalized(keyword);
    return word.length > 0 && text.includes(` ${word} `);
  });
}

export function renderFlowText(template: string, input: { name: string; message: string }) {
  return template.replace(/{{\s*(nombre|mensaje)\s*}}/g, (_, key: string) => key === "nombre" ? input.name : input.message);
}
