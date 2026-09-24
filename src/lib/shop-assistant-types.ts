export type ShopAssistantQuickAction = {
  label: string;
  href: string;
  accent?: boolean;
};

export type ShopAssistantProductCard = {
  id: string;
  slug: string;
  code: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
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
  contextProductCode?: string | null;
  contextCategorySlug?: string | null;
  products?: ShopAssistantProductCard[];
  quickActions?: ShopAssistantQuickAction[];
  suggestedPrompts?: string[];
  meta?: {
    engine?: "ROCKY";
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
