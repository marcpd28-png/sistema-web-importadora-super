import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyExecution } from "@/lib/automations/execution-auth";
import { executeAutomation } from "@/lib/automations/execution-service";
import { automationErrorResponse } from "@/lib/automations/http";

export const maxDuration = 120;
const inputSchema = z.object({
  executionId: z.string().min(1).max(80), versionId: z.string().min(1).max(80),
  expiresAt: z.number().int(), signature: z.string().length(64), providerExecutionId: z.string().max(120).optional(),
});
export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    if (!verifyExecution(input)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await executeAutomation(input));
  } catch (error) { return automationErrorResponse(error); }
}
