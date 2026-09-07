const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

schema = schema.replace(
  '  customerAddress        String?     @db.Text\r\n\r\n  currencySymbol',
  '  customerAddress        String?     @db.Text\r\n  deliveryType           String?     @db.VarChar(30)\r\n\r\n  currencySymbol'
);

fs.writeFileSync('prisma/schema.prisma', schema);
console.log('Done! deliveryType added:', schema.includes('deliveryType') ? 'YES' : 'NO');
