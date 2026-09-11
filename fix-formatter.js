const fs = require('fs');
const path = require('path');
const file = path.join(process.cwd(), 'src/components/admin/advanced-dashboard-charts.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/formatter=\{\(value: number\) => formatCurrency\(value, "S\/"\)\}/g, 'formatter={(value: any) => formatCurrency(Number(value), "S/")}');

fs.writeFileSync(file, content);
