import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { getConversations } from "@/lib/messages-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (auth.error) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

    const searchParams = request.nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "30", 10);

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
      unreadOnly: searchParams.get("unreadOnly") === "true",
      botEnabled: searchParams.has("botEnabled")
        ? searchParams.get("botEnabled") === "true"
        : undefined,
      page: isNaN(page) || page < 1 ? 1 : page,
      limit: isNaN(limit) || limit < 1 ? 30 : limit,
    };

    const conversations = await getConversations(query as Parameters<typeof getConversations>[0]);

    return NextResponse.json(conversations);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    console.error("Error fetching conversations:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
