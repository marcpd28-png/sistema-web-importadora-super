import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const rate = new Map<string, { at: number; count: number }>();
export function internalAuthorized(request: Request) {
  const expected = process.env.N8N_INTERNAL_API_KEY;
  const supplied = request.headers.get("x-internal-api-key");
  return Boolean(expected && supplied && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}
export async function limitedJson(request: Request, maximum = 10000): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maximum) throw new Error("INPUT_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > maximum) { await reader.cancel(); throw new Error("INPUT_TOO_LARGE"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function internalEndpoint(request: Request, work: () => Promise<unknown>) {
  const headers = { "Cache-Control": "no-store" };
  if (!internalAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const key = new URL(request.url).pathname;
  const now = Date.now(); const previous = rate.get(key);
  const current = previous && now - previous.at < 60000 ? previous : { at: now, count: 0 };
  rate.set(key, current);
  if (++current.count > 30) return Response.json({ error: "RATE_LIMIT" }, { status: 429, headers });
  try { return Response.json(await work(), { headers }); }
  catch (error) {
    const validation = error instanceof z.ZodError || error instanceof SyntaxError;
    const code = error instanceof Error ? error.message : "ROCKY_FAILED";
    const safeCodes = ["INPUT_TOO_LARGE", "CONTEXT_CHANGED_RETRY", "NEWER_MESSAGE_RETRY", "INVENTORY_CHANGED_RETRY", "SIMULATOR_REQUIRED", "ROCKY_BUSY", "EMBEDDINGS_UNAVAILABLE", "MESSAGE_NOT_FOUND", "CONVERSATION_NOT_FOUND"];
    return Response.json({ error: validation ? "INVALID_INPUT" : safeCodes.includes(code) ? code : "ROCKY_UNAVAILABLE" }, { status: validation ? 400 : code === "INPUT_TOO_LARGE" ? 413 : code.endsWith("RETRY") ? 409 : 503, headers });
  }
}
