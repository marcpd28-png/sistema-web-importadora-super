import { matchesKeywords, renderFlowText, validateFlow, type FlowDefinition } from "./flow-definition";

export type FlowReply = { nodeId: string; content: string; handoff: boolean };
export type FlowRunResult = { matched: boolean; replies: FlowReply[]; visited: string[]; handoff: boolean };
export type FlowRuntimeDependencies = {
  searchCatalog: (query: string, limit: number) => Promise<string>;
  deliver?: (reply: FlowReply) => Promise<void>;
};

// Preview and live executions use exactly the same traversal and substitutions.
export async function runFlow(flow: FlowDefinition, input: { name: string; message: string }, deps: FlowRuntimeDependencies): Promise<FlowRunResult> {
  const errors = validateFlow(flow);
  if (errors.length) throw new Error(errors.join(" "));
  const result: FlowRunResult = { matched: true, replies: [], visited: [], handoff: false };
  let current = flow.nodes.find((n) => n.type === "trigger");
  if (current?.data.matchMode === "keyword" && !matchesKeywords(input.message, current.data.keywords || "")) return { ...result, matched: false };
  while (current) {
    if (result.visited.includes(current.id)) throw new Error("El flujo contiene un ciclo.");
    result.visited.push(current.id);
    let branch: string | undefined;
    if (current.type === "condition") branch = matchesKeywords(input.message, current.data.keywords || "") ? "yes" : "no";
    if (["sendMessage", "catalog", "handoff"].includes(current.type!)) {
      const content = current.type === "catalog"
        ? await deps.searchCatalog(renderFlowText(current.data.query || "{{mensaje}}", input).slice(0, 120), current.data.limit || 3)
        : renderFlowText(current.data.messageContent || "", input);
      const reply = { nodeId: current.id, content: content.slice(0, 4000), handoff: current.type === "handoff" };
      if (deps.deliver) await deps.deliver(reply);
      result.replies.push(reply);
      if (reply.handoff) { result.handoff = true; break; }
    }
    const edge = flow.edges.find((e) => e.source === current!.id && (branch === undefined || e.sourceHandle === branch));
    current = edge ? flow.nodes.find((n) => n.id === edge.target) : undefined;
  }
  return result;
}
