import { NextResponse } from "next/server";
import { z } from "zod";
import { incomingMessageSchema, processIncomingMessage } from "@/lib/messages-service";

export async function POST(request: Request) {
  try {
    // 1. Authenticate Machine-to-Machine
    const internalApiKey = process.env.N8N_INTERNAL_API_KEY;
    if (!internalApiKey) {
      console.error("N8N_INTERNAL_API_KEY is not configured.");
      return NextResponse.json({ error: "Internal server configuration error" }, { status: 500 });
    }

    const providedKey = request.headers.get("x-internal-api-key");
    if (!providedKey || providedKey !== internalApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse payload
    const body = await request.json();
    const parsedData = incomingMessageSchema.parse(body);

    // 3. Process the message
    const result = await processIncomingMessage(parsedData);

    // 4. Return result for n8n to make automated decisions
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
    
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload", details: error.issues }, { status: 400 });
    }
    
    console.error("Error processing incoming message:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
