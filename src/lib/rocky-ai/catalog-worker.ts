import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { type CatalogPdfPart, type CatalogSnapshotProduct, generateCatalogSnapshotPdfs } from "../catalog-pdf";
import { catalogPartCaption, catalogRetryAt, parseCatalogSnapshot, snapshotProductsForPdf } from "../catalog-generation";
import { messengerSuperBotCompatible } from "../messenger-control";
import { telegramSuperBotBridgeCompatible } from "../telegram-bridge";
import { deliverCatalogDocument, snapshot } from "./adapters";
import { channelRevision, type AiChannel } from "./policy";

const MAX_RENDER_ATTEMPTS = 3;
const LEASE_MS = 30 * 60_000;

type RenderCatalog = (input: { scopeKey: string; title: string; snapshotHash: string; products: CatalogSnapshotProduct[] }) => Promise<CatalogPdfPart[]>;

type JobState = "QUEUED" | "RENDERING" | "READY" | "DELIVERING";

function isActiveState(state: string): state is JobState {
  return ["QUEUED", "RENDERING", "READY", "DELIVERING"].includes(state);
}

function runsOutsideLegacyMaster(channel: string) {
  return channel === "telegram" || channel === "messenger" && messengerSuperBotCompatible();
}

function channelCompatibilityMissing(channel: string) {
  return channel === "telegram" && !telegramSuperBotBridgeCompatible() ||
    channel === "messenger" && !messengerSuperBotCompatible();
}

/**
 * Renders and delivers the immutable PDF snapshot created with a Super Bot
 * draft. Rendering can retry because it has no customer-facing side effect.
 * A document delivery never retries automatically after an ambiguous outcome.
 */
export class RockyAiCatalogWorker {
  constructor(private db: PrismaClient, private renderCatalog: RenderCatalog = generateCatalogSnapshotPdfs) {}

  async tick(now = new Date()) {
    const candidates = await this.db.rockyAiCatalogJob.findMany({
      where: { OR: [
        { state: "QUEUED", dueAt: { lte: now } },
        { state: "RENDERING", leaseExpiresAt: { lte: now } },
        { state: "READY", dueAt: { lte: now } },
        { state: "DELIVERING", leaseExpiresAt: { lte: now } },
      ] },
      orderBy: { sequence: "asc" }, take: 4, select: { id: true },
    });
    for (const candidate of candidates) if (await this.process(candidate.id, now)) return true;
    return false;
  }

  private async process(id: string, now: Date) {
    const claim = await this.claim(id, now);
    if (!claim) return false;
    if (claim.stage === "delivery") return this.deliver(claim.id, claim.token);
    try {
      const snapshot = parseCatalogSnapshot(claim.snapshot);
      const parts = await this.renderCatalog({
        scopeKey: snapshot.scopeKey, title: snapshot.title, snapshotHash: claim.snapshotHash,
        products: snapshotProductsForPdf(snapshot),
      });
      const published = await this.db.$transaction(async tx => {
        const written = await tx.rockyAiCatalogJob.updateMany({
          where: { id: claim.id, state: "RENDERING", processingToken: claim.token },
          data: { state: "READY", processingToken: null, leaseExpiresAt: null, result: { version: 1, parts }, reason: null },
        });
        if (!written.count) return false;
        await tx.rockyAiCatalogDelivery.createMany({
          data: parts.map(part => ({
            jobId: claim.id, partNumber: part.partNumber, documentUrl: part.absoluteUrl, relativeUrl: part.relativeUrl,
            filename: part.filename, byteLength: part.byteLength, productCount: part.productCount,
          })), skipDuplicates: true,
        });
        return true;
      });
      return published;
    } catch (error) {
      await this.retryRender(claim.id, claim.token, now, error);
      return true;
    }
  }

  private async claim(id: string, now: Date) {
    return this.db.$transaction(async tx => {
      const [locked] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`super-bot-catalog:${id}`}, 31)) AS locked`;
      if (!locked.locked) return null;
      const job = await tx.rockyAiCatalogJob.findUnique({ where: { id }, include: { draft: true, conversation: true, deliveries: { select: { state: true } } } });
      if (!job || !isActiveState(job.state)) return null;
      const due = job.state === "QUEUED" || job.state === "READY"
        ? job.dueAt <= now
        : Boolean(job.leaseExpiresAt && job.leaseExpiresAt <= now);
      if (!due) return null;

      const settings = await tx.rockyAiSettings.findUnique({ where: { id: 1 } });
      const legacyMasterRequired = !runsOutsideLegacyMaster(job.conversation.channel);
      const global = !legacyMasterRequired
        ? null
        : await tx.storeSettings.findUnique({ where: { id: 1 }, select: { botMasterSwitch: true } });
      const approvalRequired = !job.draft.approvedBy && job.conversation.humanControl;
      const invalid = job.draft.state !== "SUBMITTED" || !settings?.enabled || settings.revision !== job.settingsRevision ||
        channelRevision(settings?.channelRevisions, job.conversation.channel as AiChannel) !== job.channelRevision ||
        job.conversation.revision !== job.controlRevision || job.conversation.mode === "OFF" || approvalRequired ||
        channelCompatibilityMissing(job.conversation.channel) || legacyMasterRequired && !global?.botMasterSwitch;
      if (invalid) {
        const reason = channelCompatibilityMissing(job.conversation.channel)
          ? "channel_unavailable"
          : legacyMasterRequired && !global?.botMasterSwitch
          ? "global_automation_stopped"
          : "catalog_control_changed";
        await tx.rockyAiCatalogJob.update({ where: { id }, data: { state: "CANCELLED", processingToken: null, leaseExpiresAt: null, reason, finishedAt: now } });
        return null;
      }

      const stage = job.result ? "delivery" as const : "render" as const;
      if (stage === "delivery" && job.deliveries.some(delivery => ["SENDING", "UNCERTAIN"].includes(delivery.state))) {
        await tx.rockyAiCatalogJob.update({ where: { id }, data: { state: "UNCERTAIN", processingToken: null, leaseExpiresAt: null, reason: "catalog_delivery_interrupted", finishedAt: now } });
        await tx.rockyAiConversation.updateMany({ where: { id: job.conversationId }, data: {
          humanControl: true, revision: { increment: 1 }, lastError: "La entrega del catálogo requiere verificación humana.",
        } });
        await tx.rockyAiAudit.create({ data: { actor: "rocky-ai", action: "catalog_delivery_uncertain", conversationId: job.conversationId, detail: { jobId: id } } });
        return null;
      }
      if (stage === "delivery" && job.deliveries.length && job.deliveries.every(delivery => delivery.state === "SUBMITTED")) {
        await tx.rockyAiCatalogJob.update({ where: { id }, data: { state: "SUBMITTED", processingToken: null, leaseExpiresAt: null, reason: null, finishedAt: now } });
        return null;
      }
      if (stage === "render" && job.attempts >= MAX_RENDER_ATTEMPTS) {
        await tx.rockyAiCatalogJob.update({ where: { id }, data: { state: "FAILED", processingToken: null, leaseExpiresAt: null, reason: "catalog_render_attempts_exhausted", finishedAt: now } });
        return null;
      }

      const token = randomUUID();
      const targetState = stage === "render" ? "RENDERING" : "DELIVERING";
      const acquired = await tx.rockyAiCatalogJob.updateMany({ where: { id, state: job.state }, data: {
        state: targetState, processingToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        startedAt: job.startedAt ?? now, ...(stage === "render" ? { attempts: { increment: 1 } } : {}),
      } });
      if (!acquired.count) return null;
      return { id: job.id, token, stage, snapshot: job.snapshot, snapshotHash: job.snapshotHash };
    }, { timeout: 15_000, maxWait: 5_000 });
  }

  private async retryRender(id: string, token: string, now: Date, error: unknown) {
    const job = await this.db.rockyAiCatalogJob.findUnique({ where: { id }, select: { attempts: true, conversationId: true } });
    if (!job) return;
    const exhausted = job.attempts >= MAX_RENDER_ATTEMPTS;
    const changed = await this.db.rockyAiCatalogJob.updateMany({ where: { id, state: "RENDERING", processingToken: token }, data: exhausted
      ? { state: "FAILED", processingToken: null, leaseExpiresAt: null, reason: "catalog_render_attempts_exhausted", finishedAt: now }
      : { state: "QUEUED", processingToken: null, leaseExpiresAt: null, dueAt: catalogRetryAt(now, job.attempts), reason: error instanceof Error ? "catalog_render_retry_pending" : "catalog_render_retry_unknown" },
    });
    if (!exhausted || !changed.count) return;
    // The acknowledgement was already delivered, so a terminal render failure
    // must become visible to an adviser instead of silently abandoning it.
    await this.db.$transaction(async tx => {
      await tx.rockyAiConversation.updateMany({ where: { id: job.conversationId }, data: {
        humanControl: true, revision: { increment: 1 }, lastError: "No se pudo preparar el catálogo; requiere revisión humana.",
      } });
      await tx.rockyAiAudit.create({ data: { actor: "rocky-ai", action: "catalog_render_failed", conversationId: job.conversationId, detail: { jobId: id } } });
    });
  }

  private async deliver(id: string, token: string) {
    const job = await this.db.rockyAiCatalogJob.findUnique({ where: { id }, include: { draft: true, conversation: true } });
    if (!job || job.state !== "DELIVERING" || job.processingToken !== token) return true;
    try {
      if (!await this.stillPermitted(id, token)) return true;
      const deliveries = await this.db.rockyAiCatalogDelivery.findMany({ where: { jobId: id }, orderBy: { partNumber: "asc" } });
      if (!deliveries.length) throw new Error("CATALOG_DELIVERIES_MISSING");
      if (deliveries.some(delivery => ["SENDING", "UNCERTAIN"].includes(delivery.state))) {
        await this.uncertain(id, token, "catalog_delivery_interrupted");
        return true;
      }
      const partCount = deliveries.length;
      for (const delivery of deliveries.filter(item => item.state === "PENDING")) {
        // Recheck before every part. A multipart PDF must stop immediately if
        // a client replies, a person takes over, or controls change.
        if (!await this.stillPermitted(id, token)) return true;
        const claimed = await this.db.rockyAiCatalogDelivery.updateMany({ where: { id: delivery.id, state: "PENDING" }, data: { state: "SENDING" } });
        if (!claimed.count) {
          await this.uncertain(id, token, "catalog_delivery_claim_lost");
          return true;
        }
        const providerMessageId = await deliverCatalogDocument(job.conversation.channel as AiChannel, job.conversation.externalId, {
          documentUrl: delivery.documentUrl, relativeUrl: delivery.relativeUrl, filename: delivery.filename,
          byteLength: delivery.byteLength, caption: catalogPartCaption(job.title, delivery.partNumber, partCount), deliveryId: delivery.id,
        });
        const persisted = await this.db.rockyAiCatalogDelivery.updateMany({ where: { id: delivery.id, state: "SENDING" }, data: { state: "SUBMITTED", providerMessageId } });
        if (!persisted.count) {
          await this.uncertain(id, token, "catalog_delivery_confirmation_lost");
          return true;
        }
      }
      await this.db.rockyAiCatalogJob.updateMany({ where: { id, state: "DELIVERING", processingToken: token }, data: { state: "SUBMITTED", processingToken: null, leaseExpiresAt: null, reason: null, finishedAt: new Date() } });
      return true;
    } catch {
      await this.db.rockyAiCatalogDelivery.updateMany({ where: { jobId: id, state: { in: ["PENDING", "SENDING"] } }, data: { state: "UNCERTAIN" } });
      await this.uncertain(id, token, "catalog_delivery_unconfirmed");
      return true;
    }
  }

  private async cancel(id: string, token: string, reason: string) {
    await this.db.rockyAiCatalogJob.updateMany({ where: { id, state: "DELIVERING", processingToken: token }, data: { state: "CANCELLED", processingToken: null, leaseExpiresAt: null, reason, finishedAt: new Date() } });
  }

  private async stillPermitted(id: string, token: string) {
    const job = await this.db.rockyAiCatalogJob.findUnique({ where: { id }, include: { draft: true, conversation: true } });
    if (!job || job.state !== "DELIVERING" || job.processingToken !== token) return false;
    const settings = await this.db.rockyAiSettings.findUnique({ where: { id: 1 } });
    const legacyMasterRequired = !runsOutsideLegacyMaster(job.conversation.channel);
    const global = !legacyMasterRequired
      ? null
      : await this.db.storeSettings.findUnique({ where: { id: 1 }, select: { botMasterSwitch: true } });
    const requiresHumanApproval = !job.draft.approvedBy && job.conversation.humanControl;
    if (job.draft.state !== "SUBMITTED" || !settings?.enabled || settings.revision !== job.settingsRevision ||
      channelRevision(settings?.channelRevisions, job.conversation.channel as AiChannel) !== job.channelRevision ||
      job.conversation.revision !== job.controlRevision || job.conversation.mode === "OFF" || requiresHumanApproval ||
      channelCompatibilityMissing(job.conversation.channel) || legacyMasterRequired && !global?.botMasterSwitch) {
      await this.cancel(id, token, channelCompatibilityMissing(job.conversation.channel)
        ? "channel_unavailable"
        : legacyMasterRequired && !global?.botMasterSwitch ? "global_automation_stopped" : "catalog_control_changed");
      return false;
    }
    const current = await snapshot(job.conversation.channel as AiChannel, job.conversation.externalId);
    if (!current.owned || !current.canSend || current.triggerId !== job.triggerId) {
      await this.cancel(id, token, "catalog_context_changed");
      return false;
    }
    return true;
  }

  private async uncertain(id: string, token: string, reason: string) {
    const changed = await this.db.rockyAiCatalogJob.updateMany({ where: { id, state: "DELIVERING", processingToken: token }, data: { state: "UNCERTAIN", processingToken: null, leaseExpiresAt: null, reason, finishedAt: new Date() } });
    if (!changed.count) return;
    const job = await this.db.rockyAiCatalogJob.findUnique({ where: { id }, select: { conversationId: true } });
    if (!job) return;
    // The provider may have received the PDF even if we did not receive its
    // confirmation. Stop further automation and require a human review.
    await this.db.rockyAiConversation.updateMany({ where: { id: job.conversationId }, data: {
      humanControl: true, revision: { increment: 1 }, lastError: "La entrega del catálogo requiere verificación humana.",
    } });
  }
}
