import type {
  FacturadorBrand,
  FacturadorCategory,
  FacturadorConfig,
  FacturadorCustomer,
  FacturadorQuoteCustomer,
  FacturadorQuoteItem,
  FacturadorQuotationResult,
  FacturadorProduct,
  FacturadorRecord,
  FacturadorSalesProduct,
  FacturadorProductSyncOptions,
} from "@/lib/facturador/types";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SOURCE = "facturador-smart";
const DEFAULT_PRODUCT_PAGE_DELAY_MS = 0;
const DEFAULT_PRODUCT_PAGE_CONCURRENCY = 12;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_RUNNING_SYNC_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PRODUCT_UPDATED_SINCE_FORMAT = "iso";

type RequestOptions = {
  body?: unknown;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | null | undefined>;
  retry?: boolean;
};

const PAGE_RETRY_DELAYS_MS = [5000, 15000, 45000, 120000] as const;

export class FacturadorApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = "FacturadorApiError";
  }
}

export class FacturadorPageFetchError extends Error {
  constructor(
    message: string,
    public readonly page: number,
    public readonly status: number | null,
    public readonly payload: unknown,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FacturadorPageFetchError";
  }
}

export function getFacturadorConfig(): FacturadorConfig {
  const baseUrl = process.env.FACTURADOR_API_URL?.trim();
  const token = process.env.FACTURADOR_API_TOKEN?.trim();
  const startProductPage = Number(process.env.FACTURADOR_SYNC_START_PRODUCT_PAGE ?? 1);
  const maxProductPages = Number(process.env.FACTURADOR_SYNC_MAX_PRODUCT_PAGES ?? 0);
  const productPageDelayMs = Number(
    process.env.FACTURADOR_PRODUCT_PAGE_DELAY_MS ?? DEFAULT_PRODUCT_PAGE_DELAY_MS,
  );
  const productPageConcurrency = Number(
    process.env.FACTURADOR_PRODUCT_PAGE_CONCURRENCY ?? DEFAULT_PRODUCT_PAGE_CONCURRENCY,
  );
  const productWarehouseId = Number(process.env.FACTURADOR_PRODUCT_WAREHOUSE_ID ?? 1);
  const orderByInternalId =
    process.env.FACTURADOR_ORDER_BY_INTERNAL_ID === "1" ||
    process.env.FACTURADOR_ORDER_BY_INTERNAL_ID === "true" ||
    process.env.FACTURADOR_ORDER_BY_INTERNAL_ID === undefined;
  const productUpdatedSinceParam = process.env.FACTURADOR_SYNC_UPDATED_SINCE_PARAM?.trim();
  const productUpdatedSinceFormat = parseUpdatedSinceFormat(
    process.env.FACTURADOR_SYNC_UPDATED_SINCE_FORMAT,
  );
  const maxRetries = Number(process.env.FACTURADOR_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  const retryDelayMs = Number(process.env.FACTURADOR_RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS);
  const runningSyncTimeoutMs = Number(
    process.env.FACTURADOR_RUNNING_SYNC_TIMEOUT_MS ?? DEFAULT_RUNNING_SYNC_TIMEOUT_MS,
  );

  if (!baseUrl) {
    throw new Error("Falta configurar FACTURADOR_API_URL.");
  }

  if (!token) {
    throw new Error("Falta configurar FACTURADOR_API_TOKEN.");
  }

  return {
    baseUrl,
    token,
    source: process.env.FACTURADOR_SYNC_SOURCE?.trim() || DEFAULT_SOURCE,
    quotationPath: process.env.FACTURADOR_QUOTATION_PATH?.trim() || "/quotations",
    quotationPrefix: process.env.FACTURADOR_QUOTATION_PREFIX?.trim() || "COTW",
    timeoutMs: Number(process.env.FACTURADOR_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    startProductPage:
      Number.isInteger(startProductPage) && startProductPage > 0 ? startProductPage : 1,
    maxProductPages: maxProductPages > 0 ? maxProductPages : null,
    productPageConcurrency:
      Number.isInteger(productPageConcurrency) && productPageConcurrency > 0
        ? productPageConcurrency
        : DEFAULT_PRODUCT_PAGE_CONCURRENCY,
    productWarehouseId:
      Number.isInteger(productWarehouseId) && productWarehouseId > 0 ? productWarehouseId : null,
    orderByInternalId,
    productPageDelayMs: productPageDelayMs > 0 ? productPageDelayMs : 0,
    maxRetries: maxRetries >= 0 ? maxRetries : DEFAULT_MAX_RETRIES,
    retryDelayMs: retryDelayMs > 0 ? retryDelayMs : DEFAULT_RETRY_DELAY_MS,
    hideMissingProducts:
      process.env.FACTURADOR_HIDE_MISSING_PRODUCTS === "1" ||
      process.env.FACTURADOR_HIDE_MISSING_PRODUCTS === "true",
    runningSyncTimeoutMs:
      Number.isFinite(runningSyncTimeoutMs) && runningSyncTimeoutMs > 0
        ? runningSyncTimeoutMs
        : DEFAULT_RUNNING_SYNC_TIMEOUT_MS,
    productUpdatedSinceParam: productUpdatedSinceParam || null,
    productUpdatedSinceFormat,
  };
}

function buildUrl(config: FacturadorConfig, path: string, query?: RequestOptions["query"]) {
  const url = new URL(path.replace(/^\/+/, ""), normalizeBaseUrl(config.baseUrl));

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

function normalizeBaseUrl(baseUrl: string) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return normalized.endsWith("/api/") ? normalized : `${normalized.replace(/\/+$/, "")}/api/`;
}

function extractRecords(payload: unknown): FacturadorRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [
    payload.data,
    payload.records,
    payload.items,
    isRecord(payload.data) ? payload.data.data : null,
    isRecord(payload.data) ? payload.data.records : null,
    isRecord(payload.data) ? payload.data.items : null,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

function extractRecord(payload: unknown): FacturadorRecord | null {
  if (isRecord(payload)) {
    if (isRecord(payload.data)) {
      return payload.data;
    }

    return payload;
  }

  return null;
}

function getLastPage(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.meta)) {
    return null;
  }

  const value = payload.meta.last_page;

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function isRecord(value: unknown): value is FacturadorRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseUpdatedSinceFormat(
  value: string | undefined,
): "iso" | "date" | "unix-ms" | "unix-seconds" {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "date" ||
    normalized === "unix-ms" ||
    normalized === "unix-seconds" ||
    normalized === "iso"
  ) {
    return normalized;
  }

  return DEFAULT_PRODUCT_UPDATED_SINCE_FORMAT;
}

function formatUpdatedSinceValue(date: Date, format: "iso" | "date" | "unix-ms" | "unix-seconds") {
  if (format === "date") {
    return date.toISOString().slice(0, 10);
  }

  if (format === "unix-ms") {
    return String(date.getTime());
  }

  if (format === "unix-seconds") {
    return String(Math.floor(date.getTime() / 1000));
  }

  return date.toISOString();
}

export class FacturadorClient {
  constructor(private readonly config = getFacturadorConfig()) {}

  get source() {
    return this.config.source;
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    let attempt = 0;
    const allowRetry = options.retry !== false;

    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(buildUrl(this.config, path, options.query), {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.config.token}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          method: options.method ?? "GET",
          signal: controller.signal,
        });
        const text = await response.text();
        const payload = text ? parseJson(text) : null;

        if (!response.ok) {
          const message =
            isRecord(payload) && typeof payload.message === "string"
              ? payload.message
              : `La API externa respondio HTTP ${response.status}.`;

          if (allowRetry && shouldRetry(response.status, message) && attempt < this.config.maxRetries) {
            attempt += 1;
            await sleep(this.config.retryDelayMs * attempt);
            continue;
          }

          throw new FacturadorApiError(message, response.status, payload);
        }

        return payload as T;
      } catch (error) {
        if (error instanceof FacturadorApiError) {
          throw error;
        }

        if (allowRetry && attempt < this.config.maxRetries) {
          attempt += 1;
          await sleep(this.config.retryDelayMs * attempt);
          continue;
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  async getProducts(options: FacturadorProductSyncOptions = {}) {
    const startPage = this.config.startProductPage;
    const pageConcurrency = Math.max(1, options.pageConcurrency ?? this.config.productPageConcurrency);
    const pageDelayMs = Math.max(0, options.pageDelayMs ?? this.config.productPageDelayMs);
    const updatedSinceQueryValue =
      options.updatedSince && this.config.productUpdatedSinceParam
        ? formatUpdatedSinceValue(options.updatedSince, this.config.productUpdatedSinceFormat)
        : null;
    const query: Record<string, string | number | boolean | null | undefined> = {};

    if (updatedSinceQueryValue) {
      if (!this.config.productUpdatedSinceParam) {
        throw new Error(
          "El modo incremental requiere FACTURADOR_SYNC_UPDATED_SINCE_PARAM para consultar solo productos cambiados.",
        );
      }

      query[this.config.productUpdatedSinceParam] = updatedSinceQueryValue;
    }

    const firstPayload = await this.requestItemsPage(startPage, query);
    const products = extractRecords(firstPayload) as FacturadorProduct[];
    const lastPage = getLastPage(firstPayload) ?? 1;
    const maxPage = this.config.maxProductPages
      ? Math.min(lastPage, startPage + this.config.maxProductPages - 1)
      : lastPage;

    if (maxPage <= startPage) {
      return products;
    }

    const pendingPages: number[] = [];

    for (let page = startPage + 1; page <= maxPage; page += 1) {
      pendingPages.push(page);
    }

    const pageChunks = chunkArray(pendingPages, pageConcurrency);

    for (const chunk of pageChunks) {
      if (pageDelayMs > 0) {
        await sleep(pageDelayMs);
      }

      const payloads = await Promise.all(chunk.map((page) => this.requestItemsPage(page, query)));

      for (const payload of payloads) {
        products.push(...(extractRecords(payload) as FacturadorProduct[]));
      }
    }

    return products;
  }

  private async requestItemsPage(page: number, baseQuery: Record<string, string | number | boolean | null | undefined>) {
    let lastError: unknown = null;
    const query = {
      ...baseQuery,
      ...(this.config.productWarehouseId
        ? { warehouse_id: this.config.productWarehouseId }
        : {}),
      ...(this.config.orderByInternalId ? { order_by_internal_id: 1 } : {}),
    };

    for (let attempt = 0; attempt <= PAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await this.request("/items/records", {
          query: {
            page,
            ...query,
          },
          retry: false,
        });
      } catch (error) {
        lastError = error;

        if (!isPageRetryableError(error)) {
          throw annotatePageError(error, page);
        }

        if (attempt >= PAGE_RETRY_DELAYS_MS.length) {
          throw annotatePageError(error, page);
        }

        await sleep(PAGE_RETRY_DELAYS_MS[attempt]);
      }
    }

    throw annotatePageError(lastError, page);
  }

  async searchProducts(input = "") {
    const payload = await this.request("/document/search-items", {
      query: input ? { input } : undefined,
    });
    return extractRecords(payload) as FacturadorProduct[];
  }

  async getCategories() {
    const payload = await this.request("/categories-records");
    return extractRecords(payload) as FacturadorCategory[];
  }

  async getBrands() {
    const payload = await this.request("/brands-records");
    return extractRecords(payload) as FacturadorBrand[];
  }

  async getDefaultCustomer() {
    const payload = await this.request("/persons/default-customer");
    return extractRecord(payload) as FacturadorCustomer | null;
  }

  async searchCustomers(input = "") {
    const payload = await this.request("/persons/customers/records", {
      query: input ? { input } : undefined,
    });
    return extractRecords(payload) as FacturadorCustomer[];
  }

  async createCustomer(input: FacturadorQuoteCustomer, fallbackCustomer: FacturadorCustomer | null) {
    const districtId = getFirstString(fallbackCustomer, ["district_id"]) ?? "150101";
    const countryId = getFirstString(fallbackCustomer, ["country_id"]) ?? "PE";
    const payload = await this.request("/persons", {
      method: "POST",
      body: {
        number: input.documentNumber?.trim(),
        name: input.name.trim(),
        identity_document_type_id: input.documentType?.trim() || "0",
        country_id: countryId,
        location_id: buildLocationId(districtId),
        address: input.address?.trim() || "-",
        condition: "HABIDO",
        state: "ACTIVO",
        email: input.email?.trim() || null,
        telephone: input.phone.trim(),
        addresses: [],
        dispatch_addresses: [],
      },
    });

    return extractRecord(payload) as FacturadorCustomer | null;
  }

  async getSalesProducts() {
    const payload = await this.request("/items/records-sale");
    return extractRecords(payload) as FacturadorSalesProduct[];
  }

  async findQuotationRecord(input: {
    externalId?: string | null;
    quoteNumber?: string | null;
  }) {
    const candidates = [input.externalId?.trim(), input.quoteNumber?.trim()].filter(
      (value): value is string => Boolean(value),
    );

    for (const candidate of candidates) {
      const payload = await this.request("/quotations/list", {
        query: { input: candidate },
      });
      const records = extractRecords(payload);
      const exact = records.find((record) => matchesQuotationRecord(record, input));

      if (exact) {
        return exact;
      }
    }

    return null;
  }

  isFullProductSync() {
    return this.config.startProductPage === 1 && this.config.maxProductPages === null;
  }

  shouldHideMissingProducts() {
    return this.config.hideMissingProducts;
  }

  supportsIncrementalProductSync() {
    return Boolean(this.config.productUpdatedSinceParam?.trim());
  }

  get runningSyncTimeoutMs() {
    return this.config.runningSyncTimeoutMs;
  }

  async getProductRealTime(code: string, externalId?: string | null): Promise<FacturadorProduct | null> {
    try {
      const products = await this.searchProducts(code);
      const exact = products.find((product) =>
        matchesProductCode(product, { code, externalId, name: "", quantity: 1, unitPrice: 0 })
      );
      return exact ?? null;
    } catch {
      return null;
    }
  }

  async createQuotation(input: {
    customer: FacturadorQuoteCustomer;
    items: FacturadorQuoteItem[];
    note?: string;
  }): Promise<FacturadorQuotationResult> {
    if (!this.config.quotationPath) {
      throw new Error("No está configurado FACTURADOR_QUOTATION_PATH para enviar cotizaciones.");
    }

    const defaultCustomer = await this.getDefaultCustomer();
    const customerResolution = await this.resolveQuotationCustomer(input.customer, defaultCustomer);
    const customerId = customerResolution.customerId;

    if (!customerId) {
      throw new Error("El ERP no devolvió un cliente predeterminado válido para registrar la cotización.");
    }

    const matchedItems = await Promise.all(
      input.items.map(async (item) => {
        const erpItem = await this.findProductForQuotation(item);

        if (!erpItem) {
          throw new Error(`No se encontró el producto ${item.code} en el ERP para cotizar.`);
        }

        return buildQuotationLine(item, erpItem);
      }),
    );

    const totalTaxed = round2(
      matchedItems.reduce((sum, item) => sum + item.total_value, 0),
    );
    const totalIgv = round2(
      matchedItems.reduce((sum, item) => sum + item.total_igv, 0),
    );
    const total = round2(matchedItems.reduce((sum, item) => sum + item.total, 0));
    const issueDate = new Date();
    const additionalInformation = buildAdditionalInformation(input.customer, input.note);

    const response = await this.request(this.config.quotationPath, {
      method: "POST",
      body: {
        description: additionalInformation,
        prefix: this.config.quotationPrefix,
        establishment_id: getOptionalNumericEnv("FACTURADOR_ESTABLISHMENT_ID"),
        date_of_issue: issueDate.toISOString().slice(0, 10),
        time_of_issue: issueDate.toTimeString().slice(0, 8),
        customer_id: customerId,
        currency_type_id: "PEN",
        purchase_order: null,
        exchange_rate_sale: 1,
        total_prepayment: 0,
        total_charge: 0,
        total_discount: 0,
        total_exportation: 0,
        total_free: 0,
        total_taxed: totalTaxed,
        total_unaffected: 0,
        total_exonerated: 0,
        total_igv: totalIgv,
        total_igv_free: 0,
        total_base_isc: 0,
        total_isc: 0,
        total_base_other_taxes: 0,
        total_other_taxes: 0,
        total_taxes: totalIgv,
        total_value: totalTaxed,
        total,
        subtotal: total,
        operation_type_id: null,
        date_of_due: null,
        delivery_date: null,
        items: matchedItems,
        charges: [],
        discounts: [],
        attributes: [],
        guides: [],
        additional_information: additionalInformation,
        payment_method_type_id: "10",
        customer_address_id: null,
        shipping_address: input.customer.address?.trim() || null,
        account_number: null,
        terms_condition: null,
        active_terms_condition: false,
        sale_opportunity_id: null,
        contact: input.customer.name.trim() || customerResolution.customerName,
        phone: input.customer.phone.trim() || null,
        actions: {
          format_pdf: "a4",
        },
        payments: [
          {
            id: null,
            document_id: null,
            date_of_payment: issueDate.toISOString().slice(0, 10),
            payment_method_type_id: "01",
            reference: null,
            payment_destination_id: "cash",
            payment: total,
          },
        ],
      },
    });

    return {
      customerDocumentNumber: input.customer.documentNumber?.trim() || null,
      customerId,
      customerMode: customerResolution.mode,
      customerName: customerResolution.customerName,
      response,
      warnings: customerResolution.warnings,
    };
  }

  private async findProductForQuotation(item: FacturadorQuoteItem) {
    const products = await this.searchProducts(item.code);
    const exact = products.find((product) => matchesProductCode(product, item));
    return exact ?? products[0] ?? null;
  }

  private async resolveQuotationCustomer(
    input: FacturadorQuoteCustomer,
    defaultCustomer: FacturadorCustomer | null,
  ) {
    const warnings: string[] = [];
    const defaultCustomerId = getNumericRecordValue(defaultCustomer, ["id", "person_id", "customer_id"]);

    if (!defaultCustomerId) {
      throw new Error("El ERP no devolvió un cliente predeterminado válido para registrar la cotización.");
    }

    const exactCustomer = await this.findExactCustomer(input);

    if (exactCustomer) {
      return {
        customerId: getNumericRecordValue(exactCustomer, ["id", "person_id", "customer_id"]) ?? defaultCustomerId,
        customerName: getFirstString(exactCustomer, ["name", "description"]) ?? input.name,
        mode: "existing" as const,
        warnings,
      };
    }

    if (canCreateCustomer(input)) {
      try {
        const created = await this.createCustomer(input, defaultCustomer);
        const createdId = getNumericRecordValue(created, ["id", "person_id", "customer_id"]);

        if (createdId) {
          return {
            customerId: createdId,
            customerName: getFirstString(created, ["name", "description"]) ?? input.name,
            mode: "created" as const,
            warnings,
          };
        }

        const searchedAfterCreate = await this.findExactCustomer(input);

        if (searchedAfterCreate) {
          return {
            customerId:
              getNumericRecordValue(searchedAfterCreate, ["id", "person_id", "customer_id"]) ??
              defaultCustomerId,
            customerName: getFirstString(searchedAfterCreate, ["name", "description"]) ?? input.name,
            mode: "created" as const,
            warnings,
          };
        }

        warnings.push("El ERP no devolvió el cliente recién creado; se registró la cotización con cliente genérico.");
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `No se pudo crear el cliente en el ERP: ${error.message}`
            : "No se pudo crear el cliente en el ERP.",
        );
      }
    } else {
      warnings.push("Faltan documento y nombre fiscal completos para crear el cliente en el ERP; se usó el cliente genérico.");
    }

    return {
      customerId: defaultCustomerId,
      customerName: getFirstString(defaultCustomer, ["name", "description"]) ?? "Cliente tienda virtual",
      mode: "default" as const,
      warnings,
    };
  }

  private async findExactCustomer(input: FacturadorQuoteCustomer) {
    const candidates = [
      input.documentNumber?.trim(),
      input.email?.trim(),
      input.name.trim(),
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      const customers = await this.searchCustomers(candidate);
      const exact = customers.find((customer) => matchesCustomer(customer, input));

      if (exact) {
        return exact;
      }
    }

    return null;
  }
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function shouldRetry(status: number, message: string) {
  return status === 429 || /too many attempts|throttle|timeout|temporarily/i.test(message);
}

function sleep(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getFirstString(record: FacturadorRecord | null, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getNumericRecordValue(record: FacturadorRecord | null, keys: string[]) {
  const raw = getFirstString(record, keys);

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOptionalNumericEnv(name: string) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildLocationId(districtId: string) {
  const sanitized = districtId.replace(/[^\d]/g, "");

  if (sanitized.length >= 6) {
    return [sanitized.slice(0, 2), sanitized.slice(0, 4), sanitized.slice(0, 6)];
  }

  return ["15", "1501", "150101"];
}

function canCreateCustomer(input: FacturadorQuoteCustomer) {
  return Boolean(input.name.trim() && input.documentNumber?.trim() && input.documentType?.trim());
}

function buildAdditionalInformation(customer: FacturadorQuoteCustomer, note?: string) {
  const lines = [
    note?.trim() || "",
    customer.documentType && customer.documentNumber
      ? `Documento: ${customer.documentType} ${customer.documentNumber.trim()}`
      : "",
    customer.email?.trim() ? `Correo: ${customer.email.trim()}` : "",
    customer.phone.trim() ? `Teléfono: ${customer.phone.trim()}` : "",
    customer.address?.trim() ? `Dirección: ${customer.address.trim()}` : "",
  ].filter(Boolean);

  return lines.length ? lines.join(" | ") : null;
}

function normalizeText(value: string | null) {
  return value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim() ?? "";
}

function normalizeDigits(value: string | null) {
  return value?.replace(/[^\d]/g, "") ?? "";
}

function matchesCustomer(customer: FacturadorCustomer, input: FacturadorQuoteCustomer) {
  const customerNumber = normalizeDigits(getFirstString(customer, ["number"]));
  const requestedNumber = normalizeDigits(input.documentNumber?.trim() ?? null);

  if (customerNumber && requestedNumber) {
    return customerNumber === requestedNumber;
  }

  const customerEmail = normalizeText(getFirstString(customer, ["email"]));
  const requestedEmail = normalizeText(input.email?.trim() ?? null);

  if (customerEmail && requestedEmail) {
    return customerEmail === requestedEmail;
  }

  const customerName = normalizeText(getFirstString(customer, ["name", "description"]));
  const requestedName = normalizeText(input.name.trim());
  return customerName === requestedName;
}

function matchesQuotationRecord(
  record: FacturadorRecord,
  input: { externalId?: string | null; quoteNumber?: string | null },
) {
  const externalId = normalizeText(getFirstString(record, ["external_id"]));
  const fullNumber = normalizeText(getFirstString(record, ["number_full", "full_number", "identifier"]));
  const requestedExternalId = normalizeText(input.externalId?.trim() ?? null);
  const requestedQuoteNumber = normalizeText(input.quoteNumber?.trim() ?? null);

  return Boolean(
    (requestedExternalId && externalId === requestedExternalId) ||
      (requestedQuoteNumber && fullNumber === requestedQuoteNumber),
  );
}

function matchesProductCode(product: FacturadorRecord, item: FacturadorQuoteItem) {
  const candidates = [
    getFirstString(product, ["internal_id"]),
    getFirstString(product, ["item_code"]),
    getFirstString(product, ["barcode"]),
    getFirstString(product, ["code"]),
    getFirstString(product, ["id"]),
    getFirstString(product, ["item_id"]),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  const requestedCodes = [item.code, item.externalId ?? ""]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return requestedCodes.some((value) => candidates.includes(value));
}

function buildQuotationLine(item: FacturadorQuoteItem, erpItem: FacturadorRecord) {
  const hasIgv = erpItem.has_igv !== false;
  const quantity = Math.max(1, Math.floor(item.quantity));
  const unitPrice = round2(item.unitPrice);
  const unitValue = round2(hasIgv ? unitPrice / 1.18 : unitPrice);
  const totalValue = round2(unitValue * quantity);
  const total = round2(unitPrice * quantity);
  const totalIgv = round2(total - totalValue);
  const itemId = getNumericRecordValue(erpItem, ["id", "item_id"]);

  if (!itemId) {
    throw new Error(`El ERP no devolvió un item_id válido para ${item.code}.`);
  }

  return {
    item_id: itemId,
    item: erpItem,
    quantity,
    unit_value: unitValue,
    unit_price: unitPrice,
    affectation_igv_type_id:
      getFirstString(erpItem, ["sale_affectation_igv_type_id"]) ?? (hasIgv ? "10" : "20"),
    total_base_igv: hasIgv ? totalValue : 0,
    percentage_igv: hasIgv ? 18 : 0,
    total_igv: hasIgv ? totalIgv : 0,
    total_base_isc: 0,
    percentage_isc: 0,
    total_isc: 0,
    total_base_other_taxes: 0,
    total_other_taxes: 0,
    total_taxes: hasIgv ? totalIgv : 0,
    price_type_id: "01",
    total_value: totalValue,
    total_charge: 0,
    total_discount: 0,
    total: total,
    attributes: [],
    discounts: [],
    charges: [],
    name_product_pdf: item.name,
    total_plastic_bag_taxes: 0,
    warehouse_id: getWarehouseId(erpItem) ?? 1,
  };
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isPageRetryableError(error: unknown) {
  if (error instanceof FacturadorApiError) {
    return [408, 429, 500, 502, 503, 504].includes(error.status);
  }

  if (error instanceof FacturadorPageFetchError) {
    return error.retryable;
  }

  return true;
}

function annotatePageError(error: unknown, page: number) {
  if (error instanceof FacturadorPageFetchError) {
    return error;
  }

  if (error instanceof FacturadorApiError) {
    return new FacturadorPageFetchError(
      `Fallo al leer la página ${page} del ERP: ${error.message}`,
      page,
      error.status,
      error.payload,
      [408, 429, 500, 502, 503, 504].includes(error.status),
    );
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Error de conexión al leer la página del ERP.";

  return new FacturadorPageFetchError(
    `Fallo al leer la página ${page} del ERP: ${message}`,
    page,
    null,
    null,
    true,
  );
}

function getWarehouseId(item: FacturadorRecord) {
  const warehouses = item.warehouses;

  if (!Array.isArray(warehouses)) {
    return null;
  }

  for (const warehouse of warehouses) {
    if (!isRecord(warehouse)) {
      continue;
    }

    const id = getNumericRecordValue(warehouse, ["warehouse_id", "id"]);

    if (id) {
      return id;
    }
  }

  return null;
}
