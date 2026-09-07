const fs = require('fs');

let code = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');

// Find the broken overlay block and replace from the last occurrence
const broken = `{quoteFormOpen ? (
        <div
          className="cart-quote-overlay"
          onClick={() => setQuoteFormOpen(false)}
          role="presentation"
        >
          <div
              title={settings.businessName}
              isOpen={culqiOpen}
              onClose={() => setCulqiOpen(false)}
              onToken={handleCulqiToken}
              onError={handleCulqiError}
            />
          </div>
        </div>
      ) : null}`;

const fixed = `{quoteFormOpen ? (
        <div
          className="cart-quote-overlay"
          onClick={() => setQuoteFormOpen(false)}
          role="presentation"
        >
          <div
            aria-modal="true"
            className="cart-quote-overlay-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <QuoteForm
              draft={quoteDraft}
              hasAccountDefaults={hasAccountDefaults}
              isReady={isQuoteReady}
              onChange={updateQuoteDraft}
              onClose={() => setQuoteFormOpen(false)}
              onReset={resetQuoteDraft}
              onSubmitQuote={submitQuoteToErp}
              onOpenPayment={() => setCulqiOpen(true)}
              onManualPayment={handleManualPayment}
              quoteMessage={quoteMessage}
              quoteMessageTone={quoteMessageTone}
              quoteState={quoteState}
              quoteStatusSteps={quoteStatusSteps}
              quoteWhatsappHref={quoteWhatsappHref}
            />
            <CulqiCheckout
              publicKey="pk_test_a0437cd3339ed240"
              amount={Math.round(finalTotalAmount * 100)}
              currency="PEN"
              title={settings.businessName}
              isOpen={culqiOpen}
              onClose={() => setCulqiOpen(false)}
              onToken={handleCulqiToken}
              onError={handleCulqiError}
            />
          </div>
        </div>
      ) : null}`;

// Normalize line endings for comparison
const normalizedCode = code.replace(/\r\n/g, '\n');
const normalizedBroken = broken.replace(/\r\n/g, '\n');
const normalizedFixed = fixed.replace(/\r\n/g, '\n');

if (!normalizedCode.includes(normalizedBroken)) {
  console.log("Pattern not found! Trying alternate approach...");
  // Just find the last quoteFormOpen block and replace everything from it to end of component
  const lastIdx = normalizedCode.lastIndexOf('{quoteFormOpen ?');
  const asideEnd = normalizedCode.lastIndexOf('    </aside>');
  
  const newCode = normalizedCode.substring(0, lastIdx) + normalizedFixed + '\n    </aside>\n  );\n}\n';
  fs.writeFileSync('src/components/catalog/cart-drawer.tsx', newCode);
  console.log("Fixed via lastIndexOf approach");
} else {
  const newCode = normalizedCode.replace(normalizedBroken, normalizedFixed);
  fs.writeFileSync('src/components/catalog/cart-drawer.tsx', newCode);
  console.log("Fixed via replace");
}

// Verify
const result = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');
const checks = ['onManualPayment={handleManualPayment}', 'cart-quote-overlay-panel', 'CulqiCheckout'];
checks.forEach(c => console.log(`  ${c}: ${result.includes(c) ? '✓' : '✗ MISSING'}`));
