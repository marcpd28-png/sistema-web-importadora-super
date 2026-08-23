import fs from "fs";
import path from "path";

export async function downloadAndSaveQuotePdf(externalId: string, quoteNumber: string): Promise<string | null> {
  try {
    const apiUrl = process.env.FACTURADOR_API_URL?.trim();
    if (!apiUrl) {
      console.warn("[PDF Sync] FACTURADOR_API_URL is not set.");
      return null;
    }
    
    // Derived domain: replace /api/v1 or /api or similar at the end
    let domain = apiUrl.replace(/\/api\/v1\/?$/, "").replace(/\/api\/?$/, "");
    
    // The print URL
    const pdfUrl = `${domain}/print/quotation/${externalId}/a4`;
    
    console.log(`[PDF Sync] Downloading PDF from: ${pdfUrl}`);
    
    const response = await fetch(pdfUrl, {
      headers: {
        "Authorization": `Bearer ${process.env.FACTURADOR_API_TOKEN}`
      }
    });
    
    if (!response.ok) {
      console.warn(`[PDF Sync] Failed to download PDF from ERP. Status: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Target directory inside the project uploads path
    const uploadDir = path.join(process.cwd(), "public", "uploads", "quotations");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Sanitized file name
    const fileName = `${quoteNumber.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
    const filePath = path.join(uploadDir, fileName);
    
    fs.writeFileSync(filePath, buffer);
    console.log(`[PDF Sync] Saved PDF successfully to: ${filePath}`);
    
    return `/uploads/quotations/${fileName}`;
  } catch (error) {
    console.error("[PDF Sync] Error downloading or saving quote PDF:", error);
    return null;
  }
}
