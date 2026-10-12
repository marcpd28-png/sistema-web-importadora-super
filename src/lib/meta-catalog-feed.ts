import { buildPublicUrl } from "@/lib/site-url";
import { getPreferredProductImageUrl, isRealProductPhotoUrl } from "@/lib/product-media";

export type MetaCatalogFeedProduct = {
  code: string;
  slug: string;
  name: string;
  description: string | null;
  technicalSpecs: string | null;
  brand: string | null;
  category: string | null;
  unitPrice: { toString(): string } | number;
  wholesalePrice: { toString(): string } | number | null;
  stockUnits: number;
  localImageUrl: string | null;
  imageUrl: string | null;
  media: Array<{ url: string; type: string }>;
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function amount(value: MetaCatalogFeedProduct["unitPrice"]) {
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

/**
 * Produces a factual product description for Meta. This intentionally does not
 * add purchase warnings or ask shoppers to confirm specifications: the feed is
 * an index of known catalogue data, not a customer-facing legal notice.
 */
export function buildMetaCatalogDescription(product: MetaCatalogFeedProduct) {
  const parts: string[] = [];
  const description = cleanText(product.description);
  const specs = cleanText(product.technicalSpecs);
  const category = cleanText(product.category);

  if (description) parts.push(description);
  if (specs && specs !== description) parts.push(specs);
  if (!parts.length) {
    parts.push(`${cleanText(product.name) || "Producto"} (SKU ${product.code}).`);
  }
  if (category && !parts.join(" ").toLocaleLowerCase("es-PE").includes(category.toLocaleLowerCase("es-PE"))) {
    parts.push(`Categoría: ${category}.`);
  }

  if (product.wholesalePrice !== null) {
    parts.push(`Precio por mayor desde 3 unidades: S/ ${amount(product.wholesalePrice)}.`);
  }

  return parts.join(" ").slice(0, 5000);
}

function absoluteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return buildPublicUrl(value.startsWith("/") ? value : `/${value}`);
}

export function isMetaFeedReady(product: MetaCatalogFeedProduct) {
  const title = cleanText(product.name);
  const image = getPreferredProductImageUrl(product);

  return Boolean(
    product.code.trim() &&
      title &&
      product.stockUnits > 0 &&
      Number(product.unitPrice.toString()) > 0 &&
      image &&
      isRealProductPhotoUrl(image),
  );
}

export function buildMetaCatalogFeed(products: MetaCatalogFeedProduct[]) {
  const items = products
    .filter(isMetaFeedReady)
    .map((product) => {
      const image = getPreferredProductImageUrl(product)!;
      const productUrl = buildPublicUrl(`/producto/${encodeURIComponent(product.slug)}`);
      const brand = cleanText(product.brand);
      const category = cleanText(product.category);
      const wholesale = product.wholesalePrice === null ? "" : `\n      <g:custom_label_0>${xml(`Mayor desde 3 unidades: S/ ${amount(product.wholesalePrice)}`)}</g:custom_label_0>`;

      return `    <item>
      <g:id>${xml(product.code.trim())}</g:id>
      <g:title>${xml(cleanText(product.name))}</g:title>
      <g:description>${xml(buildMetaCatalogDescription(product))}</g:description>
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${amount(product.unitPrice)} PEN</g:price>
      <g:link>${xml(productUrl)}</g:link>
      <g:image_link>${xml(absoluteUrl(image))}</g:image_link>${brand ? `\n      <g:brand>${xml(brand)}</g:brand>` : ""}${category ? `\n      <g:product_type>${xml(category)}</g:product_type>` : ""}${wholesale}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Importaciones Super</title>
    <link>${xml(buildPublicUrl("/"))}</link>
    <description>Catálogo de productos disponibles de Importaciones Super</description>
${items}
  </channel>
</rss>`;
}
