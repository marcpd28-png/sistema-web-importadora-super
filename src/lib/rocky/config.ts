import { z } from "zod";

const number = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = z.coerce.number().min(min).max(max).safeParse(value);
  return value?.trim() && parsed.success ? parsed.data : fallback;
};
/** Trusted server configuration only; never merge customer/model data into this object. */
export function rockyConfig(env: Record<string, string | undefined> = process.env) {
  const handoff = number(env.ROCKY_HANDOFF_THRESHOLD, 0.3, 0, 1);
  const assisted = Math.max(handoff, number(env.ROCKY_ASSISTED_THRESHOLD, 0.6, 0, 1));
  return {
    model: env.ROCKY_MODEL?.trim() || "qwen3.5:9b",
    embeddingModel: env.ROCKY_EMBEDDING_MODEL?.trim() || "qwen3-embedding:0.6b",
    autonomyLevel: Math.floor(number(env.ROCKY_AUTONOMY_LEVEL, 2, 0, 4)),
    thresholds: { handoff, assisted, auto: Math.max(assisted, number(env.ROCKY_AUTO_RESPONSE_THRESHOLD, 0.85, 0, 1)) },
    toolTimeoutMs: number(env.ROCKY_TOOL_TIMEOUT_MS, 15000, 100, 60000),
  };
}
