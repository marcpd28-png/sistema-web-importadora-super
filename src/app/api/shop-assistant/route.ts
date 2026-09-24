import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { answerRockyShopAssistant } from "@/lib/rocky/shop-assistant";
import { memorySchema, type RockyMemory } from "@/lib/rocky/contracts";
import { createShopAssistantLog } from "@/lib/shop-assistant-log";
import { limitedJson } from "@/lib/rocky/http";

const COOKIE = "rocky_store_context";
const optionalText = (length: number) => z.string().max(length).nullable().optional();
const inputSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  productContextCode: optionalText(64), contextCategorySlug: optionalText(191),
  context: z.object({ sessionId: optionalText(128), lastProductCode: optionalText(64),
    lastCategory: optionalText(191), lastProductId: optionalText(191), lastIntent: optionalText(80),
    budget: z.number().finite().nonnegative().nullable().optional() }).optional(),
  recentMessages: z.array(z.object({ role: z.enum(["assistant", "user"]), text: z.string().max(4000) })).max(6).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await limitedJson(request, 32000));
    const sessionId = input.context?.sessionId || null;
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET_REQUIRED");
    const key = new TextEncoder().encode(secret);
    let previous: RockyMemory | undefined;
    const cookie = request.cookies.get(COOKIE)?.value;
    if (cookie && sessionId) {
      try {
        const { payload } = await jwtVerify(cookie, key, { algorithms: ["HS256"], audience: "rocky-store" });
        if (payload.sessionId === sessionId) previous = memorySchema.parse(payload.memory);
      } catch { /* An expired or invalid context starts a fresh conversation. */ }
    }
    const { reply, memory } = await answerRockyShopAssistant(input, previous);
    await createShopAssistantLog({ sessionId, userMessage: input.message, baseReply: reply.text, finalReply: reply.text,
      intent: reply.meta?.intent, usedOllama: reply.meta?.usedOllama, ollamaModel: reply.meta?.ollamaModel,
      ollamaLatencyMs: reply.meta?.ollamaLatencyMs, productsCount: reply.products?.length || 0,
      productIds: reply.products?.map(p => p.id) });
    const response = NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
    if (sessionId) {
      const token = await new SignJWT({ sessionId, memory: { ...memory, needs: memory.needs.slice(-3), asked: memory.asked.slice(-3) } })
        .setProtectedHeader({ alg: "HS256" }).setAudience("rocky-store").setIssuedAt().setExpirationTime("1h").sign(key);
      response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/shop-assistant", maxAge: 3600 });
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "INPUT_TOO_LARGE") return NextResponse.json({ error: "Consulta demasiado larga." }, { status: 413 });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Escribe una consulta válida de hasta 1200 caracteres." }, { status: 400 });
    console.error("[ROCKY_STORE_ERROR]", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ text: "Rocky no pudo responder en este momento. Intenta de nuevo con el nombre o código del producto.", suggestedPrompts: ["Ver catálogo", "Busco un cargador"] }, { status: 503 });
  }
}
