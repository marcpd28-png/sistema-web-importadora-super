import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";
import { simulatorInputSchema, simulatorWebhookMessage } from "@/lib/simulator-message";
import { runRocky } from "@/lib/rocky/service";

export const dynamic = "force-dynamic";

const SIMULATOR_WEBHOOK_PATH = "bc-simulator";

export async function GET(request: Request) {
  await requireAdmin();
  const query = new URL(request.url).searchParams;
  const trigger = await prisma.chatMessage.findFirst({
    where: { id: query.get("messageId") || "", conversationId: query.get("conversationId") || "",
      senderType: "CUSTOMER", direction: "INBOUND", conversation: { contact: { externalId: { startsWith: "SIMULATOR:" } } } },
    select: { id: true, conversationId: true, metadata: true },
  });
  if (!trigger) return NextResponse.json({ error: "Consulta simulada no encontrada." }, { status: 404 });
  const run = await prisma.rockyRun.findUnique({ where: { triggerMessageId: trigger.id }, select: { result: true } });
  const metadata = trigger.metadata as Record<string, unknown> | null;
  if (metadata?.simulationError) return NextResponse.json({ error: "Rocky no pudo completar la consulta. Inicia una nueva sesión e inténtalo otra vez." }, { status: 503 });
  const messages = await prisma.chatMessage.findMany({ where: { conversationId: trigger.conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
  return NextResponse.json({ messages: messages.reverse(), rocky: run?.result ?? null }, { headers: { "Cache-Control": "no-store" } });
}

function buildSimulatorExternalId(sessionKey: string) {
  const letters = Array.from(sessionKey)
    .map((character) => String.fromCharCode(97 + (character.charCodeAt(0) % 26)))
    .join("")
    .slice(0, 80);

  return `SIMULATOR:${letters || "session"}`;
}

async function triggerSimulatorWebhook(path: string, payload: unknown) {
  const simulatorBaseUrl = process.env.N8N_SIMULATOR_URL?.trim()
    || process.env.N8N_BASE_URL?.trim() || process.env.N8N_URL?.trim();
  if (!simulatorBaseUrl) throw new Error("Falta configurar N8N_SIMULATOR_URL o N8N_BASE_URL.");

  const endpoint = new URL(`/webhook/${path}`, simulatorBaseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`n8n simulator webhook returned ${response.status}`);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = simulatorInputSchema.parse(await request.json());
    if (input.engine === "ROCKY" && process.env.ROCKY_SIMULATOR_ENABLED !== "true") {
      return NextResponse.json({ error: "Rocky aún no está habilitado en este servidor." }, { status: 503 });
    }
    const now = new Date();
    const normalizedPhone = normalizeWhatsappPhone(input.phone);
    const externalId = buildSimulatorExternalId(input.engine === "ROCKY" ? `rocky:${input.sessionKey}` : input.sessionKey);
    const externalMessageId = `SIM-CUSTOMER-${randomUUID()}`;

    const contact = await prisma.chatContact.upsert({
      where: {
        channel_externalId: {
          channel: "WHATSAPP",
          externalId,
        },
      },
      create: {
        channel: "WHATSAPP",
        externalId,
        name: input.name,
        phone: input.phone,
        phoneNormalized: normalizedPhone,
        tags: ["simulador"],
      },
      update: {
        name: input.name,
        phone: input.phone,
        phoneNormalized: normalizedPhone,
      },
    });

    let conversation = await prisma.conversation.findFirst({
      where: {
        channel: "WHATSAPP",
        contactId: contact.id,
        status: { not: "CERRADO" },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          botEnabled: true,
          channel: "WHATSAPP",
          contactId: contact.id,
          status: "AUTOMATICO",
        },
      });
    } else if (input.engine === "BC" && (!conversation.botEnabled || conversation.status !== "AUTOMATICO")) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          botEnabled: true,
          status: "AUTOMATICO",
        },
      });
    }

    const settings = await prisma.storeSettings.findFirst({
      select: { botMasterSwitch: true },
    });
    if (input.engine === "ROCKY") {
      if (settings?.botMasterSwitch === false) return NextResponse.json({ error: "Bot global apagado en configuración." }, { status: 409 });
      const customerMessage = await prisma.chatMessage.create({ data: {
        conversationId: conversation.id, senderType: "CUSTOMER", direction: "INBOUND", messageType: input.attachment?.type || "TEXT",
        content: input.content, mediaUrl: input.attachment?.dataUrl, externalMessageId,
        metadata: { source: "rocky-simulator", simulation: true },
      } });
      if (input.background) {
        const conversationId = conversation.id;
        after(async () => {
          try { await runRocky({ conversationId, triggerMessageId: customerMessage.id, simulate: true }); }
          catch (error) {
            console.error("[rocky-simulator] failed", error instanceof Error ? error.message : "UnknownError");
            await prisma.chatMessage.update({ where: { id: customerMessage.id }, data: {
              metadata: { source: "rocky-simulator", simulation: true, simulationError: true },
            } });
          }
        });
        const messages = await prisma.chatMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
        return NextResponse.json({ automationError: null, automationExecutionId: null, automationName: "ROCKY", automationTriggered: true,
          conversationId, customerMessageId: customerMessage.id, pendingSince: now.toISOString(), messages: messages.reverse() }, { status: 202 });
      }
      try {
        const rocky = await runRocky({ conversationId: conversation.id, triggerMessageId: customerMessage.id, simulate: true });
        const messages = await prisma.chatMessage.findMany({ where: { conversationId: conversation.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
        return NextResponse.json({ automationError: null, automationExecutionId: rocky.result.rockyRequestId, automationName: "ROCKY", automationTriggered: true,
          conversationId: conversation.id, customerMessageId: customerMessage.id, pendingSince: now.toISOString(), messages: messages.reverse(), rocky: rocky.result });
      } catch {
        return NextResponse.json({ error: "Rocky no pudo completar la consulta. Revisa su estado y vuelve a intentarlo." }, { status: 503 });
      }
    }
    let automationError: string | null = null;
    const automationExecutionId: string | null = null;
    const automationName = "BC - Simulador";
    let automationTriggered = false;

    if (settings?.botMasterSwitch === false) {
      automationError = "Bot global apagado en configuración.";
    } else {
      try {
        await triggerSimulatorWebhook(SIMULATOR_WEBHOOK_PATH, {
          object: "whatsapp_business_account",
          entry: [
            {
              id: "admin-simulator",
              changes: [
                {
                  field: "messages",
                  value: {
                    contacts: [
                      {
                        profile: { name: input.name },
                        wa_id: externalId,
                      },
                    ],
                    messages: [
                      simulatorWebhookMessage(input, {
                        from: externalId,
                        id: externalMessageId,
                        timestamp: String(Math.floor(now.getTime() / 1000)),
                      }),
                    ],
                    metadata: {
                      display_phone_number: input.phone,
                      phone_number_id: "admin-simulator",
                    },
                    messaging_product: "whatsapp",
                    simulation: {
                      conversationId: conversation.id,
                      dryRun: true,
                      executionId: automationExecutionId,
                      phone: input.phone,
                      phoneNormalized: normalizedPhone,
                      sessionKey: input.sessionKey,
                      source: "admin-simulator",
                    },
                  },
                },
              ],
            },
          ],
        });
        automationTriggered = true;
      } catch (error) {
        automationError = error instanceof Error
          ? error.message
          : "No se pudo disparar la automatización de n8n.";
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });

    return NextResponse.json({
      automationError,
      automationExecutionId,
      automationName,
      automationTriggered,
      conversationId: conversation.id,
      customerMessageId: null,
      pendingSince: now.toISOString(),
      messages,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }

    console.error("Simulator error:", error);
    return NextResponse.json({ error: "No se pudo simular la conversación." }, { status: 500 });
  }
}
