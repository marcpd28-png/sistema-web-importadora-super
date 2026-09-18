import { PackageCheck, Tags } from "lucide-react";
import type { CatalogProduct } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

export function getProductDiscountPercent(product: CatalogProduct) {
  return product.wholesalePrice && product.wholesalePrice < product.unitPrice
    ? Math.round(((product.unitPrice - product.wholesalePrice) / product.unitPrice) * 100)
    : 0;
}

export function getProductStockState(product: CatalogProduct) {
  const tone =
    product.stockUnits <= 0 ? "is-empty" : product.stockUnits <= 5 ? "is-low" : "is-ready";
  const label =
    product.stockUnits <= 0
      ? "Sin stock"
      : product.stockUnits <= 5
        ? `Stock bajo: ${product.stockUnits}`
        : `${product.stockUnits} disponibles`;

  return { label, tone };
}

export function ProductPriceRows({
  currencySymbol,
  product,
  showWholesalePrice = true,
}: {
  currencySymbol: string;
  product: CatalogProduct;
  showWholesalePrice?: boolean;
}) {
  return (
    <>
      <div className="price-row is-unitary">
        <span>
          <Tags size={16} />
          Unitario
        </span>
        <strong>{formatCurrency(product.unitPrice, currencySymbol)}</strong>
      </div>
      {showWholesalePrice ? (
        <div className="price-row is-wholesale">
          <span>Mayorista desde {product.wholesaleMinQty} uds.</span>
          <strong>
            {formatCurrency(
              product.wholesalePrice ?? product.unitPrice,
              currencySymbol,
            )}
          </strong>
        </div>
      ) : null}
    </>
  );
}

export function ProductStockChip({ product }: { product: CatalogProduct }) {
  const stock = getProductStockState(product);

  return (
    <span className={`product-stock-chip ${stock.tone}`}>
      <PackageCheck size={13} />
      {stock.label}
    </span>
  );
}
