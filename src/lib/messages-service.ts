import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Prisma, Channel, ConversationState, MessageType } from "@prisma/client";

export const getConversationsSchema = z.object({
  search: z.string().optional(),
  status: z.nativeEnum(ConversationState).optional(),
  channel: z.nativeEnum(Channel).optional(),
  unreadOnly: z.boolean().optional(),
  botEnabled: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().default(20),
});

export type GetConversationsInput = z.infer<typeof getConversationsSchema>;

export const incomingMessageSchema = z.object({
  channel: z.nativeEnum(Channel),
  externalContactId: z.string().min(1).max(120),
  phone: z.string().max(32).optional(),
  name: z.string().max(180),
  externalMessageId: z.string().min(1).max(120),
  type: z.nativeEnum(MessageType).default("UNKNOWN"),
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

export type IncomingMessageInput = z.infer<typeof incomingMessageSchema>;

export async function getConversations(input: GetConversationsInput) {
  const { search, status, channel, unreadOnly, botEnabled, page, limit } = input;

  const where: Prisma.ConversationWhereInput = {};

  if (search) {
    where.contact = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    };
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
        assignedUser: { select: { name: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    items: conversations,
    total,
    page,
    totalPages: Math.ceil(total / limit),
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

export async function getConversationMessages(id: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  const [total, messages] = await Promise.all([
    prisma.chatMessage.count({ where: { conversationId: id } }),
    prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    items: messages,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

const sendMessageSchema = z.object({
  content: z.string().min(1),
  type: z.nativeEnum(MessageType).default("TEXT"),
  mediaUrl: z.string().url().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export async function sendInternalMessage(conversationId: string, input: SendMessageInput, agentId: string) {
  // Validate conversation exists
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Transaction to create message and update conversation
  return prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        senderType: "AGENT",
        messageType: input.type,
        content: input.content,
        mediaUrl: input.mediaUrl,
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
  return prisma.conversation.update({
    where: { id },
    data: input,
    include: {
      contact: true,
      assignedUser: { select: { name: true } }
    }
  });
}
 
export async function processIncomingMessage(input: IncomingMessageInput) {
  // Check idempotency first
  const existingMsg = await prisma.chatMessage.findUnique({
    where: { externalMessageId: input.externalMessageId }
  });

  if (existingMsg) {
    return {
      ok: true,
      duplicate: true,
      messageId: existingMsg.id,
      conversationId: existingMsg.conversationId
    };
  }

  // Find or create contact
  let contact = await prisma.chatContact.findUnique({
    where: {
      channel_externalId: {
        channel: input.channel,
        externalId: input.externalContactId
      }
    }
  });

  if (contact) {
    // Update contact if name or phone changed and are present
    const dataToUpdate: Prisma.ChatContactUpdateInput = {};
    if (input.name && input.name !== contact.name) dataToUpdate.name = input.name;
    if (input.phone && input.phone !== contact.phone) dataToUpdate.phone = input.phone;
    
    if (Object.keys(dataToUpdate).length > 0) {
      contact = await prisma.chatContact.update({
        where: { id: contact.id },
        data: dataToUpdate
      });
    }
  } else {
    // Create new contact
    contact = await prisma.chatContact.create({
      data: {
        channel: input.channel,
        externalId: input.externalContactId,
        name: input.name,
        phone: input.phone,
      }
    });
  }

  // Find or create conversation
  // We want the most recent active conversation for this contact and channel.
  // We exclude CERRADO so we can open a new one if all are closed.
  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      channel: input.channel,
      status: { not: "CERRADO" }
    },
    orderBy: { lastMessageAt: "desc" }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        channel: input.channel,
        status: "AUTOMATICO",
        botEnabled: true,
      }
    });
  }

  // Insert message and update conversation in transaction
  const [message, updatedConversation] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        externalMessageId: input.externalMessageId,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        messageType: input.type,
        content: input.content,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        createdAt: new Date(input.timestamp),
        status: "delivered", // From perspective of receiving
      }
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(input.timestamp),
        unreadCount: { increment: 1 }
        // We DO NOT change botEnabled or assignedUserId here on inbound
      }
    })
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
      assignedUserId: updatedConversation.assignedUserId
    }
  };
}
