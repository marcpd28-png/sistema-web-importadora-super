import { prisma } from "@/lib/prisma";
import { requireRealManychatSubscriber } from "@/lib/messages-service";
import { N8nOutboundError, sendN8nOutboundMessage } from "@/lib/n8n-outbound";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { flowSchema, matchesKeywords } from "./flow-definition";
import { runFlow, type FlowReply } from "./flow-runtime";
import { searchFlowCatalog } from "./catalog";
import { signExecution } from "./execution-auth";
import { workflowPath } from "./FlowCompiler";
import { N8nAutomationProvider } from "./n8n-provider";
import { AutomationError } from "./http";
import { lockAutomation } from "./service";
import { isBcLiveContact } from "../bc-live-policy";

class ExecutionStopped extends Error {}

async function liveContext(executionId: string) {
  const execution = await prisma.automationExecution.findUnique({ where: { id: executionId }, include: {
    automation: true, version: true, conversation: { include: { contact: true } },
  } });
  const settings = await prisma.storeSettings.findFirst({ select: { botMasterSwitch: true } });
  const conversation = execution?.conversation;
  if (process.env.AUTOMATIONS_WHATSAPP_ENABLED !== "true" || settings?.botMasterSwitch === false ||
    !execution || execution.automation.status !== "ACTIVE" || execution.status !== "RUNNING" ||
    execution.automation.currentPublishedVersionId !== execution.automationVersionId ||
    !conversation?.botEnabled || conversation.status !== "AUTOMATICO" || conversation.assignedUserId ||
    conversation.contact.externalId?.startsWith("SIMULATOR:") || isBcLiveContact(conversation.contact)) {
    throw new ExecutionStopped("La atención automática está pausada o la conversación pasó a un asesor.");
  }
  return { execution, conversation };
}

async function deliverReply(executionId: string, reply: FlowReply) {
  const { execution, conversation } = await liveContext(executionId);
  const requestId = `flow-${executionId}-${reply.nodeId}`;
  const message = await prisma.chatMessage.create({ data: {
    conversationId: conversation.id, content: reply.content, direction: "OUTBOUND", senderType: "BOT", messageType: "TEXT",
    status: "pending", metadata: { requestId, automationExecutionId: executionId },
  } });
  try {
    const manychatSubscriberId = requireRealManychatSubscriber(conversation.contact);
    const sent = await sendN8nOutboundMessage({
      agentId: `automation-${execution.automationId}`, channel: "WHATSAPP", content: reply.content,
      conversationId: conversation.id, manychatSubscriberId,
      recipient: conversation.contact.phoneNormalized || conversation.contact.phone || "", requestId, type: "text",
    });
    const delivered = await prisma.chatMessage.update({ where: { id: message.id }, data: {
      status: "sent", externalMessageId: sent.messageId,
      metadata: { requestId, automationExecutionId: executionId, provider: sent.provider },
    } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: delivered.createdAt } });
    triggerPusherEvent(`chat-${conversation.id}`, "new-message", delivered);
  } catch (error) {
    const reason = error instanceof N8nOutboundError ? error.message : "No se pudo confirmar la entrega de la respuesta.";
    const failed = await prisma.chatMessage.update({ where: { id: message.id }, data: { status: "failed", metadata: { requestId, automationExecutionId: executionId, error: reason } } });
    triggerPusherEvent(`chat-${conversation.id}`, "new-message", failed);
    throw new Error(reason);
  } finally {
    if (reply.handoff) {
      await prisma.conversation.updateMany({ where: { id: conversation.id, status: "AUTOMATICO", botEnabled: true }, data: { botEnabled: false, status: "REQUIERE_ASESOR" } });
      triggerPusherEvent(`chat-${conversation.id}`, "conversation-updated", { botEnabled: false, status: "REQUIERE_ASESOR" });
    }
  }
}

export async function executeAutomation(input: { executionId: string; versionId: string; providerExecutionId?: string }) {
  const claim = await prisma.automationExecution.updateMany({
    where: { id: input.executionId, automationVersionId: input.versionId, status: "QUEUED" },
    data: { status: "RUNNING", providerExecutionId: input.providerExecutionId },
  });
  if (!claim.count) {
    const existing = await prisma.automationExecution.findUnique({ where: { id: input.executionId } });
    if (!existing || existing.automationVersionId !== input.versionId) throw new AutomationError("Ejecución no encontrada.", 404);
    if (existing.status === "FAILED") throw new AutomationError("La ejecución anterior falló. No se reenviarán sus mensajes.", 409);
    return { ok: true, duplicate: true, status: existing.status };
  }
  try {
    const { execution, conversation } = await liveContext(input.executionId);
    const message = await prisma.chatMessage.findFirst({ where: { id: execution.messageId || "", conversationId: conversation.id, direction: "INBOUND", messageType: "TEXT" } });
    if (!message) throw new Error("No se encontró el mensaje de entrada.");
    const result = await runFlow(flowSchema.parse(execution.version.flowDefinition), { name: conversation.contact.name || "cliente", message: message.content }, {
      searchCatalog: searchFlowCatalog, deliver: (reply) => deliverReply(execution.id, reply),
    });
    await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: "SUCCESS", finishedAt: new Date() } });
    return { ok: true, status: "SUCCESS", replies: result.replies.length };
  } catch (error) {
    const skipped = error instanceof ExecutionStopped;
    await prisma.automationExecution.update({ where: { id: input.executionId }, data: {
      status: skipped ? "SKIPPED" : "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Falló la ejecución.", finishedAt: new Date(),
    } });
    if (skipped) return { ok: true, status: "SKIPPED" };
    throw new AutomationError("El flujo no pudo completar la atención. Revisa su historial de ejecuciones.", 502);
  }
}

export async function dispatchAutomation(messageId: string) {
  if (process.env.AUTOMATIONS_WHATSAPP_ENABLED !== "true") return;
  let executionId: string | undefined;
  try {
    const queued = await prisma.$transaction(async (tx) => {
      await lockAutomation(tx, `message-${messageId}`);
      const message = await tx.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: { include: { contact: true } } } });
      const conversation = message?.conversation;
      if (!message || message.direction !== "INBOUND" || message.messageType !== "TEXT" || !conversation?.botEnabled || conversation.channel !== "WHATSAPP" || conversation.status !== "AUTOMATICO" || conversation.assignedUserId || conversation.contact.externalId?.startsWith("SIMULATOR:") || isBcLiveContact(conversation.contact)) return null;
      const settings = await tx.storeSettings.findFirst({ select: { botMasterSwitch: true } });
      if (settings?.botMasterSwitch === false) return null;
      const automation = await tx.automation.findFirst({ where: { channel: "WHATSAPP", status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
      if (!automation?.currentPublishedVersionId) return null;
      const version = await tx.automationVersion.findFirst({ where: { id: automation.currentPublishedVersionId, automationId: automation.id, status: "PUBLISHED" } });
      if (!version?.providerWorkflowId) return null;
      const trigger = flowSchema.parse(version.flowDefinition).nodes.find((n) => n.type === "trigger");
      if (trigger?.data.matchMode === "keyword" && !matchesKeywords(message.content, trigger.data.keywords || "")) return null;
      if (await tx.automationExecution.findFirst({ where: { messageId, automationId: automation.id } })) return null;
      return tx.automationExecution.create({ data: {
        messageId, conversationId: conversation.id, automationId: automation.id, automationVersionId: version.id,
        correlationId: `${conversation.id}-${message.id}`, status: "QUEUED",
      } });
    });
    if (!queued) return;
    executionId = queued.id;
    await N8nAutomationProvider.triggerWebhook(workflowPath(queued.automationVersionId), signExecution(queued.id, queued.automationVersionId));
  } catch (error) {
    if (executionId) await prisma.automationExecution.updateMany({ where: { id: executionId, status: { in: ["QUEUED", "RUNNING"] } }, data: {
      status: "FAILED", finishedAt: new Date(), error: "No se pudo confirmar la ejecución en n8n. Revisa la conexión y el historial antes de reintentar.",
    } });
    console.error("[automations] dispatch failed", { executionId, reason: error instanceof Error ? error.message : "Unknown error" });
  }
}
