const fs = require('fs');

let code = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');

// ─── 1. Add productId to items mapping in the Culqi handler ──────────────────
// The existing code has: code: item.code,\n            name: item.name,
// We need to insert productId before code
code = code.replace(
  /items: orderLines\.map\(\(\{ item \}\) => \(\{\n            code: item\.code,\n            name: item\.name,\n            quantity: item\.quantity,\n            unitPrice: Number\(item\.unitPrice\),\n          \}\)\),\n          promoCodeId: appliedPromo\?\.promoCodeId,\n          currency: "PEN",/,
  `items: orderLines.map(({ item }) => ({
            productId: item.id,
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
          promoCode: appliedPromo?.code || undefined,`
);

// ─── 2. Replace the success handler in handleCulqiToken ──────────────────────
// Currently it does: setQuoteState("success"); ... clear();
// We need it to also set the WhatsApp link from the response
code = code.replace(
  /const payload = await response\.json\(\);\n      \n      if \(!response\.ok\) \{\n        throw new Error\(payload\.message \|\| "Error al procesar el pago"\);\n      \}\n      \n      setQuoteState\("success"\);\n      setQuoteMessage\("Pago exitoso\. Tu pedido ha sido registrado\."\);\n      setQuoteMessageTone\("success"\);\n      clear\(\);/,
  `const payload = await response.json();
      
      if (!response.ok) {
        throw new Error(payload.message || "Error al procesar el pago");
      }
      
      setQuoteState("success");
      setQuoteMessage(payload.message || "¡Pago exitoso! Tu pedido ha sido registrado.");
      setQuoteMessageTone("success");
      if (payload.whatsappLink) {
        setQuoteWhatsappHref(payload.whatsappLink);
      }
      if (payload.status === "PAID") {
        clear();
      }`
);

// ─── 3. Insert handleManualPayment BEFORE handleCulqiError ───────────────────
code = code.replace(
  `  const handleCulqiError = (error: string) => {`,
  `  const handleManualPayment = async (method: "INTERBANK" | "YAPE" | "PLIN") => {
    setQuoteState("loading");
    setQuoteMessage("Registrando pedido...");
    setQuoteMessageTone("neutral");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: method,
          customer: {
            name: quoteDraft.name,
            phone: quoteDraft.phone,
            documentType: quoteDraft.documentType || undefined,
            documentNumber: quoteDraft.documentNumber || undefined,
          },
          items: orderLines.map(({ item }) => ({
            productId: item.id,
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
          promoCode: appliedPromo?.code || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Error registrando el pedido");
      setQuoteState("success");
      setQuoteMessage(payload.message || "¡Pedido registrado! Envíanos tu comprobante por WhatsApp.");
      setQuoteMessageTone("success");
      if (payload.whatsappLink) setQuoteWhatsappHref(payload.whatsappLink);
    } catch (error) {
      setQuoteState("error");
      setQuoteMessage(error instanceof Error ? error.message : "Error registrando el pedido");
      setQuoteMessageTone("error");
    }
  };

  const handleCulqiError = (error: string) => {`
);

fs.writeFileSync('src/components/catalog/cart-drawer.tsx', code);
console.log("Cart drawer updated successfully!");

// Verify
const result = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');
const checks = ['handleManualPayment', 'whatsappLink', 'payload.message'];
checks.forEach(c => {
  console.log(`  ${c}: ${result.includes(c) ? '✓' : '✗ MISSING'}`);
});
