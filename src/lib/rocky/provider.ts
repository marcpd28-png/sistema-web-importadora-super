import { rockyConfig } from "./config";
import { createHash } from "node:crypto";
import { z } from "zod";
import { planSchema, type LLMMessage, type LLMProvider } from "./contracts";
import { redactSensitiveText } from "./guardrails";

// Shared across both chat and embeddings. Ollama's own queue also bounds multiple web processes.
let active = false;
const embeddingCache = new Map<string, { expires: number; vector: number[] }>();
export async function singleInference<T>(work: () => Promise<T>): Promise<T> {
  if (active) throw new Error("ROCKY_BUSY");
  active = true;
  try { return await work(); } finally { active = false; }
}
export function localOllamaUrl(value = process.env.ROCKY_OLLAMA_URL || "http://127.0.0.1:11434") {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("OLLAMA_MUST_BE_LOCALHOST");
  return url.origin;
}
export class OllamaLocalProvider implements LLMProvider {
  readonly model = rockyConfig().model;
  readonly embeddingModel = rockyConfig().embeddingModel;
  private async call(path: string, body?: unknown) {
    const response = await fetch(`${localOllamaUrl()}/api/${path}`, {
      method: body ? "POST" : "GET", headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(path === "tags" ? 3000 : path === "embed" ? 10000 : 30000),
    });
    if (!response.ok) throw new Error("OLLAMA_UNAVAILABLE");
    return response.json();
  }
  async plan(messages: LLMMessage[]) {
    if (messages.reduce((n, m) => n + m.content.length, 0) > 16000) throw new Error("CONTEXT_TOO_LARGE");
    return singleInference(async () => {
      const raw = await this.call("chat", { model: this.model, messages: messages.map(m => m.role === "system" ? m : { ...m, content: redactSensitiveText(m.content) }), stream: false, think: false,
        format: z.toJSONSchema(planSchema), keep_alive: 0,
        options: { num_ctx: 8192, num_predict: 600, num_thread: 2, temperature: 0 },
      });
      return { plan: planSchema.parse(JSON.parse(raw.message.content)), tokens: { input: Number(raw.prompt_eval_count) || 0, output: Number(raw.eval_count) || 0 } };
    });
  }
  async embed(texts: string[]) {
    if (!texts.length || texts.length > 8 || texts.some(t => t.length > 3000)) throw new Error("EMBEDDING_INPUT_LIMIT");
    const keys = texts.map(text => createHash("sha256").update(`${localOllamaUrl()}\n${this.embeddingModel}\n${text}`).digest("hex"));
    const cached = keys.map(key => embeddingCache.get(key));
    const missing = [...new Set(keys.filter((_, i) => !cached[i] || cached[i]!.expires <= Date.now()))];
    if (!missing.length) return cached.map(row => [...row!.vector]);
    return singleInference(async () => {
      const raw = await this.call("embed", { model: this.embeddingModel, input: missing.map(key => texts[keys.indexOf(key)]), truncate: false, keep_alive: "10s", options: { num_ctx: 8192, num_thread: 2 } });
      const vectors = z.array(z.array(z.number().finite()).length(1024).refine(vector => vector.some(n => n !== 0))).length(missing.length).parse(raw.embeddings);
      missing.forEach((key, i) => embeddingCache.set(key, { vector: vectors[i], expires: Date.now() + 300000 }));
      const result = keys.map((key, i) => [...(missing.includes(key) ? vectors[missing.indexOf(key)] : cached[i]!.vector)]);
      while (embeddingCache.size > 128) embeddingCache.delete(embeddingCache.keys().next().value!);
      return result;
    });
  }
  async health() {
    try {
      const raw = await this.call("tags");
      const models = z.object({ models: z.array(z.object({ name: z.string() })) }).parse(raw).models.map(m => m.name);
      return { ready: models.includes(this.model) && models.includes(this.embeddingModel), models };
    } catch { return { ready: false, models: [] }; }
  }
}
