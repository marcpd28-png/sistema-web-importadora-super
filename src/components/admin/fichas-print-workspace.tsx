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
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
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
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
        .print-actions-bar {
          background: white;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          position: sticky;
          top: 0;
          z-index: 100;
          width: 100%;
          height: 60px;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
          box-sizing: border-box;
          padding: 0 24px;
        }
        .print-btn {
          background: #2320DA;
          color: white;
          padding: 0 20px;
          height: 38px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .print-btn:hover {
          background: #1b17a6;
        }
        .print-btn:active {
          transform: translateY(1px);
        }
        .close-btn {
          background: #f1f5f9;
          color: #334155;
          padding: 0 20px;
          height: 38px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .close-btn:hover {
          background: #e2e8f0;
        }
        .close-btn:active {
          transform: translateY(1px);
        }
        .print-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 24px;
          padding: 24px;
          max-width: 1200px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        .print-card {
          border: 1px solid #e2e8f0;
          padding: 24px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          background: white;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
          position: relative;
          transition: transform 0.2s ease;
        }
        .print-card:hover {
          transform: translateY(-2px);
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
          font-size: 15px;
          line-height: 1.4;
          margin-bottom: 6px;
          color: #0f172a;
          height: 42px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .print-card-sku {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 16px;
          background: #f1f5f9;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .print-card-qr {
          width: 160px;
          height: 160px;
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
          max-width: 200px;
        }
      `}</style>

      <div className="print-actions-bar no-print">
        <button onClick={() => window.print()} className="print-btn">
          Imprimir Tarjetas
        </button>
        <button onClick={() => window.close()} className="close-btn">
          Cerrar Vista de Impresión
        </button>
      </div>

      <div className="print-grid">
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
                  width: "160px",
                  height: "160px",
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
    </div>
  );
}
