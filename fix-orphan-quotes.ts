import { PrismaClient } from "@prisma/client";
import { FacturadorClient } from "./src/lib/facturador/client.js";
import { buildAdvisorWhatsappHref } from "./src/lib/whatsapp.js";
import { downloadAndSaveQuotePdf } from "./src/lib/pdf-sync.js";

const prisma = new PrismaClient();

function getQuoteNumber(response: any): string | null {
  const record = response as Record<string, unknown>;
  for (const candidate of [record.number_full, record.number, record.identifier]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (record.data && typeof record.data === "object") {
    return getQuoteNumber(record.data);
  }
  return null;
}

function getQuoteExternalId(response: any): string | null {
  const record = response as Record<string, unknown>;
  for (const candidate of [record.external_id, record.id]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  if (record.data && typeof record.data === "object") {
    return getQuoteExternalId(record.data);
  }
  return null;
}

async function run() {
  console.log("Buscando cotizaciones huerfanas...");
  
  const quotes = await prisma.quote.findMany({
    where: {
      quoteNumber: null,
    },
    include: {
      items: {
        include: {
          product: true,
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  console.log(`Encontradas ${quotes.length} cotizaciones huérfanas.`);
  
  const client = new FacturadorClient();

  for (const quote of quotes) {
    try {
      console.log(`\nProcesando cotización ID: ${quote.id}`);
      
      const items = quote.items.map(item => ({
        code: item.code,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total
      }));

      const result = await client.createQuotation({
        customer: {
          address: quote.customerAddress || null,
          documentNumber: quote.customerDocumentNumber || null,
          documentType: quote.customerDocumentType || null,
          email: quote.customerEmail || null,
          name: quote.customerName || "Cliente tienda virtual",
          phone: quote.customerPhone || "",
        },
        items: items,
        note: quote.note || "",
      });

      const quoteNumber = getQuoteNumber(result.response);
      const quoteExternalId = getQuoteExternalId(result.response);
      
      if (!quoteNumber || !quoteExternalId) {
        console.error(`  [ERROR] El ERP no devolvió número para la cotización ${quote.id}. Response:`, JSON.stringify(result.response));
        continue;
      }
      
      console.log(`  [ÉXITO] Creada en ERP con número: ${quoteNumber} y external ID: ${quoteExternalId}`);
      
      let pdfUrl: string | null = null;
      try {
        pdfUrl = await downloadAndSaveQuotePdf(quoteExternalId, quoteNumber);
        console.log(`  [PDF] Descargado exitosamente.`);
      } catch (e: any) {
        console.error(`  [ERROR PDF] No se pudo descargar el PDF: ${e.message}`);
      }

      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          erpCustomerId: result.customerId,
          erpCustomerMode: result.customerMode,
          erpExternalId: quoteExternalId,
          quoteNumber: quoteNumber,
          status: "ERP_REGISTERED",
          pdfUrl: pdfUrl,
        },
      });
      
      console.log(`  [DB] Base de datos actualizada para ${quote.id}.`);
    } catch (error: any) {
      console.error(`  [ERROR] Falló el procesamiento de ${quote.id}: ${error.message}`);
    }
  }
  
  console.log("\nProceso terminado.");
}

run()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
