export type ConversationContextMessage = {
  content: string;
  createdAt: Date;
  id: string;
};

export type AutomationConversationContext = {
  combinedContent: string;
  messageHistory: Array<{
    content: string;
    createdAt: string;
    id: string;
  }>;
};

/**
 * Turns the customer's short, consecutive messages into the context consumed
 * by the automation. WhatsApp commonly delivers intent over several bubbles
 * (for example, "Catálogo" followed by "Vengo de TikTok").
 */
export function buildAutomationConversationContext(
  messages: ConversationContextMessage[],
): AutomationConversationContext {
  const messageHistory = messages
    .map((message) => ({
      content: message.content.trim(),
      createdAt: message.createdAt.toISOString(),
      id: message.id,
    }))
    .filter((message) => Boolean(message.content));

  return {
    combinedContent: messageHistory.map((message) => message.content).join("\n"),
    messageHistory,
  };
}
