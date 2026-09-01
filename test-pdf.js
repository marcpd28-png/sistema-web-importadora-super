const apiUrl = process.env.FACTURADOR_API_URL?.trim() || "https://demo.facturador.pro/api/v1";
const token = process.env.FACTURADOR_API_TOKEN || "test";
let domain = apiUrl.replace(/\/api\/v1\/?$/, "").replace(/\/api\/?$/, "");
const externalId = "c4171b6b-d884-4432-b01c-6bcbeb6c3746";
const pdfUrl = `${domain}/print/quotation/${externalId}/a4`;
console.log(`URL: ${pdfUrl}`);
