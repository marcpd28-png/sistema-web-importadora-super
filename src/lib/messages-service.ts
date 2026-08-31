import { z } from "zod";
import { Channel, ConversationState, MessageType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/utils";
import { sendWhatsappTextMessage } from "@/lib/whatsapp";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIMA_DATE_SUFFIX = "T00:00:00-05:00";

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
    unreadOnly,
    botEnabled,
    page,
    limit,
  } = input;

  const where: Prisma.ConversationWhereInput = {};
  const and: Prisma.ConversationWhereInput[] = [];

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
  mediaUrl: z.string().url().optional(),
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

  if (parsed.type !== "TEXT") {
    throw new Error("Por ahora el centro de mensajes solo envía texto por WhatsApp.");
  }

  const recipient = normalizeMessagePhone(
    conversation.contact.phone ?? conversation.contact.phoneNormalized ?? conversation.contact.externalId,
  );

  if (!recipient) {
    throw new Error("La conversación no tiene un teléfono de WhatsApp válido.");
  }

  const sent = await sendWhatsappTextMessage({
    body: parsed.content,
    to: recipient,
  });

  return prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.create({
      data: {
        conversationId,
        externalMessageId: sent.messageId,
        direction: "OUTBOUND",
        senderType: "AGENT",
        messageType: parsed.type,
        content: parsed.content,
        mediaUrl: parsed.mediaUrl,
        metadata: sent.response ? (sent.response as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: "sent",
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: message.createdAt,
        botEnabled: false,
        status: "ATENDIENDO",
        assignedUserId: agentId,
      },
    });

    return message;
  });
}

const updateConversationSchema = z.object({
  status: z.nativeEnum(ConversationState).optional(),
  botEnabled: z.boolean().optional(),
  assignedUserId: z.string().nullable().optional(),
});

export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export async function updateConversation(id: string, input: UpdateConversationInput) {
  const parsed = updateConversationSchema.parse(input);

  return prisma.conversation.update({
    where: { id },
    data: parsed,
    include: {
      contact: true,
      assignedUser: { select: { name: true, email: true } },
    },
  });
}

export async function processIncomingMessage(input: IncomingMessageInput) {
  const parsed = incomingMessageSchema.parse(input);
  const timestamp = new Date(parsed.timestamp);
  const normalizedPhone = normalizeMessagePhone(parsed.phone ?? parsed.externalContactId);
  const phone = parsed.phone?.trim() || normalizedPhone || null;

  const existingMsg = await prisma.chatMessage.findUnique({
    where: { externalMessageId: parsed.externalMessageId },
  });

  if (existingMsg) {
    return {
      ok: true,
      duplicate: true,
      messageId: existingMsg.id,
      conversationId: existingMsg.conversationId,
    };
  }

  let contact = await prisma.chatContact.findUnique({
    where: {
      channel_externalId: {
        channel: parsed.channel,
        externalId: parsed.externalContactId,
      },
    },
  });

  if (!contact && normalizedPhone) {
    contact = await prisma.chatContact.findFirst({
      where: {
        channel: parsed.channel,
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
      contact = await prisma.chatContact.update({
        where: { id: contact.id },
        data: dataToUpdate,
      });
    }
  } else {
    contact = await prisma.chatContact.create({
      data: {
        channel: parsed.channel,
        externalId: parsed.externalContactId,
        name: parsed.name,
        phone,
        phoneNormalized: normalizedPhone,
      },
    });
  }

  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      channel: parsed.channel,
      status: { not: "CERRADO" },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        channel: parsed.channel,
        status: "AUTOMATICO",
        botEnabled: true,
      },
    });
  }

  const [message, updatedConversation] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        externalMessageId: parsed.externalMessageId,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        messageType: parsed.type,
        content: parsed.content,
        metadata: parsed.metadata ? (parsed.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        createdAt: timestamp,
        status: "delivered",
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: timestamp,
        unreadCount: { increment: 1 },
      },
    }),
  ]);

  return {
    ok: true,
    duplicate: false,
    contactId: contact.id,
    conversationId: updatedConversation.id,
    messageId: message.id,
    conversation: {
      status: updatedConversation.status,
      botEnabled: updatedConversation.botEnabled,
      assignedUserId: updatedConversation.assignedUserId,
    },
  };
}
