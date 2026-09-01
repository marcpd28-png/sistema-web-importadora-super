const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function run() {
  const quotes = await prisma.quote.findMany({
    where: {
      erpExternalId: { not: null },
      quoteNumber: { not: null },
      pdfUrl: null
    }
  });

  console.log(`Found ${quotes.length} quotes to update.`);

  const apiUrl = process.env.FACTURADOR_API_URL?.trim() || "https://original.negocioserp.com/api";
  const domain = apiUrl.replace(/\/api\/v1\/?$/, "").replace(/\/api\/?$/, "");
  const token = process.env.FACTURADOR_API_TOKEN || "test";

  for (const quote of quotes) {
    const pdfUrl = `${domain}/print/quotation/${quote.erpExternalId}/a4`;
    console.log(`Fetching ${pdfUrl}...`);
    try {
      const response = await fetch(pdfUrl, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const uploadDir = path.join(process.cwd(), "public", "uploads", "quotations");
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        
        const fileName = `${quote.quoteNumber.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, buffer);
        console.log(`Saved ${fileName}`);
        
        await prisma.quote.update({
          where: { id: quote.id },
          data: { pdfUrl: `/uploads/quotations/${fileName}` }
        });
      } else {
        console.log(`Failed HTTP ${response.status}`);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

run().then(() => process.exit(0)).catch(console.error);
