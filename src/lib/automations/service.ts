import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createFlowTemplate, flowSchema, validateFlow } from "./flow-definition";
import { FlowCompiler } from "./FlowCompiler";
import { N8nAutomationProvider } from "./n8n-provider";
import { automationConfiguration } from "./config";
import { AutomationError } from "./http";

const metadataSchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).default("") });
export const createAutomationSchema = metadataSchema.extend({ template: z.enum(["welcome", "sales"]).default("welcome"), channel: z.literal("WHATSAPP").default("WHATSAPP") });
export const saveAutomationSchema = metadataSchema.extend({
  draftVersionId: z.string().min(1).max(80), currentVersionNumber: z.number().int().positive(), flowDefinition: flowSchema,
}).strict();
export const publishAutomationSchema = z.object({ draftVersionId: z.string().min(1).max(80), currentVersionNumber: z.number().int().positive() }).strict();

export async function lockAutomation(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`automation:${id}`}))`;
}

export async function getAutomation(id: string) {
  const automation = await prisma.automation.findUnique({
    where: { id }, include: {
      versions: { orderBy: { version: "desc" }, take: 10 },
      executions: { orderBy: { startedAt: "desc" }, take: 15 },
    },
  });
  if (!automation) throw new AutomationError("Automatización no encontrada.", 404);
  return { ...automation, configuration: automationConfiguration() };
}

export async function createAutomation(body: unknown) {
  const { template, ...data } = createAutomationSchema.parse(body);
  return prisma.automation.create({ data: {
    ...data, status: "DRAFT", versions: { create: {
      version: 1, status: "DRAFT", flowDefinition: flowSchema.parse(createFlowTemplate(template)),
    } },
  } });
}

export async function saveAutomation(id: string, body: unknown) {
  const input = saveAutomationSchema.parse(body);
  await prisma.$transaction(async (tx) => {
    await lockAutomation(tx, id);
    const saved = await tx.automationVersion.updateMany({
      where: { id: input.draftVersionId, automationId: id, status: "DRAFT", version: input.currentVersionNumber },
      data: { flowDefinition: input.flowDefinition, version: { increment: 1 } },
    });
    if (saved.count !== 1) throw new AutomationError("El borrador cambió o ya fue publicado. Recarga el flujo antes de guardar.", 409);
    await tx.automation.update({ where: { id }, data: { name: input.name, description: input.description } });
  });
  return getAutomation(id);
}

export async function publishAutomation(id: string, body: unknown) {
  const input = publishAutomationSchema.parse(body);
  const configuration = automationConfiguration();
  if (!configuration.publishReady) throw new AutomationError(`Falta configurar: ${configuration.missing.join(", ")}.`, 503);
  let createdWorkflowId: string | undefined;
  let previousWorkflowId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await lockAutomation(tx, id);
      const automation = await tx.automation.findUnique({ where: { id } });
      const draft = await tx.automationVersion.findFirst({ where: {
        id: input.draftVersionId, automationId: id, status: "DRAFT", version: input.currentVersionNumber,
      } });
      if (!automation || !draft) throw new AutomationError("El borrador cambió. Guarda o recarga antes de publicar.", 409);
      const flow = flowSchema.parse(draft.flowDefinition);
      const errors = validateFlow(flow);
      if (errors.length) throw new AutomationError(errors.join(" "));
      if (automation.currentPublishedVersionId) {
        const previous = await tx.automationVersion.findUnique({ where: { id: automation.currentPublishedVersionId } });
        previousWorkflowId = previous?.providerWorkflowId ?? null;
      }
      const workflow = FlowCompiler.compile(automation.name, flow, draft.id, process.env.AUTOMATIONS_CALLBACK_URL!);
      createdWorkflowId = await N8nAutomationProvider.deployWorkflow(workflow);
      await N8nAutomationProvider.toggleWorkflow(createdWorkflowId, true);
      await tx.automationVersion.update({ where: { id: draft.id }, data: {
        status: "PUBLISHED", providerWorkflowId: createdWorkflowId, compiledHash: FlowCompiler.generateDriftHash(workflow),
      } });
      // Publishing is separate from activating customer traffic.
      await tx.automation.update({ where: { id }, data: { status: "PAUSED", currentPublishedVersionId: draft.id } });
      await tx.automationVersion.create({ data: {
        automationId: id, version: draft.version + 1, flowDefinition: flow, status: "DRAFT",
      } });
    }, { timeout: 60_000, maxWait: 5_000 });
  } catch (error) {
    if (createdWorkflowId) await N8nAutomationProvider.deleteWorkflow(createdWorkflowId).catch(() => console.error("[automations] cleanup required", { workflowId: createdWorkflowId }));
    if (error instanceof AutomationError || error instanceof z.ZodError) throw error;
    throw new AutomationError("No se pudo publicar. Revisa la conexión y los permisos de escritura y activación en n8n. El borrador sigue disponible.", 502);
  }
  if (previousWorkflowId) await N8nAutomationProvider.toggleWorkflow(previousWorkflowId, false).catch(() => console.warn("[automations] old workflow cleanup required", { workflowId: previousWorkflowId }));
  return getAutomation(id);
}

export async function changeAutomationStatus(id: string, status: "ACTIVE" | "PAUSED") {
  await prisma.$transaction(async (tx) => {
    await lockAutomation(tx, id);
    await lockAutomation(tx, "channel-WHATSAPP");
    const automation = await tx.automation.findUnique({ where: { id } });
    if (!automation) throw new AutomationError("Automatización no encontrada.", 404);
    if (status === "ACTIVE") {
      const config = automationConfiguration();
      if (!config.liveEnabled) throw new AutomationError("El entorno está en modo de pruebas. La atención automática de WhatsApp aún no está habilitada.", 409);
      if (!config.publishReady || !config.outboundReady) throw new AutomationError("Completa la conexión de publicación y envío antes de activar el flujo.", 503);
      if (!automation.currentPublishedVersionId) throw new AutomationError("Publica una versión antes de activar el flujo.", 409);
      const version = await tx.automationVersion.findFirst({ where: { id: automation.currentPublishedVersionId, automationId: id, status: "PUBLISHED" } });
      if (!version?.providerWorkflowId) throw new AutomationError("La versión publicada no tiene un flujo válido en n8n.", 409);
      const other = await tx.automation.findFirst({ where: { channel: automation.channel, status: "ACTIVE", id: { not: id } } });
      if (other) throw new AutomationError(`Pausa «${other.name}» antes de activar otro flujo en WhatsApp.`, 409);
      const settings = await tx.storeSettings.findFirst({ select: { botMasterSwitch: true } });
      if (settings?.botMasterSwitch === false) throw new AutomationError("Activa el bot global en Configuración antes de activar este flujo.", 409);
    } else if (!automation.currentPublishedVersionId) {
      throw new AutomationError("Este flujo todavía es un borrador.", 409);
    }
    await tx.automation.update({ where: { id }, data: { status } });
  });
  return getAutomation(id);
}
