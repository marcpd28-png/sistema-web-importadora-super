import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRequestedCatalogPdf } from "@/lib/catalog-pdf";
import { isCatalogRequest } from "@/lib/catalog-selection";
import { prisma } from "@/lib/prisma";
import { buildPublicUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ content: z.string().trim().min(1).max(10000), conversationId: z.string().min(1).max(191), requestId: z.string().max(191).optional(), triggerMessageId: z.string().max(191).optional() });
export async function POST(request: Request) {
  if (!process.env.N8N_INTERNAL_API_KEY || request.headers.get("x-internal-api-key") !== process.env.N8N_INTERNAL_API_KEY) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const input = schema.parse(await request.json());
    if (!isCatalogRequest(input.content)) return NextResponse.json({ ok: true, matched: false });
    const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, select: {
      id: true, status: true, botEnabled: true, assignedUserId: true, contact: { select: { externalId: true } }, salesState: { select: { customerData: true } },
    } });
    if (!conversation) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    // This endpoint is initially exclusive to the simulator, as requested for BC.
    if (!conversation.contact.externalId?.startsWith("SIMULATOR:")) return NextResponse.json({ ok: false, error: "Simulator conversation required" }, { status: 403 });
    if (!conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") return NextResponse.json({ ok: true, matched: true, skipped: "HUMAN_OWNS_CONVERSATION" });
    const result = await generateRequestedCatalogPdf(input.content);
    const customerData = conversation.salesState?.customerData;
    if (customerData && typeof customerData === "object" && !Array.isArray(customerData) && customerData.catalogPending === true) {
      await prisma.conversationSalesState.updateMany({ where: { conversationId: conversation.id }, data: { customerData: { ...customerData, catalogPending: false } } });
    }
    return NextResponse.json({
      ok: true, matched: true, simulation: true, conversationId: conversation.id,
      requestId: input.requestId || `catalog:${input.triggerMessageId || crypto.randomUUID()}`,
      content: result.catalog ? `Aquí tienes el catálogo de ${result.label}: ${result.catalog.productCount} productos.`
        : !result.scoped ? `Aquí puedes ver nuestro catálogo completo: ${buildPublicUrl("/")}\nTambién puedes pedirme un catálogo por marca o categoría, por ejemplo: JBL o audífonos.`
        : `No encontré productos publicados para el catálogo de ${result.label}. Puedes indicarme otra marca o categoría.`,
      type: result.catalog ? "document" : "text", mediaUrl: result.catalog?.absoluteUrl ?? null,
      catalog: result.catalog ? { filename: result.catalog.filename, productCount: result.catalog.productCount, url: result.catalog.absoluteUrl } : null,
      filters: { brands: result.brands, categories: result.categories, types: result.types, terms: result.terms },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Invalid request payload" }, { status: 400 });
    console.error("[catalog-products] generation failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: "CATALOG_GENERATION_FAILED" }, { status: 500 });
  }
}
