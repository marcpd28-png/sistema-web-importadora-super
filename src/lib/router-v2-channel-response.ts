import type { buildRouterV2ResponseContext } from "@/lib/router-v2-response-context";
import { resolveServerMediaUrl } from "@/lib/server-media-url";

type ResponseContext = ReturnType<typeof buildRouterV2ResponseContext>;

const WHATSAPP_TEXT_CHUNK_SIZE = 4000;

export type RouterV2OutboundMessage =
  | {
      type: "TEXT";
      text: string;
    }
  | {
      type: "IMAGE";
      imageUrl: string;
      caption?: string;
    }
  | {
      type: "DOCUMENT";
      documentUrl: string;
      filename?: string;
      caption?: string;
    };

function money(value: number | null, currency = "S/") {
  if (value === null || !Number.isFinite(value)) return null;
  return `${currency}${value.toFixed(2)}`;
}

export function splitRouterV2WhatsappText(
  value: string,
  maxLength = WHATSAPP_TEXT_CHUNK_SIZE,
) {
  const chunks: string[] = [];
  let remaining = value.trim();

  if (maxLength < 1) return chunks;

  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength + 1);
    const breakpoints = [
      candidate.lastIndexOf("\n\n"),
      candidate.lastIndexOf("\n"),
      candidate.lastIndexOf(" "),
    ];
    const safeBreakpoint = breakpoints.find(
      (index) => index >= Math.floor(maxLength * 0.6),
    );
    const cut = safeBreakpoint && safeBreakpoint > 0
      ? safeBreakpoint
      : maxLength;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function buildRouterV2OutboundMessages(input: {
  context: ResponseContext;
  draftText: string;
}) {
  const messages: RouterV2OutboundMessage[] = [];
  const context = input.context;
  const currency = context.business?.currencySymbol || "S/";

  if (
    context.answerType === "WHOLESALE_CATALOG" &&
    context.catalog.wholesaleCatalogUrl
  ) {
    messages.push({
      type: "DOCUMENT",
      documentUrl: resolveServerMediaUrl(
        context.catalog.wholesaleCatalogUrl,
      ),
      filename: "catalogo-mayorista.pdf",
      caption: "Catálogo mayorista",
    });
  }

  if (context.answerType === "RETAIL_DISCOVERY") {
    for (const product of context.catalog.retailProducts.slice(0, 4)) {
      if (!product.imageUrl) continue;
      messages.push({
        type: "IMAGE",
        imageUrl: resolveServerMediaUrl(product.imageUrl),
        caption: `${product.name}\nCódigo: ${product.code}\nPrecio: ${money(product.unitPrice, currency)}`,
      });
    }
  }

  if (
    [
      "PRODUCT_CONFIRMED",
      "PRODUCT_DETAILS",
      "PRODUCT_SPECIFICATION",
      "PRODUCT_PRICE",
      "PRODUCT_STOCK",
      "PRODUCT_WHOLESALE",
    ].includes(context.answerType) &&
    context.product?.imageUrl
  ) {
    messages.push({
      type: "IMAGE",
      imageUrl: resolveServerMediaUrl(context.product.imageUrl),
      caption: context.sales.productName ?? undefined,
    });
  }

  if (
    (context.answerType === "VARIANT_OPTIONS" ||
      context.answerType === "VARIANT_CLARIFICATION") &&
    context.sales.shownProducts.length > 0
  ) {
    for (const product of context.sales.shownProducts.slice(0, 5)) {
      if (!product.imageUrl) continue;
      const price = money(product.unitPrice, currency);
      messages.push({
        type: "IMAGE",
        imageUrl: resolveServerMediaUrl(product.imageUrl),
        caption: `${product.position ?? "-"}. ${product.name}${price ? `\nPrecio: ${price}` : ""}`,
      });
    }
  }

  for (const text of splitRouterV2WhatsappText(input.draftText)) {
    messages.push({
      type: "TEXT",
      text,
    });
  }

  return messages;
}
