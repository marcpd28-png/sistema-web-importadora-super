type Environment = Record<string, string | undefined>;

/** Explicit production configuration overrides the legacy pilot, including OFF. */
export function getBcLivePolicy(env: Environment = process.env) {
  const production = env.BC_LIVE_ENABLED !== undefined;
  const enabled = (production ? env.BC_LIVE_ENABLED : env.BC_LIVE_PILOT_ENABLED) === "true";
  const rawStart = production ? env.BC_LIVE_STARTED_AT : env.BC_LIVE_PILOT_STARTED_AT;
  const startedAt = rawStart ? new Date(rawStart) : null;
  const scope = production ? env.BC_LIVE_SCOPE : "ALLOWLIST";
  const phones = [...new Set((production ? env.BC_LIVE_PHONES ?? "" : env.BC_LIVE_PILOT_PHONES ?? "")
    .split(",").map(value => value.trim()).filter(value => /^\d{10,15}$/.test(value)))];
  return {
    enabled: enabled && (scope === "ALL" || scope === "ALLOWLIST" && phones.length > 0),
    scope: scope === "ALL" ? "ALL" as const : "ALLOWLIST" as const,
    phones,
    startedAt: startedAt && Number.isFinite(startedAt.getTime()) ? startedAt : null,
    testMode: production ? env.BC_LIVE_TEST_MODE !== "false" : env.BC_LIVE_PILOT_TEST_MODE === "true",
  };
}

export function isBcLiveContact(contact: { externalId?: string | null; phoneNormalized?: string | null; channel?: string | null }, env: Environment = process.env) {
  const policy = getBcLivePolicy(env);
  if (!policy.enabled || contact.channel && contact.channel !== "WHATSAPP" || contact.externalId?.startsWith("SIMULATOR:") || !/^\d{10,15}$/.test(contact.phoneNormalized ?? "")) return false;
  // Preserve the legacy contact predicate; production additionally requires a start
  // time so inbound routing never hands messages to an unconfigured worker.
  if (env.BC_LIVE_ENABLED !== undefined && (!policy.startedAt || policy.startedAt > new Date())) return false;
  return policy.scope === "ALL" || policy.phones.includes(contact.phoneNormalized!);
}
