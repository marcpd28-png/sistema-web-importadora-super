import type { RockyResult } from "./contracts";
import { rockyConfig } from "./config";

/** Only an additional restriction. Existing mode/master switch/contact checks remain authoritative. */
export function autonomyDecision(result: RockyResult, config = rockyConfig()) {
  const simple = ["GREETING", "BUSINESS_QUERY", "WARRANTY_QUERY", "DELIVERY_QUERY", "PAYMENT_QUERY", "FOLLOW_UP", "SALES_OBJECTION"];
  const requiredLevel = result.memory.cart ? 3 : simple.includes(result.intent) ? 1 : 2;
  const handoff = result.requiresHuman || result.intent === "UNKNOWN" || result.confidence <= config.thresholds.handoff;
  const allowAuto = !handoff && config.autonomyLevel >= requiredLevel && result.confidence >= config.thresholds.auto;
  return { level: config.autonomyLevel, requiredLevel, allowAuto, handoff,
    decision: handoff ? "HANDOFF" : allowAuto ? "AUTO" : result.confidence >= config.thresholds.assisted ? "ASSISTED" : "CLARIFY",
    reason: handoff ? result.reasonCode || "INSUFFICIENT_CONFIDENCE" : config.autonomyLevel < requiredLevel ? "AUTONOMY_LIMIT" : allowAuto ? "EVIDENCE_SUFFICIENT" : "CONFIDENCE_BELOW_AUTO" };
}
