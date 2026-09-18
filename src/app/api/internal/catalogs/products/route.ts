import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRequestedCatalogPdf, generateRequestedProductImages } from "@/lib/catalog-pdf";
import { isCatalogRequest, isScreenExtenderQuery, normalizeCatalogText } from "@/lib/catalog-selection";
import { prisma } from "@/lib/prisma";
import { buildPublicUrl } from "@/lib/site-url";
import { answerCatalogSelection, describeUnavailableScope } from "@/lib/bc-request-answers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ content: z.string().trim().min(1).max(10000), conversationId: z.string().min(1).max(191), requestId: z.string().max(191).optional(), triggerMessageId: z.string().max(191).optional() });
export async function POST(request: Request) {
  if (!process.env.N8N_INTERNAL_API_KEY || request.headers.get("x-internal-api-key") !== process.env.N8N_INTERNAL_API_KEY) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const input = schema.parse(await request.json());
    const extenders = isScreenExtenderQuery(input.content);
    if (!isCatalogRequest(input.content) && !extenders) return NextResponse.json({ ok: true, matched: false });
    const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId }, select: {
      id: true, status: true, botEnabled: true, assignedUserId: true, contact: { select: { externalId: true } }, salesState: { select: { customerData: true } },
    } });
    if (!conversation) return NextResponse.json({ ok: false, error: "Conversation not found" }, { status: 404 });
    // This endpoint is initially exclusive to the simulator, as requested for BC.
    if (!conversation.contact.externalId?.startsWith("SIMULATOR:")) return NextResponse.json({ ok: false, error: "Simulator conversation required" }, { status: 403 });
    if (!conversation.botEnabled || conversation.assignedUserId || conversation.status !== "AUTOMATICO") return NextResponse.json({ ok: true, matched: true, skipped: "HUMAN_OWNS_CONVERSATION" });
    const requestId = input.requestId || `catalog:${input.triggerMessageId || crypto.randomUUID()}`;
    const customerData = conversation.salesState?.customerData;
    if (customerData && typeof customerData === "object" && !Array.isArray(customerData) && customerData.catalogPending === true) {
      await prisma.conversationSalesState.updateMany({ where: { conversationId: conversation.id }, data: { customerData: { ...customerData, catalogPending: false } } });
    }
    if (extenders && !isCatalogRequest(input.content) && !/\bpdf\b/.test(normalizeCatalogText(input.content))) {
      const result = await generateRequestedProductImages(input.content);
      return NextResponse.json({
        ok: true, matched: true, simulation: true, conversationId: conversation.id, requestId,
        outboundMessages: result.outboundMessages.length ? result.outboundMessages : [{ type: "TEXT", content: result.scopes.map(describeUnavailableScope).join("\n\n"), mediaUrl: null }],
        filters: { brands: result.brands, categories: result.categories, types: result.types, terms: result.terms },
      });
    }
    const result = await generateRequestedCatalogPdf(input.content, extenders);
    const answer = answerCatalogSelection(result, result.products);
    return NextResponse.json({
      ok: true, matched: true, simulation: true, conversationId: conversation.id,
      requestId,
      content: result.scoped ? answer.content
        : `📚 Te comparto nuestro catálogo completo: ${buildPublicUrl("/")}\nTambién puedes pedirme un catálogo por marca, categoría o tipo de producto, por ejemplo: JBL, audífonos o cables.`,
      type: result.catalog ? "document" : "text", mediaUrl: result.catalog?.absoluteUrl ?? null,
      catalog: result.catalog ? { filename: result.catalog.filename, productCount: result.catalog.productCount, url: result.catalog.absoluteUrl } : null,
      filters: { brands: result.brands, categories: result.categories, types: result.types, terms: result.terms },
      unmatchedScopes: result.unmatchedScopes,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Invalid request payload" }, { status: 400 });
    console.error("[catalog-products] generation failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ ok: false, error: "CATALOG_GENERATION_FAILED" }, { status: 500 });
  }
}
