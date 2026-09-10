const fs = require('fs');
const c = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');
const idx = c.indexOf('quoteState === "success"');
console.log(c.substring(idx, idx + 800));
