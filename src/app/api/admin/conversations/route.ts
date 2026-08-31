import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getConversations, getConversationsSchema } from "@/lib/messages-service";
import { z } from "zod";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;

    const query = {
      search: searchParams.get("search") || undefined,
      q: searchParams.get("q") || undefined,
      phone: searchParams.get("phone") || undefined,
      date: searchParams.get("date") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      status: searchParams.get("status") || undefined,
      channel: searchParams.get("channel") || undefined,
      unreadOnly: searchParams.get("unreadOnly") || undefined,
      botEnabled: searchParams.get("botEnabled") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    };

    const validatedQuery = getConversationsSchema.parse(query);
    const result = await getConversations(validatedQuery);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request parameters", details: error.issues }, { status: 400 });
    }
    console.error("Error fetching conversations:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
