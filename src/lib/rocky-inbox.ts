import { randomUUID } from "node:crypto";
import { PrismaClient, type RockyInboundTurn } from "@prisma/client";
import { AutomationCancelledError, RockyOutbox } from "./rocky-outbox";

const MAX_ATTEMPTS = 3;

/** Durable input processing is independent of HTTP lifetime and independent
 * of the outbound worker. No provider transport is called by this worker. */
export class RockyInbox {
  constructor(
    private db: PrismaClient,
    private outbox: RockyOutbox,
    private plan: (conversationId: string, triggerMessageId: string, messageIds: string[]) => Promise<unknown>,
  ) {}

  async tick(now = new Date()) {
    const candidates = await this.db.rockyInboundTurn.findMany({ where: { state: { in: ["pending", "running"] }, dueAt: { lte: now } }, orderBy: { dueAt: "asc" }, take: 20 });
    for (const candidate of candidates) if (await this.processCandidate(candidate, now)) return true;
    return false;
  }

  private async processCandidate(candidate: RockyInboundTurn, now: Date) {
    return this.db.$transaction(async lock => {
      const [acquired] = await lock.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${"rocky-input:" + candidate.conversationId}, 2)) AS locked`;
      if (!acquired.locked) return false;
      // Lock per conversation: a slow PDF must not block other customers.
      // A running record without this lock is an interrupted attempt; replacing
      // its token prevents the previous worker from publishing after recovery.
      if (candidate.expiresAt <= now) {
        await this.db.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "StoreSettings" WHERE id = 1 FOR SHARE`;
          await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${candidate.conversationId} FOR UPDATE`;
          const expired = await tx.rockyInboundTurn.updateMany({ where: { conversationId: candidate.conversationId, version: candidate.version, state: { in: ["pending", "running"] } }, data: { state: "cancelled", processingToken: null, reason: "input_expired_manual_review" } });
          if (expired.count) await tx.conversation.updateMany({ where: { id: candidate.conversationId, automationRevision: candidate.conversationRevision, botEnabled: true, assignedUserId: null }, data: { botEnabled: false, status: "REQUIERE_ASESOR" } });
        });
        return true;
      }
      const token = randomUUID();
      const claimed = await this.db.rockyInboundTurn.updateMany({ where: { conversationId: candidate.conversationId, version: candidate.version, state: { in: ["pending", "running"] }, dueAt: { lte: now } }, data: { state: "running", processingToken: token, attempts: { increment: 1 } } });
      if (!claimed.count) return false;
      const attempt = await this.db.rockyInboundTurn.findUniqueOrThrow({ where: { conversationId: candidate.conversationId } });
      if (attempt.processingToken !== token || attempt.version !== candidate.version) return true;
      const where = { conversationId: candidate.conversationId, version: candidate.version, processingToken: token };
      const turn = { ...candidate, inboundVersion: candidate.version };
      const complete = async (tx: Parameters<Parameters<RockyOutbox["runPlannedTurn"]>[2]>[0]) => {
        const completed = await tx.rockyInboundTurn.updateMany({ where: { ...where, expiresAt: { gt: new Date() } }, data: { state: "done", reason: null, processingToken: null } });
        if (!completed.count) throw new AutomationCancelledError();
      };
      const handoff = async () => {
        const conversation = await this.db.conversation.findUniqueOrThrow({ where: { id: candidate.conversationId }, include: { contact: true } });
        const recipient = conversation.contact.phoneNormalized ?? conversation.contact.phone ?? conversation.contact.externalId;
        if (!recipient) throw new Error("MISSING_RECIPIENT");
        await this.outbox.runPlannedTurn(turn, () => this.outbox.handoff({ conversationId: candidate.conversationId, recipient,
          content: "Para ayudarte con tu consulta, te derivo con un asesor. Te atenderemos por este mismo chat lo antes posible.", source: "input_processing_handoff" }), complete);
      };
      try {
        if (attempt.attempts > MAX_ATTEMPTS) await handoff();
        else await this.outbox.runPlannedTurn(turn, () => this.plan(candidate.conversationId, candidate.triggerMessageId, candidate.messageIds), complete);
      } catch (error) {
        if (error instanceof AutomationCancelledError) {
          await this.db.rockyInboundTurn.updateMany({ where, data: { state: "cancelled", reason: "superseded_or_control_changed", processingToken: null } });
        } else if (attempt.attempts >= MAX_ATTEMPTS) {
          try { await handoff(); }
          catch {
            await this.db.rockyInboundTurn.updateMany({ where: { ...where, state: "running" }, data: { state: "pending", dueAt: new Date(now.getTime() + 10_000), processingToken: null, reason: "handoff_retry_pending" } });
          }
        } else {
          await this.db.rockyInboundTurn.updateMany({ where: { ...where, state: "running" }, data: { state: "pending", dueAt: new Date(now.getTime() + 5_000), processingToken: null, reason: "planning_retry_pending" } });
        }
      }
      return true;
    }, { timeout: 180_000, maxWait: 5_000 });
  }
}
