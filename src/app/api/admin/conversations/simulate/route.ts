import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SIMULATOR_WEBHOOK_PATH = "bc-simulator";

const simulatorInputSchema = z.object({
  content: z.string().trim().min(1).max(1200),
  name: z.string().trim().min(1).max(180).default("Cliente Simulador"),
  phone: z.string().trim().max(32).default("+51 999 888 777"),
  sessionKey: z.string().trim().min(1).max(80).default("default"),
});

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
    const now = new Date();
    const normalizedPhone = normalizeWhatsappPhone(input.phone);
    const externalId = buildSimulatorExternalId(input.sessionKey);
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
    } else if (!conversation.botEnabled || conversation.status !== "AUTOMATICO") {
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
                      {
                        from: externalId,
                        id: externalMessageId,
                        text: { body: input.content },
                        timestamp: String(Math.floor(now.getTime() / 1000)),
                        type: "text",
                      },
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
