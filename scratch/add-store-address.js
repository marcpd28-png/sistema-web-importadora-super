const fs = require('fs');

// 1. Patch schema
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
if (!schema.includes('storeAddress')) {
  schema = schema.replace(
    `  supportHours        String   @default("Lun a sáb 8:00 am - 7:00 pm")\r\n  primaryColor`,
    `  supportHours        String   @default("Lun a sáb 8:00 am - 7:00 pm")\r\n  storeAddress        String   @default("Jr. Huallaga 420, Cercado de Lima")\r\n  storeMapsUrl        String?  @db.Text\r\n  primaryColor`
  );
  // Try unix line endings too
  if (!schema.includes('storeAddress')) {
    schema = schema.replace(
      `  supportHours        String   @default("Lun a sáb 8:00 am - 7:00 pm")\n  primaryColor`,
      `  supportHours        String   @default("Lun a sáb 8:00 am - 7:00 pm")\n  storeAddress        String   @default("Jr. Huallaga 420, Cercado de Lima")\n  storeMapsUrl        String?  @db.Text\n  primaryColor`
    );
  }
  fs.writeFileSync('prisma/schema.prisma', schema);
  console.log('Schema patched:', schema.includes('storeAddress') ? '✓' : '✗ FAILED');
} else {
  console.log('Schema already has storeAddress');
}
