"use client";

type PrintProduct = {
  id: string;
  name: string;
  code: string;
  unitPrice: number;
  qr: {
    imageUrl: string | null;
  } | null;
};

type FichasPrintWorkspaceProps = {
  products: PrintProduct[];
};

export function FichasPrintWorkspace({ products }: FichasPrintWorkspaceProps) {
  return (
    <div className="print-grid">
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-card {
            page-break-inside: avoid;
            border: 2px solid #000 !important;
          }
        }
        .print-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 24px;
          padding: 20px;
          background: #f8fafc;
          min-height: 100vh;
        }
        .print-card {
          border: 2px dashed #cbd5e1;
          padding: 20px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          background: white;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .print-card-brand {
          font-size: 11px;
          font-weight: 800;
          color: #2320DA;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .print-card-header {
          font-weight: 700;
          font-size: 16px;
          line-height: 1.4;
          margin-bottom: 4px;
          color: #0f172a;
          height: 44px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .print-card-sku {
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
          margin-bottom: 16px;
        }
        .print-card-qr {
          width: 180px;
          height: 180px;
          margin-bottom: 16px;
          object-fit: contain;
        }
        .print-card-price {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 6px;
        }
        .print-card-footer {
          font-size: 10px;
          font-weight: 500;
          color: #64748b;
          margin-top: 8px;
          line-height: 1.4;
        }
        .print-actions {
          padding: 16px 24px;
          background: white;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: center;
          gap: 12px;
          position: sticky;
          top: 0;
          z-index: 10;
          width: 100%;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
        }
        .print-btn {
          background: #2320DA;
          color: white;
          padding: 10px 24px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: background 0.15s ease;
        }
        .print-btn:hover {
          background: #1b17a6;
        }
        .close-btn {
          background: #f1f5f9;
          color: #334155;
          padding: 10px 24px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          transition: background 0.15s ease;
        }
        .close-btn:hover {
          background: #e2e8f0;
        }
      `}</style>

      <div className="print-actions no-print" style={{ gridColumn: "1 / -1" }}>
        <button onClick={() => window.print()} className="print-btn">
          Imprimir Tarjetas
        </button>
        <button onClick={() => window.close()} className="close-btn">
          Cerrar Vista de Impresión
        </button>
      </div>

      {products.map((p) => (
        <div key={p.id} className="print-card">
          <div className="print-card-brand">IMPORTACIONES SUPER</div>
          <div className="print-card-header">{p.name}</div>
          <div className="print-card-sku">SKU: {p.code}</div>
          {p.qr?.imageUrl ? (
            <img className="print-card-qr" src={p.qr.imageUrl} alt={`QR ${p.name}`} />
          ) : (
            <div
              style={{
                width: "180px",
                height: "180px",
                border: "1px dashed #cbd5e1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                color: "#64748b",
                borderRadius: "8px",
                marginBottom: "16px",
              }}
            >
              Sin QR generado
            </div>
          )}
          <div className="print-card-price">S/ {Number(p.unitPrice).toFixed(2)}</div>
          <div className="print-card-footer">
            Escanea el código QR para ver especificaciones y videos de uso
          </div>
        </div>
      ))}
    </div>
  );
}
