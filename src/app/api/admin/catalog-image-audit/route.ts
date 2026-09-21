import { getSession } from "@/lib/auth";
import { auditCsv } from "@/lib/catalog-image-audit";
import { readCatalogImageAudit } from "@/lib/catalog-image-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN" || user.requirePasswordChange) return Response.json({ error: "ADMIN_REQUIRED" }, { status: 401 });
  const report = await readCatalogImageAudit();
  if (!report) return Response.json({ error: "AUDIT_NOT_AVAILABLE" }, { status: 404 });
  const csv = new URL(request.url).searchParams.get("format") === "csv";
  return new Response(csv ? auditCsv(report) : JSON.stringify(report), { headers: {
    "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="auditoria-fotos-${report.generatedAt.slice(0, 10)}.${csv ? "csv" : "json"}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
