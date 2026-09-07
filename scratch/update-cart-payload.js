const fs = require('fs');

let code = fs.readFileSync('src/components/catalog/cart-drawer.tsx', 'utf8');

// The replacement logic
code = code.replace(
  /items: orderLines\.map\(\(\{ item \}\) => \(\{\s*code: item\.code,\s*name: item\.name,\s*quantity: item\.quantity,\s*unitPrice: Number\(item\.unitPrice\),\s*\}\)\),/g,
  `items: orderLines.map(({ item }) => ({
            productId: item.id,
            code: item.code,
            name: item.name,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),`
);

fs.writeFileSync('src/components/catalog/cart-drawer.tsx', code);
console.log("Updated cart-drawer");
