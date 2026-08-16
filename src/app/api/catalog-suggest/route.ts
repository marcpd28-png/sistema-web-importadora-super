import type { NextRequest } from "next/server";
import { getCatalogSuggestions } from "@/lib/store";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const suggestions = await getCatalogSuggestions(query);
  return Response.json({ suggestions }, { headers: NO_STORE_HEADERS });
}
