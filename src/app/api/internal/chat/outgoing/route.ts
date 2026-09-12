import { NextResponse } from "next/server";
import { z } from "zod";
import { outgoingBotMessageSchema, processOutgoingBotMessage } from "@/lib/messages-service";

export async function POST(request: Request) {
  try {
    // 1. Authenticate Machine-to-Machine
    const internalApiKey = process.env.N8N_INTERNAL_API_KEY;
    if (!internalApiKey) {
      console.error("N8N_INTERNAL_API_KEY is not configured.");
      return NextResponse.json({ error: "Internal server configuration error" }, { status: 503 });
    }

    const providedKey = request.headers.get("x-internal-api-key");
    if (!providedKey || providedKey !== internalApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse payload
    const body = await request.json();
    const parsedData = outgoingBotMessageSchema.parse(body);

    // 3. Process the message
    const result = await processOutgoingBotMessage(parsedData);

    // 4. Return result
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
    
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    
    if (error instanceof Error && error.message === "Conversation not found") {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    console.error("Error processing outgoing internal message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
