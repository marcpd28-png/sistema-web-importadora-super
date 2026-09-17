import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAutomation, automationErrorResponse } from "@/lib/automations/http";
import { changeAutomationStatus } from "@/lib/automations/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await authorizeAutomation(); if (denied) return denied;
    const { status } = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) }).strict().parse(await request.json());
    return NextResponse.json(await changeAutomationStatus((await params).id, status));
  } catch (error) { return automationErrorResponse(error); }
}
