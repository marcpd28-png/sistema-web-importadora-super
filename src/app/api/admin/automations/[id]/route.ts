import { NextResponse } from "next/server";
import { authorizeAutomation, automationErrorResponse } from "@/lib/automations/http";
import { getAutomation, saveAutomation } from "@/lib/automations/service";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const denied = await authorizeAutomation(); if (denied) return denied;
    return NextResponse.json(await getAutomation((await params).id));
  } catch (error) { return automationErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const denied = await authorizeAutomation(); if (denied) return denied;
    return NextResponse.json(await saveAutomation((await params).id, await request.json()));
  } catch (error) { return automationErrorResponse(error); }
}
