import { z } from "zod";
import { Channel, ConversationState, MessageType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";
import { triggerPusherEvent } from "@/lib/pusher-server";
import {
  sendYCloudOutboundMessage,
  YCloudOutboundError,
  type YCloudOutboundMessageType,
} from "@/lib/ycloud-outbound";
import {
  buildAutomationConversationContext,
  type AutomationConversationContext,
} from "@/lib/conversation-context";
import { scheduleRockyTurn } from "./rocky-inbox-intake";
import { buildPublicUrl } from "@/lib/site-url";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIMA_DATE_SUFFIX = "T00:00:00-05:00";
const AUTOMATION_CONTEXT_WINDOW_MS = 30 * 60 * 1000;
// When Rocky has not replied yet, a customer may return hours later with a
// greeting. Keep that unanswered turn long enough to recover its request.
const AUTOMATION_UNANSWERED_CONTEXT_WINDOW_MS = 24 * 60 * 60 * 1000;
const AUTOMATION_CONTEXT_MESSAGE_LIMIT = 12;
// Human control persists until an advisor explicitly activates Rocky again.

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().optional(),
);

const optionalDateOnly = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().regex(DATE_ONLY_PATTERN).optional(),
);

const optionalDateTime = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().datetime().optional(),
);

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return value;
}, z.boolean().optional());

export const getConversationsSchema = z.object({
  search: optionalTrimmedString,
  q: optionalTrimmedString,
  phone: optionalTrimmedString,
  date: optionalDateOnly,
  dateFrom: optionalDateOnly,
  dateTo: optionalDateOnly,
  from: optionalDateTime,
  to: optionalDateTime,
  status: z.nativeEnum(ConversationState).optional(),
  channel: z.nativeEnum(Channel).optional(),
  includeSimulated: optionalBoolean,
  unreadOnly: optionalBoolean,
  botEnabled: optionalBoolean,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(60).default(20),
});

export type GetConversationsInput = z.infer<typeof getConversationsSchema>;

export const getConversationMessagesSchema = z.object({
  conversationId: z.string().min(1),
  q: optionalTrimmedString,
  date: optionalDateOnly,
  dateFrom: optionalDateOnly,
  dateTo: optionalDateOnly,
  from: optionalDateTime,
  to: optionalDateTime,
  before: optionalDateTime,
  beforeId: optionalTrimmedString,
  after: optionalDateTime,
  afterId: optionalTrimmedString,
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type GetConversationMessagesInput = z.infer<typeof getConversationMessagesSchema>;

export const incomingMessageSchema = z.object({
  channel: z.nativeEnum(Channel),
  externalContactId: z.string().min(1).max(120),
  phone: z.string().max(32).optional(),
  name: z.string().max(180),
  externalMessageId: z.string().min(1).max(120),
  type: z.nativeEnum(MessageType).default("UNKNOWN"),
  content: z.string(),
  mediaUrl: z.string().url().optional().nullable(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type IncomingMessageInput = z.infer<typeof incomingMessageSchema>;

type MessageDateFilterInput = Pick<
  GetConversationsInput,
  "date" | "dateFrom" | "dateTo" | "from" | "to"
>;

type DateRange = Prisma.DateTimeFilter<"ChatMessage">;

export function normalizeMessagePhone(value: string | null | undefined) {
  return normalizeWhatsappPhone(value);
}

function dateOnlyStart(value: string) {
  return new Date(`${value}${LIMA_DATE_SUFFIX}`);
}

function dateOnlyEndExclusive(value: string) {
  const end = dateOnlyStart(value);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

function parseDateTime(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildMessageDateRange(input: MessageDateFilterInput) {
  const range: DateRange = {};

  if (input.date) {
    range.gte = dateOnlyStart(input.date);
    range.lt = dateOnlyEndExclusive(input.date);
    return range;
  }

  if (input.dateFrom) {
    range.gte = dateOnlyStart(input.dateFrom);
  }

  if (input.dateTo) {
    range.lt = dateOnlyEndExclusive(input.dateTo);
  }

  const from = parseDateTime(input.from);
  const to = parseDateTime(input.to);

  if (from) {
    range.gte = from;
  }

  if (to) {
    range.lte = to;
  }

  return Object.keys(range).length ? range : null;
}

function buildMessageFilter(input: MessageDateFilterInput & { q?: string }) {
  const where: Prisma.ChatMessageWhereInput = {};
  const dateRange = buildMessageDateRange(input);

  if (input.q) {
    where.content = { contains: input.q, mode: "insensitive" };
  }

  if (dateRange) {
    where.createdAt = dateRange;
  }

  return Object.keys(where).length ? where : null;
}

function buildContactSearch(search: string) {
  const normalizedPhone = normalizeMessagePhone(search);
  const conditions: Prisma.ChatContactWhereInput[] = [
    { name: { contains: search, mode: "insensitive" } },
    { phone: { contains: search } },
  ];

  if (normalizedPhone) {
    conditions.push(
      { phoneNormalized: { contains: normalizedPhone } },
      { externalId: { contains: normalizedPhone } },
    );
  }

  return conditions;
}

function buildPhoneSearch(phone: string) {
  const normalizedPhone = normalizeMessagePhone(phone);
  const conditions: Prisma.ChatContactWhereInput[] = [{ phone: { contains: phone } }];

  if (normalizedPhone) {
    conditions.push(
      { phoneNormalized: { contains: normalizedPhone } },
      { externalId: { contains: normalizedPhone } },
    );
  }

  return conditions;
}

export async function getConversations(input: GetConversationsInput) {
  const {
    search,
    q,
    phone,
    date,
    dateFrom,
    dateTo,
    from,
    to,
    status,
    channel,
    includeSimulated,
    unreadOnly,
    botEnabled,
    page,
    limit,
  } = input;

  const where: Prisma.ConversationWhereInput = {};
  const and: Prisma.ConversationWhereInput[] = [];

  if (!includeSimulated) {
    and.push({
      NOT: {
        contact: {
          is: {
            externalId: { startsWith: "SIMULATOR:" },
          },
        },
      },
    });
  }

  if (search) {
    and.push({
      contact: {
        is: {
          OR: buildContactSearch(search),
        },
      },
    });
  }

  if (phone) {
    and.push({
      contact: {
        is: {
          OR: buildPhoneSearch(phone),
        },
      },
    });
  }

  const messageFilter = buildMessageFilter({ q, date, dateFrom, dateTo, from, to });
  if (messageFilter) {
    and.push({ messages: { some: messageFilter } });
  }

  if (and.length) {
    where.AND = and;
  }

  if (status) {
    where.status = status;
  }

  if (channel) {
    where.channel = channel;
  }

  if (unreadOnly) {
    where.unreadCount = { gt: 0 };
  }

  if (botEnabled !== undefined) {
    where.botEnabled = botEnabled;
  }

  const skip = (page - 1) * limit;

  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: {
        contact: true,
        assignedUser: { select: { name: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            direction: true,
            messageType: true,
            senderType: true,
            createdAt: true,
          },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    items: conversations.map(({ messages, ...conversation }) => ({
      ...conversation,
      lastMessage: messages[0] ?? null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: skip + conversations.length < total,
  };
}

export async function getConversation(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      assignedUser: { select: { name: true, email: true } },
    },
  });
}

export async function getConversationMessages(input: GetConversationMessagesInput) {
  const parsed = getConversationMessagesSchema.parse(input);
  const {
    conversationId,
    q,
    date,
    dateFrom,
    dateTo,
    from,
    to,
    before,
    beforeId,
    after,
    limit,
  } = parsed;
  const baseWhere: Prisma.ChatMessageWhereInput = { conversationId };
  const dateRange = buildMessageDateRange({ date, dateFrom, dateTo, from, to });

  if (q) {
    baseWhere.content = { contains: q, mode: "insensitive" };
  }

  if (dateRange) {
    baseWhere.createdAt = dateRange;
  }

  const where: Prisma.ChatMessageWhereInput = { ...baseWhere };
  const cursorDate = parseDateTime(after || before);

  if (cursorDate) {
    if (after) {
      where.AND = [{ createdAt: { gte: cursorDate } }];
    } else {
      const sameTimestampCursor = beforeId
        ? [{ createdAt: cursorDate, id: { lt: beforeId } }]
        : [];

      where.AND = [
        {
          OR: [{ createdAt: { lt: cursorDate } }, ...sameTimestampCursor],
        },
      ];
    }
  }

  const order: Prisma.SortOrder = after ? "asc" : "desc";

  const [total, rows] = await Promise.all([
    prisma.chatMessage.count({ where: baseWhere }),
    prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: order }, { id: order }],
      take: limit + 1,
    }),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const items = after ? pageRows : pageRows.reverse();

  return {
    items,
    total,
    hasMore: after ? false : hasMore,
    nextBeforeId: items[0]?.id ?? null,
    latestId: items[items.length - 1]?.id ?? null,
    nextBefore: items[0]?.createdAt.toISOString() ?? null,
    latestAt: items[items.length - 1]?.createdAt.toISOString() ?? null,
  };
}

const sendMessageSchema = z.object({
  content: z.string().trim().min(1),
  type: z.nativeEnum(MessageType).default("TEXT"),
  mediaUrl: z.string().min(1).optional(),
  requestId: z.string().uuid(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export async function sendInternalMessage(
  conversationId: string,
  input: SendMessageInput,
  agentId: string,
) {
  const parsed = sendMessageSchema.parse(input);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const recipient = normalizeMessagePhone(
    conversation.contact.phone ?? conversation.contact.phoneNormalized ?? conversation.contact.externalId,
  );

  if (!recipient) {
    throw new Error("La conversación no tiene un teléfono de WhatsApp válido.");
  }

  if (!["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "AUDIO"].includes(parsed.type)) {
    throw new Error("El tipo de mensaje no está soportado por ahora.");
  }

  if (parsed.type !== "TEXT" && !parsed.mediaUrl) {
    throw new Error("Se requiere mediaUrl para enviar archivos multimedia.");
  }

  const outboundType = parsed.type.toLowerCase() as YCloudOutboundMessageType;
  // Local uploads are stored as /uploads paths; YCloud needs a public URL.
  const mediaUrl = parsed.mediaUrl?.startsWith("/")
    ? buildPublicUrl(parsed.mediaUrl)
    : parsed.mediaUrl;
  // Pause Rocky before attempting delivery, not after YCloud responds. This
  // closes the race where a customer message can arrive while an advisor's
  // message is still being sent.
  const message = await prisma.$transaction(async (tx) => {
    const pendingMessage = await tx.chatMessage.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        senderType: "AGENT",
        messageType: parsed.type,
        content: parsed.content,
        mediaUrl,
        metadata: { requestId: parsed.requestId },
        status: "pending",
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        botEnabled: false,
        status: "ATENDIENDO",
        assignedUserId: agentId,
        unreadCount: 0,
        lastReadAt: pendingMessage.createdAt,
      },
    });

    return pendingMessage;
  });

  console.info("[outbound] pending", { requestId: parsed.requestId, conversationId, messageId: message.id });
  try {
    if (conversation.contact.externalId?.startsWith("SIMULATOR:")) {
      throw new YCloudOutboundError("No se puede enviar un mensaje real a un contacto de simulación.", {
        code: "SIMULATOR_CONTACT", statusCode: 400,
      });
    }

    const sent = await sendYCloudOutboundMessage({
      externalId: message.id,
      content: parsed.content,
      mediaUrl: mediaUrl ?? null,
      recipient,
      type: outboundType,
    });

    return prisma.$transaction(async (tx) => {
      await tx.chatMessage.updateMany({
        where: { id: message.id, status: "pending" },
        data: {
          externalMessageId: sent.messageId,
          metadata: { provider: sent.provider, requestId: parsed.requestId },
          status: "accepted",
        },
      });
      const sentMessage = await tx.chatMessage.findUniqueOrThrow({ where: { id: message.id } });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: sentMessage.createdAt },
      });

      triggerPusherEvent(`chat-${conversationId}`, "new-message", sentMessage);
      console.info("[outbound] sent", { requestId: parsed.requestId, conversationId, messageId: message.id });
      return sentMessage;
    });
  } catch (error) {
    const safeReason = error instanceof YCloudOutboundError ? error.message : "No se pudo iniciar el envío hacia YCloud.";
    const unconfirmed = error instanceof YCloudOutboundError && ["YCLOUD_UNAVAILABLE", "YCLOUD_INVALID_RESPONSE"].includes(error.code);
    await prisma.chatMessage.updateMany({
      where: { id: message.id, status: "pending" },
      data: { status: unconfirmed ? "uncertain" : "failed", metadata: { requestId: parsed.requestId, error: safeReason } },
    });
    const failed = await prisma.chatMessage.findUniqueOrThrow({ where: { id: message.id } });
    triggerPusherEvent(`chat-${conversationId}`, "new-message", failed);
    if (["accepted", "sent", "delivered", "read"].includes(failed.status ?? "")) return failed;
    console.warn("[outbound] failed", { requestId: parsed.requestId, conversationId, messageId: message.id });
    if (error instanceof YCloudOutboundError) {
      throw error.withContext({ requestId: parsed.requestId, messageId: message.id });
    }
    throw new YCloudOutboundError(safeReason, {
      code: "OUTBOUND_DELIVERY_FAILED", statusCode: 502,
    }).withContext({ requestId: parsed.requestId, messageId: message.id });
  }
}

const updateConversationSchema = z.object({
  status: z.nativeEnum(ConversationState).optional(),
  botEnabled: z.boolean().optional(),
  assignedUserId: z.string().nullable().optional(),
  markAsRead: z.boolean().optional(),
});

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export async function updateConversation(id: string, input: UpdateConversationInput) {
  const parsed = updateConversationSchema.parse(input);
  const { markAsRead, ...conversationChanges } = parsed;

  // Activar Rocky devuelve la conversación a la cola automática. Esto evita
  // conservar una asignación anterior que impediría al bot retomarla.
  const data = conversationChanges.botEnabled
    ? { ...conversationChanges, assignedUserId: null, status: "AUTOMATICO" as const }
    : { ...conversationChanges, ...((conversationChanges.assignedUserId || (conversationChanges.status && conversationChanges.status !== "AUTOMATICO")) ? { botEnabled: false } : {}) };

  return prisma.conversation.update({
    where: { id },
    data: {
      ...data,
      ...(markAsRead ? { unreadCount: 0, lastReadAt: new Date() } : {}),
    },
    include: {
      contact: true,
      assignedUser: { select: { name: true, email: true } },
    },
  });
}

export async function processIncomingMessage(input: IncomingMessageInput, options: { scheduleRocky?: boolean } = {}) {
  const parsed = incomingMessageSchema.parse(input);
  const timestamp = new Date(parsed.timestamp);
  const isSimulator = parsed.externalContactId.startsWith("SIMULATOR:");
  const normalizedPhone = normalizeMessagePhone(parsed.phone ?? (isSimulator ? "" : parsed.externalContactId));
  const phone = parsed.phone?.trim() || (isSimulator ? null : normalizedPhone) || null;

  const outcome = await prisma.$transaction(async tx => {
    // Serialize first contact creation and provider retries by canonical sender.
    // All paths take settings before the conversation to avoid control deadlocks.
    await tx.$queryRaw`SELECT id FROM "StoreSettings" WHERE id = 1 FOR SHARE`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.channel + ":" + (normalizedPhone || parsed.externalContactId)}, 0))`;
    const existingMsg = await tx.chatMessage.findUnique({
      where: { externalMessageId: parsed.externalMessageId },
    });

    if (existingMsg) {
      return {
        ok: true,
        duplicate: true,
        message: null,
        createdConversation: false,
        messageId: existingMsg.id,
        conversationId: existingMsg.conversationId,
      };
    }

    let contact = await tx.chatContact.findUnique({
      where: {
        channel_externalId: {
          channel: parsed.channel,
          externalId: parsed.externalContactId,
        },
      },
    });

    if (!contact && normalizedPhone && !isSimulator) {
      contact = await tx.chatContact.findFirst({
        where: {
          channel: parsed.channel,
          NOT: {
            externalId: { startsWith: "SIMULATOR:" },
          },
          OR: [
            { phoneNormalized: normalizedPhone },
            { phone: { contains: normalizedPhone } },
            { externalId: normalizedPhone },
          ],
        },
      });
    }

    if (contact) {
      const dataToUpdate: Prisma.ChatContactUpdateInput = {};

      if (parsed.name && parsed.name !== contact.name) {
        dataToUpdate.name = parsed.name;
      }

      if (phone && phone !== contact.phone) {
        dataToUpdate.phone = phone;
      }

      if (normalizedPhone && normalizedPhone !== contact.phoneNormalized) {
        dataToUpdate.phoneNormalized = normalizedPhone;
      }

      if (!contact.externalId) {
        dataToUpdate.externalId = parsed.externalContactId;
      }

      if (Object.keys(dataToUpdate).length > 0) {
        contact = await tx.chatContact.update({
          where: { id: contact.id },
          data: dataToUpdate,
        });
      }
    } else {
      contact = await tx.chatContact.create({
        data: {
          channel: parsed.channel,
          externalId: parsed.externalContactId,
          name: parsed.name,
          phone,
          phoneNormalized: normalizedPhone,
        },
      });
    }

    let conversation = await tx.conversation.findFirst({
      where: {
        contactId: contact.id,
        channel: parsed.channel,
        status: { not: "CERRADO" },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    const createdConversation = !conversation;

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          contactId: contact.id,
          channel: parsed.channel,
          status: "AUTOMATICO",
          botEnabled: true,
        },
      });
    }

    const message = await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          externalMessageId: parsed.externalMessageId,
          direction: "INBOUND",
          senderType: "CUSTOMER",
          messageType: parsed.type,
          content: parsed.content,
          mediaUrl: parsed.mediaUrl,
          metadata: parsed.metadata ? (parsed.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
          createdAt: timestamp,
          status: "delivered",
        },
      });
    const updatedConversation = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: timestamp,
          unreadCount: { increment: 1 },
        },
      });
    if (options.scheduleRocky) await scheduleRockyTurn(tx, conversation.id, message.id);

    return {
      ok: true,
      duplicate: false,
      message,
      createdConversation,
      simulation: isSimulator,
      contactId: contact.id,
      conversationId: updatedConversation.id,
      messageId: message.id,
      conversation: {
        status: updatedConversation.status,
        botEnabled: updatedConversation.botEnabled,
        assignedUserId: updatedConversation.assignedUserId,
      },
    };
  }, { timeout: 15_000 });
  const { message, ...result } = outcome;
  if (message) triggerPusherEvent(`chat-${message.conversationId}`, "new-message", message);
  return result;
}

/**
 * Returns the current customer turn as one intent. A turn begins after the
 * last outgoing reply, so Rocky can combine split WhatsApp bubbles without
 * mixing them with a previous request from the same conversation.
 */
export async function getAutomationConversationContext(
  conversationId: string,
): Promise<AutomationConversationContext> {
  const since = new Date(Date.now() - AUTOMATION_CONTEXT_WINDOW_MS);
  const latestOutbound = await prisma.chatMessage.findFirst({
    where: { conversationId, direction: "OUTBOUND", status: { notIn: ["cancelled", "failed", "uncertain"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  const turnStartedAt = latestOutbound?.createdAt && latestOutbound.createdAt > since
    ? latestOutbound.createdAt
    : new Date(Date.now() - AUTOMATION_UNANSWERED_CONTEXT_WINDOW_MS);
  const recentMessages = await prisma.chatMessage.findMany({
    where: {
      conversationId,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      createdAt: { gte: turnStartedAt },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUTOMATION_CONTEXT_MESSAGE_LIMIT,
    select: { id: true, content: true, createdAt: true },
  });

  return buildAutomationConversationContext(recentMessages.reverse());
}
