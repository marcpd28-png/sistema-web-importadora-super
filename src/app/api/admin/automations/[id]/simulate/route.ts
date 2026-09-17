import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeAutomation, automationErrorResponse, AutomationError } from "@/lib/automations/http";
import { flowSchema, validateFlow } from "@/lib/automations/flow-definition";
import { runFlow } from "@/lib/automations/flow-runtime";
import { searchFlowCatalog } from "@/lib/automations/catalog";

const inputSchema = z.object({ flowDefinition: flowSchema, name: z.string().trim().min(1).max(120), message: z.string().trim().min(1).max(1200) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeAutomation(); if (denied) return denied;
    const input = inputSchema.parse(await request.json());
    const automation = await prisma.automation.findUnique({ where: { id: (await params).id }, select: { id: true } });
    if (!automation) throw new AutomationError("Automatización no encontrada.", 404);
    const errors = validateFlow(input.flowDefinition);
    if (errors.length) throw new AutomationError(errors.join(" "));
    // No contact, order, execution or outbound message is created in preview.
    return NextResponse.json(await runFlow(input.flowDefinition, input, { searchCatalog: searchFlowCatalog }));
  } catch (error) { return automationErrorResponse(error); }
}
