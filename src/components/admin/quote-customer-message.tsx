"use client";

import { useState } from "react";
import { Copy, FileText } from "lucide-react";

type QuoteCustomerMessageProps = {
  customerName: string;
  customerPhone: string;
  customerMessage: string;
  pdfLink?: string;
  quoteNumber?: string | null;
};

export function QuoteCustomerMessage({
  customerName,
  customerPhone,
  customerMessage,
  pdfLink,
  quoteNumber,
}: QuoteCustomerMessageProps) {
  void customerPhone;
  const [replyText, setReplyText] = useState(
    `Hola ${customerName}, te contacto sobre tu cotización ${quoteNumber || ""}. En respuesta a tu mensaje: "${customerMessage}".${pdfLink ? `\n\nPuedes ver tu cotización en PDF aquí: ${pdfLink}` : ""}`
  );

  return (
    <div className="panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "#f8fafc", borderLeft: "4px solid #2563eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <FileText size={18} style={{ color: "#2563eb" }} />
        <h2 style={{ color: "#1e293b", fontSize: "15px", fontWeight: "700", margin: 0 }}>Mensaje del Cliente</h2>
      </div>
      <p style={{ color: "#334155", fontSize: "14px", lineHeight: "1.6", marginTop: "4px", fontStyle: "italic", background: "white", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
        "{customerMessage}"
      </p>

      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <label style={{ fontSize: "13px", fontWeight: "600", color: "#475569" }}>Responder al cliente:</label>
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Redacta la respuesta para el cliente..."
          style={{
            width: "100%",
            minHeight: "160px",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            fontSize: "13px",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(replyText.trim())}
          className="button button-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              height: "36px",
              padding: "0 16px",
              fontSize: "13px",
              borderRadius: "8px",
              alignSelf: "flex-end",
            }}
          >
            <Copy size={14} />
            Copiar respuesta
          </button>
      </div>
    </div>
  );
}
