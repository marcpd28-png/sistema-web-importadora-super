import { ProductContext } from "@/types/messages";
import { ExternalLink, Copy, Send } from "lucide-react";

interface Props {
  product: ProductContext;
}

export function ProductContextCard({ product }: Props) {
  return (
    <div className="product-card">
      <div className="product-card-header">{product.name}</div>
      <div className="product-card-info">Código: {product.code}</div>
      {product.color && <div className="product-card-info">Color: {product.color}</div>}
      <div className="product-card-info">Stock: <strong style={{ color: product.stock > 0 ? '#15803d' : '#b91c1c' }}>{product.stock} unidades</strong></div>
      <div className="product-card-price">S/ {product.price.toFixed(2)}</div>
      
      <div className="product-card-actions">
        <button className="btn btn-outline" style={{ flex: 1, padding: '4px', fontSize: '11px' }}>
          <ExternalLink size={12} /> Ver
        </button>
        <button className="btn btn-outline" style={{ flex: 1, padding: '4px', fontSize: '11px' }}>
          <Copy size={12} /> Copiar
        </button>
        <button className="btn btn-outline" style={{ flex: 1, padding: '4px', fontSize: '11px' }}>
          <Send size={12} /> Enviar
        </button>
      </div>
    </div>
  );
}
