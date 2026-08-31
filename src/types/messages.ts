import {
  Channel,
  ChatContact,
  ChatMessage as PrismaChatMessage,
  Conversation as PrismaConversation,
  ConversationState,
  MessageSender,
  MessageType,
} from "@prisma/client";

export type { Channel, ConversationState, MessageSender, MessageType, ChatContact };

export type ProductContext = {
  id: string;
  name: string;
  code: string;
  price: number;
  stock: number;
  color?: string;
  imageUrl?: string;
  url: string;
};

// UI extensions of Prisma models
export type ChatMessage = PrismaChatMessage;

export type ConversationLastMessage = Pick<
  PrismaChatMessage,
  "id" | "content" | "createdAt" | "messageType" | "senderType"
>;

export type Conversation = PrismaConversation & {
  contact: ChatContact;
  assignedUser?: { name: string; email?: string } | null;
  lastMessage?: ConversationLastMessage | null;
  productContext?: ProductContext;
};
