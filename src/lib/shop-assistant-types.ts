export type ShopAssistantQuickAction = {
  label: string;
  href: string;
  accent?: boolean;
};

/** A trusted postback action for a channel adapter. It is separate from a
 * link so Messenger can submit the intended next turn back to Super Bot. */
export type ShopAssistantChannelAction = {
  kind: "show-more" | "request-catalog";
  label: string;
  message: string;
};

/** A single generated file that channel adapters may deliver as an attachment.
 * The response text always includes the URL too, so channels without document
 * support can still give the customer access to the same catalogue. */
export type ShopAssistantDocument = {
  deliveryKey: string;
  filename: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  url: string;
};

export type ShopAssistantProductCard = {
  id: string;
  slug: string;
  code: string;
  name: string;
  description?: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  /** Own-origin JPEG derivative for Telegram. It is issued only for a
   * visible catalog product with a verified local product image. */
  telegramImageUrl?: string | null;
  /** Original public image used by external channel adapters. The storefront
   * can keep using its optimized local WebP, which some providers reject. */
  outboundImageUrl?: string | null;
  imageAlt: string | null;
  technicalSpecs?: string | null;
  unitPrice: string;
  unitPriceValue: number;
  wholesalePrice: string | null;
  wholesalePriceValue: number | null;
  wholesaleMinQty: number;
  recommendedQuantity?: number;
  recommendationReason?: string;
  unitsPerBox: number | null;
  availabilityLabel: string;
  stockUnits: number;
};

export type ShopAssistantReply = {
  text: string;
  /**
   * Ordered PDF delivery contract. When present it is authoritative over the
   * legacy singular `document`, so an adapter must deliver every entry rather
   * than silently selecting the first one.
   */
  documents?: ShopAssistantDocument[];
  /** Compatibility alias for channels that can still send only one file. */
  document?: ShopAssistantDocument;
  searchClarification?: Array<{ code: string; name: string }>;
  contextProductCode?: string | null;
  contextCategorySlug?: string | null;
  products?: ShopAssistantProductCard[];
  quickActions?: ShopAssistantQuickAction[];
  channelActions?: ShopAssistantChannelAction[];
  suggestedPrompts?: string[];
  meta?: {
    intent?: string | null;
    usedOllama?: boolean;
    ollamaModel?: string | null;
    ollamaLatencyMs?: number | null;
    error?: string | null;
    /**
     * The verified responder deliberately produced no customer-facing answer.
     * A trusted channel adapter must pause automation and place the
     * conversation in its human-review queue instead of sending a fallback.
     */
    requiresAdvisor?: boolean;
    /** Rebuilt from customer turns so adapters can inspect independent
     * purchase lines without treating one global query as conversation state. */
    conversationState?: import("./conversation-product-state").ConversationProductState;
  };
};

export type ShopAssistantContext = {
  sessionId?: string | null;
  lastCategory?: string | null;
  lastProductId?: string | null;
  lastProductCode?: string | null;
  lastIntent?: string | null;
  budget?: number | null;
};

export type ShopAssistantRequest = {
  message: string;
  productContextCode?: string | null;
  contextCategorySlug?: string | null;
  context?: ShopAssistantContext;
  recentMessages?: Array<{
    role: "assistant" | "user";
    text: string;
  }>;
  /** Product codes already shown by a trusted channel visual response. */
  shownProductCodes?: string[];
};
