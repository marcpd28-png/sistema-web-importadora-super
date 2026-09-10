const fs = require('fs');
const c = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');
// Find the success block
const start = c.indexOf('quoteState === "success" ? (');
const end = c.indexOf(') : null', start) + ') : null'.length;
console.log(c.substring(start, end));
