import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { MessageType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { triggerPusherEvent } from "./pusher-server";
import { normalizeYCloudPhone, sendYCloudOutboundMessage, YCloudOutboundMessageInput } from "./ycloud-outbound";

type Turn = { conversationId: string; triggerMessageId: string; conversationRevision: number; globalRevision: number };
type Reply = { conversationId: string; recipient: string; content: string; source: string; mediaUrl?: string; type?: YCloudOutboundMessageInput["type"] };
type Tx = Prisma.TransactionClient;
const turnContext = new AsyncLocalStorage<Turn>();
const REPLY_TTL_MS = 5 * 60_000;
const DEDUPE_MS = 30 * 60_000;
// All workers contend for one database-backed lock, including across hosts.
const SENDER_LOCK = 72602502;

export class AutomationCancelledError extends Error {
  constructor() { super("Automatic reply cancelled by conversation control"); }
}

/** The only automatic WhatsApp transport. Producers persist intent; the worker
 * revalidates control immediately before delivery. Network outcomes that cannot
 * be proved are never retried automatically. */
export class RockyOutbox {
  constructor(
    private db: PrismaClient,
    private deliver = sendYCloudOutboundMessage,
    private notify = triggerPusherEvent,
  ) {}

  async captureTurn(conversationId: string, triggerMessageId: string): Promise<Turn | null> {
    const [conversation, settings] = await Promise.all([
      this.db.conversation.findUnique({ where: { id: conversationId } }),
      this.db.storeSettings.findUnique({ where: { id: 1 } }),
    ]);
    if (!settings?.botMasterSwitch || !conversation?.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") return null;
    return { conversationId, triggerMessageId, conversationRevision: conversation.automationRevision, globalRevision: settings.automationRevision };
  }

  async runTurn<T>(conversationId: string, triggerMessageId: string, work: () => Promise<T>, cancelled: T): Promise<T> {
    const turn = await this.captureTurn(conversationId, triggerMessageId);
    if (!turn) return cancelled;
    try { return await turnContext.run(turn, work); }
    catch (error) {
      if (error instanceof AutomationCancelledError) return cancelled;
      throw error;
    }
  }

  private currentTurn(conversationId: string) {
    const turn = turnContext.getStore();
    if (!turn || turn.conversationId !== conversationId) throw new AutomationCancelledError();
    return turn;
  }

  private async permitted(tx: Tx, turn: Turn, kind = "reply") {
    // Consistent lock order. Locks are released BEFORE network IO so taking a
    // chat never waits for the provider. Already-in-flight messages cannot be recalled.
    await tx.$queryRaw`SELECT id FROM "StoreSettings" WHERE id = 1 FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${turn.conversationId} FOR UPDATE`;
    const settings = await tx.storeSettings.findUnique({ where: { id: 1 } });
    const conversation = await tx.conversation.findUnique({ where: { id: turn.conversationId }, include: { contact: true } });
    if (!settings?.botMasterSwitch || settings.automationRevision !== turn.globalRevision ||
        !conversation || conversation.automationRevision !== turn.conversationRevision ||
        conversation.assignedUserId || conversation.contact.externalId?.startsWith("SIMULATOR:")) return false;
    if (kind === "handoff") {
      if (conversation.botEnabled || conversation.status !== "REQUIERE_ASESOR") return false;
    } else if (!conversation.botEnabled || conversation.status !== "AUTOMATICO") return false;
    const latest = await tx.chatMessage.findFirst({
      where: { conversationId: turn.conversationId, senderType: "CUSTOMER", direction: "INBOUND" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true },
    });
    return latest?.id === turn.triggerMessageId;
  }

  async assertCurrent(conversationId: string) {
    const turn = this.currentTurn(conversationId);
    if (!await this.db.$transaction(tx => this.permitted(tx, turn))) throw new AutomationCancelledError();
  }

  private async persist(tx: Tx, turn: Turn, input: Reply, kind = "reply") {
    const recipient = normalizeYCloudPhone(input.recipient);
    if (!recipient) throw new Error("Invalid automatic recipient");
    const contact = await tx.conversation.findUniqueOrThrow({ where: { id: input.conversationId }, include: { contact: true } });
    const expectedRecipient = normalizeYCloudPhone(contact.contact.phoneNormalized ?? contact.contact.phone ?? contact.contact.externalId);
    if (recipient !== expectedRecipient) throw new Error("Automatic recipient does not match conversation");
    const type = input.type ?? "text";
    const fingerprint = createHash("sha256").update(JSON.stringify([type, input.content, input.mediaUrl ?? null])).digest("hex");
    const duplicate = await tx.rockyOutboundJob.findFirst({ where: {
      conversationId: input.conversationId, fingerprint, state: { not: "cancelled" },
      createdAt: { gte: new Date(Date.now() - DEDUPE_MS) },
    } });
    if (duplicate) return null;
    const message = await tx.chatMessage.create({ data: {
      conversationId: input.conversationId, direction: "OUTBOUND", senderType: "BOT",
      messageType: type.toUpperCase() as MessageType, content: input.content, mediaUrl: input.mediaUrl,
      status: "queued", metadata: { provider: "ycloud", source: input.source, dispatcher: "rocky-outbox-v1" },
    } });
    await tx.rockyOutboundJob.create({ data: {
      ...turn, messageId: message.id, recipient, fingerprint, kind, expiresAt: new Date(Date.now() + REPLY_TTL_MS),
    } });
    await tx.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: message.createdAt } });
    return message;
  }

  async enqueue(input: Reply) {
    const turn = this.currentTurn(input.conversationId);
    const message = await this.db.$transaction(async tx => {
      if (!await this.permitted(tx, turn)) throw new AutomationCancelledError();
      return this.persist(tx, turn, input);
    });
    if (message) this.notify(`chat-${input.conversationId}`, "new-message", message);
    return message;
  }

  async handoff(input: Reply) {
    const turn = this.currentTurn(input.conversationId);
    const message = await this.db.$transaction(async tx => {
      if (!await this.permitted(tx, turn)) throw new AutomationCancelledError();
      const paused = await tx.conversation.update({ where: { id: input.conversationId }, data: { botEnabled: false, status: "REQUIERE_ASESOR" } });
      // The one handoff notice belongs to the NEW paused generation. It cannot
      // grant permission to other replies or survive a subsequent human takeover.
      return this.persist(tx, { ...turn, conversationRevision: paused.automationRevision }, input, "handoff");
    });
    if (message) this.notify(`chat-${input.conversationId}`, "new-message", message);
  }

  private async finishUncertain(id: string, reason: string) {
    await this.db.$transaction(async tx => {
      const initial = await tx.rockyOutboundJob.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${initial.conversationId} FOR UPDATE`;
      const job = await tx.rockyOutboundJob.findUniqueOrThrow({ where: { id } });
      // A signed provider callback can have resolved the outcome already.
      if (job.state !== "sending") return;
      await tx.conversation.updateMany({ where: { id: job.conversationId, automationRevision: job.conversationRevision, botEnabled: true, assignedUserId: null }, data: { botEnabled: false, status: "REQUIERE_ASESOR" } });
      await tx.rockyOutboundJob.update({ where: { id }, data: { state: "uncertain", reason, finishedAt: new Date() } });
      await tx.chatMessage.update({ where: { id: job.messageId }, data: { status: "uncertain" } });
    });
  }

  async tick() {
    // This transaction holds ONLY an advisory lock during provider IO. Row locks
    // are in the short inner transactions, never held while an advisor intervenes.
    return this.db.$transaction(async lock => {
      const [acquired] = await lock.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${SENDER_LOCK}) AS locked`;
      if (!acquired.locked) return false;
      const abandoned = await this.db.rockyOutboundJob.findMany({ where: { state: "sending" }, select: { id: true } });
      for (const job of abandoned) await this.finishUncertain(job.id, "sender_interrupted_no_automatic_retry");
      const candidate = await this.db.rockyOutboundJob.findFirst({ where: { state: "queued" }, orderBy: { sequence: "asc" } });
      if (!candidate) return false;
      const job = await this.db.$transaction(async tx => {
        const allowed = await this.permitted(tx, candidate, candidate.kind);
        const current = await tx.rockyOutboundJob.findUniqueOrThrow({ where: { id: candidate.id }, include: { message: true } });
        if (current.state !== "queued") return null;
        if (!allowed || current.expiresAt.getTime() <= Date.now()) {
          await tx.rockyOutboundJob.update({ where: { id: current.id }, data: { state: "cancelled", reason: "stale_or_control_changed", finishedAt: new Date() } });
          await tx.chatMessage.update({ where: { id: current.messageId }, data: { status: "cancelled" } });
          return null;
        }
        await tx.rockyOutboundJob.update({ where: { id: current.id }, data: { state: "sending", startedAt: new Date() } });
        await tx.chatMessage.update({ where: { id: current.messageId }, data: { status: "sending" } });
        return current;
      });
      if (!job) return true;
      try {
        const sent = await this.deliver({ recipient: job.recipient, content: job.message.content, mediaUrl: job.message.mediaUrl,
          type: job.message.messageType.toLowerCase() as YCloudOutboundMessageInput["type"], externalId: job.messageId });
        await this.db.$transaction(async tx => {
          await tx.rockyOutboundJob.updateMany({ where: { id: job.id, state: "sending" }, data: { state: "submitted", finishedAt: new Date() } });
          await tx.chatMessage.updateMany({ where: { id: job.messageId, status: "sending" }, data: { status: "accepted", externalMessageId: sent.messageId } });
        });
      } catch {
        await this.finishUncertain(job.id, "provider_outcome_unconfirmed_no_automatic_retry");
      }
      const updated = await this.db.chatMessage.findUnique({ where: { id: job.messageId } });
      this.notify(`chat-${job.conversationId}`, "new-message", updated);
      return true;
    }, { timeout: 35_000, maxWait: 5_000 });
  }
}

export const rockyOutbox = new RockyOutbox(prisma);
