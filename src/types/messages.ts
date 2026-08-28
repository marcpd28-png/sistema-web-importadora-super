import { Channel, ConversationState, MessageSender, MessageType, ChatContact, Conversation as PrismaConversation, ChatMessage as PrismaChatMessage } from "@prisma/client";

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

export type Conversation = PrismaConversation & {
  contact: ChatContact;
  assignedUser?: { name: string, email?: string } | null;
  productContext?: ProductContext;
};
