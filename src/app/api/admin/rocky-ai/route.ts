import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { messengerSuperBotCompatible } from "@/lib/messenger-control";
import { approveDraft, audit, configureConversation, conversationStatus, discardDraft, emergencyStop, generateDraft, saveSettings, settings, simulateSuperBot } from "@/lib/rocky-ai/service";
import { targetSchema, targetKey, modes, simulationHistorySchema } from "@/lib/rocky-ai/policy";
import { analyzeVisualEvidence } from "@/lib/rocky-ai/visual-evidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const actions = z.discriminatedUnion("action", [
  targetSchema.extend({ action: z.literal("configure"), mode: z.enum(modes), humanControl: z.boolean() }),
  targetSchema.extend({ action: z.literal("generate") }),
  targetSchema.extend({ action: z.literal("analyze_visual"), triggerId: z.string().min(1).max(180) }),
  z.object({ action: z.literal("approve"), draftId: z.string().uuid(), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("discard"), draftId: z.string().uuid() }),
  z.object({ action: z.literal("settings"), settings: z.unknown() }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("simulate_live"), history: simulationHistorySchema }),
]);
function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Revisa los campos del formulario." }, { status: 400 });
  const message = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    OPENAI_NOT_CONFIGURED_OR_DISABLED: "Configura OPENAI_API_KEY en el servidor y activa Super Bot.",
    OPENAI_NOT_CONFIGURED: "No se detectó una clave de OpenAI en el servidor.",
    OPENAI_HTTP_400: "OpenAI rechazó la estructura de la prueba. Revisa la configuración técnica del simulador.",
    OPENAI_HTTP_401: "OpenAI rechazó la clave configurada en el servidor. Reemplázala por una clave activa.",
    OPENAI_HTTP_403: "La clave de OpenAI no tiene permiso para usar el modelo configurado.",
    OPENAI_HTTP_429: "OpenAI rechazó la prueba por límite o saldo. Revisa la cuenta de OpenAI.",
    OPENAI_INCOMPLETE: "OpenAI no completó la respuesta de prueba. Inténtalo nuevamente.",
    OPENAI_UNAVAILABLE: "No se pudo conectar con OpenAI. Inténtalo nuevamente.",
    UNVERIFIED_PRODUCT: "No se pudo confirmar ese producto en el catálogo. Indica el nombre o código exacto.",
    SIMULATION_LIMIT: "Se alcanzó el límite diario de pruebas para este administrador.",
    SIMULATION_USER_REQUIRED: "Escribe al menos un mensaje de cliente para probar Super Bot.",
    GLOBAL_AUTOMATION_DISABLED: "Activa primero las respuestas automáticas globales en Configuración de mensajes.",
    MODE_OFF: "Selecciona un modo de IA antes de generar una sugerencia.",
    DRAFT_EXPIRED: "La sugerencia perdió vigencia. Genera otra antes de enviar.",
    DRAFT_ALREADY_PROCESSED: "Esta sugerencia ya fue procesada.",
    CONTEXT_CHANGED: "Llegó un mensaje nuevo. Genera otra sugerencia.",
    CONTROL_CHANGED: "Cambió el control de la conversación.",
    DAILY_LIMIT: "Se alcanzó el límite diario de uso.",
    MESSENGER_CONTROL_REQUIRED: "Configura el control de Messenger antes de activar IA.",
    MESSENGER_SUPER_BOT_INCOMPATIBLE: "Messenger Super Bot sigue apagado: configura sus accesos privados y confirma la compatibilidad del canal en el servidor.",
    CHANNEL_NOT_OWNED: "No se pudo confirmar el control exclusivo del canal.",
  };
  return NextResponse.json({ error: known[message] ?? "No se pudo completar la operación. Revisa la conexión y el control del canal." }, { status: 409 });
}
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Acceso no autorizado." }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.has("externalId")) {
      const target = targetSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      return NextResponse.json(await conversationStatus(target.channel, target.externalId), { headers: { "Cache-Control": "no-store" } });
    }
    const config = await settings();
    const day = new Date(new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10) + "T05:00:00Z");
    const [usage, drafts, events, conversations] = await Promise.all([
      prisma.rockyAiUsage.aggregate({ where: { createdAt: { gte: day } }, _count: true, _sum: { inputTokens: true, outputTokens: true, reservedTokens: true } }),
      prisma.rockyAiDraft.groupBy({ by: ["state"], _count: true }),
      prisma.rockyAiAudit.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.rockyAiConversation.findMany({ orderBy: { updatedAt: "desc" }, take: 50 }),
    ]);
    return NextResponse.json({ config, configured: Boolean(process.env.OPENAI_API_KEY), messengerSuperBotCompatible: messengerSuperBotCompatible(), usage, drafts, events, conversations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session?.role !== "ADMIN") return NextResponse.json({ error: "Acceso no autorizado." }, { status: 401 });
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!["http:", "https:"].includes(origin.protocol) || origin.host !== request.headers.get("host")?.toLowerCase()) throw new Error();
  } catch { return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 }); }
  try {
    if (Number(request.headers.get("content-length") || 0) > 20000) return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
    const action = actions.parse(await request.json());
    const actor = session.userId;
    switch (action.action) {
      case "settings": await saveSettings(action.settings, actor); break;
      case "stop": await emergencyStop(actor); break;
      case "configure": await configureConversation(action.channel, action.externalId, action.mode, action.humanControl, actor); break;
      case "generate": {
        const draft = await generateDraft(targetKey(action.channel, action.externalId), actor, true);
        if (!draft) return NextResponse.json({ error: "Ya se está procesando esta conversación." }, { status: 409 });
        break;
      }
      case "analyze_visual": {
        const conversationId = targetKey(action.channel, action.externalId);
        const evidence = await analyzeVisualEvidence({ conversationId, channel: action.channel, externalId: action.externalId, triggerId: action.triggerId });
        await audit(actor, "visual_analysis", conversationId, { triggerId: action.triggerId, status: evidence.status, failureCode: evidence.failureCode });
        return NextResponse.json({ ok: true, evidence }, { headers: { "Cache-Control": "no-store" } });
      }
      case "approve": {
        if (!await approveDraft(action.draftId, action.text, actor)) return NextResponse.json({ error: "La conversación está ocupada. Actualiza su estado." }, { status: 409 });
        break;
      }
      case "discard": await discardDraft(action.draftId, actor); break;
      case "simulate_live": {
        const simulation = await simulateSuperBot(action.history, actor);
        const generatedPdf = Boolean(simulation.catalog?.documents?.length);
        return NextResponse.json({ ...simulation, simulation: true,
          notice: generatedPdf ? "PDF de prueba generado. No se envió ningún mensaje ni se activó un canal." : "Prueba real de OpenAI y catálogo actual. No se envió ningún mensaje ni se activó un canal.",
        }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
