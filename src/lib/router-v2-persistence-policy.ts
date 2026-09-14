export function shouldPersistRouterV2State(input: {
  botEnabled: boolean;
  finalAction: string;
  proposedStatePatch: Record<string, unknown>;
}) {
  if (!input.botEnabled) return false;

  if (input.finalAction === "HUMAN_HANDOFF") {
    return false;
  }

  return Object.keys(input.proposedStatePatch).length > 0;
}
