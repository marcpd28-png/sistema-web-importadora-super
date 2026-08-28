import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getConversations, getConversationsSchema } from "@/lib/messages-service";
import { z } from "zod";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    
    // Parse query params safely
    const query = {
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      channel: searchParams.get("channel") || undefined,
      unreadOnly: searchParams.get("unreadOnly") === "true" ? true : undefined,
      botEnabled: searchParams.has("botEnabled") ? searchParams.get("botEnabled") === "true" : undefined,
      page: searchParams.has("page") ? parseInt(searchParams.get("page")!) : undefined,
      limit: searchParams.has("limit") ? parseInt(searchParams.get("limit")!) : undefined,
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
