const fs = require('fs');
let code = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');

// 1. Add deliveryType and address to handleManualPayment payload
code = code.replace(
  `        body: JSON.stringify({
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
        }),`,
  `        body: JSON.stringify({
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
          deliveryType: quoteDraft.deliveryType,
          address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(', ') || undefined,
        }),`
);

// 2. Add deliveryType and address to handleCulqiToken payload
code = code.replace(
  `          promoCode: appliedPromo?.code || undefined,
        }),
      });
      const payload = await response.json();
      
      if (!response.ok) {
        throw new Error(payload.message || "Error al procesar el pago");`,
  `          promoCode: appliedPromo?.code || undefined,
          deliveryType: quoteDraft.deliveryType,
          address: [quoteDraft.address, quoteDraft.district].filter(Boolean).join(', ') || undefined,
        }),
      });
      const payload = await response.json();
      
      if (!response.ok) {
        throw new Error(payload.message || "Error al procesar el pago");`
);

fs.writeFileSync('src/components/catalog/cart-drawer.tsx', code);

const result = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');
const matches = (result.match(/deliveryType: quoteDraft\.deliveryType/g) || []).length;
console.log(`deliveryType sent in payloads: ${matches} times (expected 2)`);
