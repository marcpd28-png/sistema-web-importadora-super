import type {
  ComplaintStatus,
  ComplaintType,
  ErpSyncStatus,
  ErpSyncTrigger,
  QuoteStatus,
  TrendDirection,
  TrendPeriod,
} from "@prisma/client";
import type {
  HeroBannerContentPosition,
  HeroBannerLayout,
  HeroBannerSlot,
  HeroBannerTextAlign,
} from "@/lib/hero-banners";

export type CatalogProduct = {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  technicalSpecs: string | null;
  brand: string | null;
  category: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  sourceImageUrl: string | null;
  localImageUrl: string | null;
  media: ProductMediaView[];
  primaryMedia: ProductMediaView | null;
  unitLabel: string;
  unitPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number;
  boxPrice: number | null;
  unitsPerBox: number | null;
  stockUnits: number;
  isVisible: boolean;
  isFeatured: boolean;
  syncEnabled: boolean;
  hasPhoto: boolean;
  lastSyncedAt: string | null;
  updatedAt: string;
};

export type AdminProductListItem = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  sourceImageUrl: string | null;
  localImageUrl: string | null;
  thumbnailUrl: string | null;
  unitPrice: number;
  wholesalePrice: number | null;
  stockUnits: number;
  isVisible: boolean;
  isFeatured: boolean;
  hasPhoto: boolean;
  lastSyncedAt: string | null;
  updatedAt: string;
};

export type AdminProductCatalogStats = {
  totalProducts: number;
  withPhotoProducts: number;
  withoutPhotoProducts: number;
  visibleProducts: number;
  hiddenProducts: number;
  needsReviewProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  syncedProducts: number;
  unsyncedProducts: number;
  staleSyncedProducts: number;
  featuredProducts: number;
  hiddenWithStockProducts: number;
};

export type ProductMediaView = {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  altText: string | null;
  sortOrder: number;
};

export type CategoryOption = {
  id: string;
  name: string;
  slug: string;
};

export type BrandOption = {
  name: string;
};

export type CatalogSuggestion = {
  id: string;
  slug: string;
  code: string;
  name: string;
  brand: string | null;
  category: string | null;
};

export type AdminCategory = CategoryOption & {
  productCount: number;
};

export type CatalogCategorySection = {
  category: CategoryOption;
  productCount: number;
  products: CatalogProduct[];
};

export type HeroSlideView = {
  imageUrl: string;
  title: string | null;
  text: string | null;
};

export type HeroBannerView = {
  id: string;
  slot: HeroBannerSlot;
  layout: HeroBannerLayout;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  desktopImageUrl: string;
  mobileImageUrl: string | null;
  altText: string | null;
  overlayColor: string;
  overlayOpacity: number;
  textAlign: HeroBannerTextAlign;
  contentPosition: HeroBannerContentPosition;
  priority: number;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  campaignName: string | null;
  analyticsKey: string | null;
  impressionCount: number;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
  statusLabel: "Activo" | "Programado" | "Expirado" | "Borrador";
  isLive: boolean;
  recommendedDesktopSize: string;
  recommendedMobileSize: string;
  ratioLabel: string;
};

export type StoreSettingsView = {
  businessName: string;
  heroTitle: string;
  heroDescription: string;
  heroSlides: HeroSlideView[];
  heroAutoplaySeconds: number;
  whatsappNumber: string;
  orderIntro: string;
  orderFooter: string;
  currencySymbol: string;
  highlightMessage: string;
  supportHours: string;
  primaryColor: string;
  accentColor: string;
};

export type CatalogSalesInsight = {
  label: string;
  value: string;
};

export type CatalogSalesSummary = {
  generatedAt: string | null;
  hasDatedSales: boolean;
  hasRealSales: boolean;
  hasUnitSales: boolean;
  insights: CatalogSalesInsight[];
  source: "erp" | "fallback";
};

export type ShopperAccountView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
};

export type ShopperQuoteItemView = {
  code: string;
  name: string;
  quantity: number;
  total: number;
};

export type ShopperQuoteView = {
  id: string;
  quoteNumber: string | null;
  status: QuoteStatus;
  total: number;
  currencySymbol: string;
  createdAt: string;
  itemCount: number;
  items: ShopperQuoteItemView[];
};

export type ShopperQuoteDetailItemView = ShopperQuoteItemView & {
  tierLabel: string;
  unitPrice: number;
  product: CatalogProduct | null;
};

export type ShopperQuoteDetailView = Omit<ShopperQuoteView, "items"> & {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerAddress: string | null;
  customerDocumentNumber: string | null;
  customerDocumentType: string | null;
  errorMessage: string | null;
  items: ShopperQuoteDetailItemView[];
  note: string | null;
  statusSteps: AdminQuoteStatusStepView[];
  updatedAt: string;
  whatsappHref: string | null;
};

export type AdminQuoteItemView = ShopperQuoteItemView & {
  code: string;
};

export type AdminQuoteDetailItemView = AdminQuoteItemView & {
  externalId: string | null;
  productId: string | null;
  tierLabel: string;
  unitPrice: number;
};

export type AdminQuoteStatusStepView = {
  status: "success" | "warning" | "error";
  text: string;
};

export type AdminQuotePdfNotificationView = {
  message: string;
  ok: boolean;
  sent: boolean;
} | null;

export type AdminQuoteView = {
  id: string;
  quoteNumber: string | null;
  status: QuoteStatus;
  total: number;
  currencySymbol: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  erpCustomerMode: string | null;
  createdAt: string;
  itemCount: number;
  items: AdminQuoteItemView[];
  user: {
    name: string;
    email: string;
  } | null;
};

export type AdminQuoteDetailView = Omit<AdminQuoteView, "items" | "itemCount"> & {
  customerAddress: string | null;
  customerDocumentNumber: string | null;
  customerDocumentType: string | null;
  erpCustomerId: number | null;
  erpExternalId: string | null;
  errorMessage: string | null;
  itemCount: number;
  items: AdminQuoteDetailItemView[];
  note: string | null;
  pdfNotification: AdminQuotePdfNotificationView;
  statusSteps: AdminQuoteStatusStepView[];
  updatedAt: string;
  whatsappHref: string | null;
};

export type AdminQuotesData = {
  quotes: AdminQuoteView[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalResults: number;
  stats: {
    all: number;
    pending: number;
    registered: number;
    error: number;
  };
};

export type DashboardTrendProduct = {
  code: string;
  name: string;
  unitsSold: number;
  deltaPercent: number;
  momentumScore: number;
  direction: TrendDirection;
};

export type DashboardPeriod = TrendPeriod;

export type DashboardComparisonMetric = {
  label: string;
  currentValue: number;
  previousValue: number | null;
  deltaPercent: number | null;
};

export type DashboardDataFreshness = {
  sourceLabel: string;
  lastSyncAt: string | null;
  lastSyncStatus: ErpSyncStatus | null;
  syncedProducts: number;
  neverSyncedProducts: number;
  staleSyncedProducts: number;
  outOfStockProducts: number;
  hiddenOutOfStockProducts: number;
  visibleOutOfStockProducts: number;
  hiddenWithoutPhotoProducts: number;
  visibleWithoutPhotoProducts: number;
  needsReviewProducts: number;
  productsWithoutPhoto: number;
};

export type ErpSyncLogView = {
  id: string;
  source: string;
  trigger: ErpSyncTrigger;
  syncMode: string;
  status: ErpSyncStatus;
  fetchedCount: number;
  progressTotalCount: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  failedPage: number | null;
  failedPageMessage: string | null;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  initiatedByName: string | null;
  initiatedByEmail: string | null;
  canceledByName: string | null;
  canceledByEmail: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  durationMs: number | null;
  progressPercent: number | null;
};

export type AdminComplaintView = {
  id: string;
  claimCode: string;
  kind: ComplaintType;
  subject: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  status: ComplaintStatus;
  createdAt: string;
  respondedAt: string | null;
  responseText: string | null;
  responseChannel: string | null;
};

export type AdminComplaintDetailView = AdminComplaintView & {
  documentType: string | null;
  documentNumber: string | null;
  orderNumber: string | null;
  productReference: string | null;
  detail: string;
  updatedAt: string;

  // Nuevos campos detallados para Libro de Reclamaciones
  names: string;
  lastNames: string;
  email: string;
  phone: string;
  address: string;
  department: string;
  province: string;
  district: string;
  isMinor: boolean;
  repNames: string | null;
  repDocumentType: string | null;
  repDocumentNumber: string | null;
  isPurchaseRelated: boolean;
  invoiceNumber: string | null;
  purchaseDate: string | null;
  productName: string | null;
  productBrand: string | null;
  productModel: string | null;
  productSku: string | null;
  productSerial: string | null;
  purchaseAmount: number | null;
  purchaseChannel: string | null;
  paymentMethod: string | null;
  type: ComplaintType;
  reason: string;
  subReason: string | null;
  facts: string;
  request: string;
  expiryDate: string;
  attachments: string[];
  assignedToName: string | null;
  assignedToEmail: string | null;
  internalNotes: {
    id: string;
    authorName: string;
    authorEmail: string;
    content: string;
    createdAt: string;
  }[];
};

export type AdminComplaintsData = {
  complaints: AdminComplaintView[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalResults: number;
  stats: {
    all: number;
    new: number;
    inReview: number;
    responded: number;
    closed: number;
  };
};
