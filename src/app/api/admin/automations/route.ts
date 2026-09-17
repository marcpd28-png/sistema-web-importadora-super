import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeAutomation, automationErrorResponse } from "@/lib/automations/http";
import { createAutomation } from "@/lib/automations/service";

export async function GET() {
  try {
    const denied = await authorizeAutomation(); if (denied) return denied;
    return NextResponse.json(await prisma.automation.findMany({
      orderBy: { updatedAt: "desc" }, include: { _count: { select: { executions: true } } },
    }));
  } catch (error) { return automationErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const denied = await authorizeAutomation(); if (denied) return denied;
    return NextResponse.json(await createAutomation(await request.json()), { status: 201 });
  } catch (error) { return automationErrorResponse(error); }
}
