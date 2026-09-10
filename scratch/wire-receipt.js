const fs = require('fs');
let code = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');

// 1. Add OrderReceipt import after existing imports
if (!code.includes('order-receipt')) {
  code = code.replace(
    `import { BadgeCheck,`,
    `import { OrderReceipt, type ReceiptData } from "@/components/catalog/order-receipt";\nimport { BadgeCheck,`
  );
  console.log('Import added:', code.includes('order-receipt') ? '✓' : '✗');
}

// 2. Add receiptData state variable near the other quote state vars
if (!code.includes('receiptData')) {
  code = code.replace(
    `const [quoteWhatsappHref, setQuoteWhatsappHref] = useState<string | null>(null);`,
    `const [quoteWhatsappHref, setQuoteWhatsappHref] = useState<string | null>(null);\n  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);`
  );
  console.log('receiptData state added:', code.includes('receiptData') ? '✓' : '✗');
}

// 3. In handleManualPayment, store receipt after success — find the existing setQuoteWhatsappHref call inside handleManualPayment
code = code.replace(
  `if (payload.whatsappLink) {
          setQuoteWhatsappHref(payload.whatsappLink);
        }
        // Only clear cart for PAID
        if (payload.status === "PAID") {`,
  `if (payload.whatsappLink) {
          setQuoteWhatsappHref(payload.whatsappLink);
        }
        if (payload.receipt) {
          setReceiptData({
            ...payload.receipt,
            customerName: quoteDraft.name,
            customerPhone: quoteDraft.phone,
            businessName: settings.businessName,
            storeAddress: (settings as any).storeAddress || "Jr. Huallaga 420, Cercado de Lima",
            whatsappNumber: settings.whatsappNumber,
          });
        }
        // Only clear cart for PAID
        if (payload.status === "PAID") {`
);
console.log('Manual payment receipt wired:', code.includes('setReceiptData') ? '✓' : '✗');

// 4. In handleCulqiToken, also store receipt
code = code.replace(
  `if (payload.status === "PAID") {
          clear();
        }`,
  `if (payload.receipt) {
          setReceiptData({
            ...payload.receipt,
            customerName: quoteDraft.name,
            customerPhone: quoteDraft.phone,
            businessName: settings.businessName,
            storeAddress: (settings as any).storeAddress || "Jr. Huallaga 420, Cercado de Lima",
            whatsappNumber: settings.whatsappNumber,
          });
        }
        if (payload.status === "PAID") {
          clear();
        }`
);

// 5. Replace the success state block to include the receipt component
const successBlockTarget = `quoteState === "success" ? (
        <div className="cart-quote-success" role="status" aria-live="polite" style={{ backgroundColor: "#fffbeb", border: "2px solid #fbbf24", padding: "20px", borderRadius: "12px", textAlign: "center" }}>
          <div className="cart-quote-success-copy" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ width: "48px", height: "48px", backgroundColor: "#fbbf24", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BadgeCheck size={28} color="#fff" />
            </div>
            <div>
              <strong style={{ fontSize: "18px", color: "#92400e", display: "block", marginBottom: "8px" }}>¡Paso final obligatorio! 🛑</strong>
              <span style={{ fontSize: "14px", color: "#b45309", lineHeight: "1.5", display: "block" }}>
                Tu pedido ha sido registrado en nuestro sistema. Para procesar tu envío de inmediato y confirmar tu pago, es <strong>obligatorio</strong> que nos envíes tu comprobante o número de orden por WhatsApp.
              </span>
            </div>
          </div>`;

const successBlockReplacement = `quoteState === "success" ? (
        <div className="cart-quote-success" role="status" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" }}>
          {/* Success header */}
          <div style={{ backgroundColor: "#f0fdf4", border: "2px solid #86efac", padding: "16px", borderRadius: "12px", textAlign: "center" }}>
            <div style={{ width: "48px", height: "48px", backgroundColor: "#10b981", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
              <BadgeCheck size={28} color="#fff" />
            </div>
            <strong style={{ fontSize: "17px", color: "#166534", display: "block", marginBottom: "6px" }}>¡Pedido registrado exitosamente! ✅</strong>
            <span style={{ fontSize: "13px", color: "#15803d", lineHeight: "1.5", display: "block" }}>
              Envíanos la foto de tu voucher de pago por WhatsApp para confirmar y despachar tu pedido.
            </span>
          </div>

          {/* Receipt */}
          {receiptData && <OrderReceipt data={receiptData} />}

          {/* Dummy div placeholder for the WhatsApp button that follows */}
          <div>`;

if (code.includes(successBlockTarget)) {
  code = code.replace(successBlockTarget, successBlockReplacement);
  // Also close the extra div we opened — find the end of the block  
  // The original had </div> (closing cart-quote-success-copy) then the WhatsApp buttons then </div> (closing cart-quote-success)
  // We added an extra <div> above, so we need to add an extra </div> somewhere
  // Actually let me close the <div> we added right before the WhatsApp section
  code = code.replace(
    `          {/* Dummy div placeholder for the WhatsApp button that follows */}
          <div>`,
    ``
  );
  console.log('Success block replaced: ✓');
} else {
  console.log('Success block NOT found — need manual fix');
}

fs.writeFileSync('src/components/catalog/cart-drawer.tsx', code);
console.log('Done! receiptData occurrences:', (code.match(/receiptData/g) || []).length);
