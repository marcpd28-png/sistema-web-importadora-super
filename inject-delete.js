const fs = require('fs');
const path = require('path');

const quotesPage = path.join(process.cwd(), 'src/app/admin/quotes/page.tsx');
let content = fs.readFileSync(quotesPage, 'utf8');

if (!content.includes('DeleteRecordButton')) {
  // Add imports
  content = content.replace(
    'import { getAdminQuotes } from "@/lib/store";',
    'import { getAdminQuotes } from "@/lib/store";\nimport { DeleteRecordButton } from "@/components/admin/delete-record-button";\nimport { deleteQuoteAction } from "@/app/admin/delete-actions";\nimport { getSession } from "@/lib/auth";'
  );

  // Add session check in page component
  content = content.replace(
    'const pageEnd = Math.min(data.page * data.pageSize, data.totalResults);',
    'const pageEnd = Math.min(data.page * data.pageSize, data.totalResults);\n  const session = await getSession();'
  );

  // Add Delete button
  content = content.replace(
    '<Link className="icon-button" href={`/admin/quotes/${quote.id}`}>',
    '<DeleteRecordButton recordId={quote.id} recordType="quote" userEmail={session?.email ?? ""} onDelete={deleteQuoteAction} />\n                      <Link className="icon-button" href={`/admin/quotes/${quote.id}`}>'
  );

  fs.writeFileSync(quotesPage, content);
  console.log("Updated quotes page");
}

const ordersPage = path.join(process.cwd(), 'src/app/admin/orders/page.tsx');
let content2 = fs.readFileSync(ordersPage, 'utf8');

if (!content2.includes('DeleteRecordButton')) {
  content2 = content2.replace(
    'import { prisma } from "@/lib/prisma";',
    'import { prisma } from "@/lib/prisma";\nimport { DeleteRecordButton } from "@/components/admin/delete-record-button";\nimport { deleteOrderAction } from "@/app/admin/delete-actions";\nimport { getSession } from "@/lib/auth";'
  );

  content2 = content2.replace(
    'const skip = (page - 1) * limit;',
    'const skip = (page - 1) * limit;\n  const session = await getSession();'
  );

  content2 = content2.replace(
    '<Link className="icon-button" href={`/admin/orders/${order.id}`}>',
    '<DeleteRecordButton recordId={order.id} recordType="order" userEmail={session?.email ?? ""} onDelete={deleteOrderAction} />\n                      <Link className="icon-button" href={`/admin/orders/${order.id}`}>'
  );

  fs.writeFileSync(ordersPage, content2);
  console.log("Updated orders page");
}
