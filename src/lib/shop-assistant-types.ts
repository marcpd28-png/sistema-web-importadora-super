export type ShopAssistantQuickAction = {
  label: string;
  href: string;
  accent?: boolean;
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
  document?: ShopAssistantDocument;
  searchClarification?: Array<{ code: string; name: string }>;
  contextProductCode?: string | null;
  contextCategorySlug?: string | null;
  products?: ShopAssistantProductCard[];
  quickActions?: ShopAssistantQuickAction[];
  suggestedPrompts?: string[];
  meta?: {
    intent?: string | null;
    usedOllama?: boolean;
    ollamaModel?: string | null;
    ollamaLatencyMs?: number | null;
    error?: string | null;
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
};
