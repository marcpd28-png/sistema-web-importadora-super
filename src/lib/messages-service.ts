import { z } from "zod";
import { Channel, ConversationState, MessageType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/utils";
import { triggerPusherEvent } from "@/lib/pusher-server";
import { sendTelegramMessage, controlTelegram } from "./telegram-messages";
import {
  advisorConversationScope,
  canTransferConversation,
  ConversationAssignmentError,
  isConversationAssignedToAdvisor,
} from "./conversation-assignment";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIMA_DATE_SUFFIX = "T00:00:00-05:00";
// Human control persists until an advisor explicitly reactivates Super Bot.

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

export type ConversationAccessScope = {
  /** Set only for an advisor: shared queue plus their own assigned chats. */
  advisorId?: string;
};

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
  return normalizePhoneNumber(value);
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

export async function getConversations(
  input: GetConversationsInput,
  scope: ConversationAccessScope = {},
) {
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

  if (scope.advisorId) {
    and.push(advisorConversationScope(scope.advisorId));
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
        assignedUser: { select: { id: true, name: true, email: true } },
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
      assignedUser: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Simulated conversations are a supervision tool, not customer work. Keep
 * this check close to the message service so every advisor-facing endpoint
 * can apply the same scope even when a conversation ID is guessed directly.
 */
export async function isAdvisorConversationAccessible(id: string, advisorId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { assignedUserId: true, contact: { select: { externalId: true } } },
  });

  return Boolean(
    conversation &&
      !conversation.contact.externalId?.startsWith("SIMULATOR:") &&
      isConversationAssignedToAdvisor(conversation.assignedUserId, advisorId),
  );
}

const assignmentInclude = {
  contact: true,
  assignedUser: { select: { id: true, name: true, email: true } },
} as const;

async function assignmentConversation(id: string) {
  return prisma.conversation.findUnique({ where: { id }, include: assignmentInclude });
}

function requireCustomerConversation<T extends { contact: { externalId: string | null } }>(conversation: T | null) {
  if (!conversation || conversation.contact.externalId?.startsWith("SIMULATOR:")) {
    throw new ConversationAssignmentError("Conversación no encontrada.");
  }
  return conversation;
}

/**
 * Atomically assigns an unassigned chat to an advisor. Assignment grants
 * workspace access; it is not a customer-facing intervention, so it must not
 * silence Super Bot. Telegram is paused only when an adviser actually sends
 * a message (or explicitly presses the pause control).
 */
export async function claimConversation(
  id: string,
  advisorId: string,
  { canReassign = false }: { canReassign?: boolean } = {},
) {
  const existing = requireCustomerConversation(await assignmentConversation(id));
  if (existing.assignedUserId === advisorId) return existing;
  if (existing.assignedUserId && !canReassign) {
    throw new ConversationAssignmentError("Otro asesor acaba de tomar esta conversación.", 409);
  }

  const claimed = await prisma.conversation.updateMany({
    where: { id, assignedUserId: existing.assignedUserId },
    data: {
      assignedUserId: advisorId,
      unreadCount: 0,
      lastReadAt: new Date(),
    },
  });

  if (!claimed.count) {
    const current = await assignmentConversation(id);
    if (current?.assignedUserId === advisorId) return current;
    throw new ConversationAssignmentError("Otro asesor acaba de tomar esta conversación.", 409);
  }

  return requireCustomerConversation(await assignmentConversation(id));
}

export async function getAssignableAdvisors() {
  return prisma.user.findMany({
    where: { role: "ASESOR" },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true },
  });
}

/**
 * Transfers an owned chat without exposing it to the rest of the team. The
 * conditional write refuses a handoff while a human message is in flight.
 */
export async function transferConversation(
  id: string,
  targetAdvisorId: string,
  actor: { id: string; isMessagingOwner: boolean },
) {
  const target = await prisma.user.findUnique({
    where: { id: targetAdvisorId },
    select: { id: true, role: true },
  });
  if (target?.role !== "ASESOR") {
    throw new ConversationAssignmentError("Selecciona un asesor válido.", 409);
  }

  const existing = requireCustomerConversation(await assignmentConversation(id));
  if (!canTransferConversation({
    assignedUserId: existing.assignedUserId,
    actorId: actor.id,
    isMessagingOwner: actor.isMessagingOwner,
  })) {
    throw new ConversationAssignmentError("Conversación no encontrada.");
  }
  if (existing.assignedUserId === targetAdvisorId) return existing;

  const transferred = await prisma.conversation.updateMany({
    where: {
      id,
      assignedUserId: existing.assignedUserId,
      messages: {
        none: {
          direction: "OUTBOUND",
          senderType: "AGENT",
          status: { in: ["pending", "sending"] },
        },
      },
    },
    data: {
      assignedUserId: targetAdvisorId,
      // The recipient sees the handoff as work awaiting review.
      unreadCount: Math.max(existing.unreadCount, 1),
      lastReadAt: null,
    },
  });

  if (!transferred.count) {
    const current = await assignmentConversation(id);
    if (current?.assignedUserId !== existing.assignedUserId) {
      throw new ConversationAssignmentError("La asignación cambió. Actualiza la bandeja.", 409);
    }
    throw new ConversationAssignmentError("Espera que termine el mensaje en envío antes de derivar el chat.", 409);
  }

  return requireCustomerConversation(await assignmentConversation(id));
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
  replyToMessageId: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1),
  type: z.nativeEnum(MessageType).default("TEXT"),
  mediaUrl: z.string().min(1).optional(),
  requestId: z.string().uuid(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export type SendInternalMessageOptions = {
  /** An advisor route supplies this to close a transfer/send race. */
  expectedAssigneeId?: string;
};

export class MessageTransportError extends Error {
  constructor(message: string, public readonly statusCode = 409) {
    super(message);
  }
}

export async function sendInternalMessage(
  conversationId: string,
  input: SendMessageInput,
  agentId: string,
  options: SendInternalMessageOptions = {},
) {
  const parsed = sendMessageSchema.parse(input);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });

  if (!conversation) throw new Error("Conversation not found");
  if (conversation.contact.externalId?.startsWith("SIMULATOR:")) {
    throw new MessageTransportError("No se puede enviar un mensaje real a un contacto de simulación.", 400);
  }
  if (conversation.channel !== "TELEGRAM") {
    throw new MessageTransportError("Este canal ya no tiene un transporte de envío conectado.");
  }

  return sendTelegramMessage(conversation, parsed, agentId, options.expectedAssigneeId);
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
  const existing = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  let telegramRevision: number | undefined;
  if (existing.channel === "TELEGRAM" && (parsed.botEnabled !== undefined || parsed.assignedUserId || parsed.status)) {
    const enabled = parsed.botEnabled ?? (parsed.assignedUserId || parsed.status !== "AUTOMATICO" ? false : existing.botEnabled);
    telegramRevision = (await controlTelegram(existing, enabled)).revision;
  }

  // Activar Super Bot devuelve la conversación al control automático. Esto evita
  // conservar una asignación anterior que impediría al bot retomarla.
  const data = conversationChanges.botEnabled
    ? { ...conversationChanges, assignedUserId: null, status: "AUTOMATICO" as const }
    : { ...conversationChanges, ...((conversationChanges.assignedUserId || (conversationChanges.status && conversationChanges.status !== "AUTOMATICO")) ? { botEnabled: false } : {}) };

  return prisma.conversation.update({
    where: { id },
    data: {
      ...data,
      ...(telegramRevision !== undefined ? { telegramRevision } : {}),
      ...(markAsRead ? { unreadCount: 0, lastReadAt: new Date() } : {}),
    },
    include: {
      contact: true,
      assignedUser: { select: { name: true, email: true } },
    },
  });
}

export async function processIncomingMessage(input: IncomingMessageInput) {
  const parsed = incomingMessageSchema.parse(input);
  if (parsed.channel === "WHATSAPP") {
    throw new MessageTransportError("El canal retirado no acepta mensajes nuevos.");
  }
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
