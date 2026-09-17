import { searchInternalProducts } from "@/lib/internal-product-search";

export async function searchFlowCatalog(query: string, limit: number) {
  const products = await searchInternalProducts({ query, limit });
  if (!products.length) return "No encontré productos para esa búsqueda. Escríbeme el nombre o código del producto, o solicita un asesor.";
  return products.map((product) => [
    `${product.name} (${product.code})`,
    `Precio unitario: S/ ${product.unitPrice.toFixed(2)}`,
    ...(product.wholesalePrice !== null ? [`Por mayor: S/ ${product.wholesalePrice.toFixed(2)} desde ${product.wholesaleMinQty} unidades`] : []),
    product.stockUnits > 0 ? `Stock: ${product.stockUnits} unidades` : "Sin stock disponible",
    product.url,
  ].join("\n")).join("\n\n");
}
