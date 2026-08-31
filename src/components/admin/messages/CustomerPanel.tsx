import type { Conversation } from "@/types/messages";
import { ProductContextCard } from "./ProductContextCard";

interface Props {
  conversation: Conversation;
}

export function CustomerPanel({ conversation }: Props) {
  const { contact, channel, status, assignedUser, productContext } = conversation;

  return (
    <div className="messages-customer-panel">
      <div className="panel-section">
        <h4 className="panel-section-title">Información del Cliente</h4>
        
        <div className="info-row">
          <span className="info-label">Cliente:</span>
          <span className="info-value">{contact.name}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Teléfono:</span>
          <span className="info-value">{contact.phone || contact.phoneNormalized || 'N/A'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Canal:</span>
          <span className="info-value" style={{ textTransform: 'capitalize' }}>{channel.toLowerCase()}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Estado:</span>
          <span className="info-value">{status.replace('_', ' ')}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Asesor:</span>
          <span className="info-value">{assignedUser?.name || 'Sin asignar'}</span>
        </div>
        
        {contact.tags.length > 0 && (
          <div className="tags-list">
            {contact.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {productContext && (
        <div className="panel-section">
          <h4 className="panel-section-title">Producto Consultado</h4>
          <ProductContextCard product={productContext} />
        </div>
      )}

      <div className="panel-section">
        <h4 className="panel-section-title">Pedidos Recientes</h4>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          No hay pedidos recientes.
        </div>
      </div>
      
      <div className="panel-section" style={{ borderBottom: 'none' }}>
        <h4 className="panel-section-title">Notas</h4>
        <textarea 
          style={{ 
            width: '100%', 
            minHeight: '80px', 
            padding: '8px',
            fontSize: '13px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            background: 'var(--bg-alt)'
          }}
          placeholder="Añadir una nota interna..."
        />
      </div>
    </div>
  );
}
