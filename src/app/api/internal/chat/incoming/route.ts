import { NextResponse } from "next/server";
import { z } from "zod";

import { incomingMessageSchema, processIncomingMessage } from "@/lib/messages-service";
import { prisma } from "@/lib/prisma";

const optionalMediaUrlSchema = z
  .string()
  .trim()
  .url()
  .max(5000)
  .optional();

export async function POST(request: Request) {
  try {
    const internalApiKey = process.env.N8N_INTERNAL_API_KEY;
    if (!internalApiKey) {
      console.error("N8N_INTERNAL_API_KEY is not configured.");
      return NextResponse.json(
        { error: "Internal server configuration error" },
        { status: 500 },
      );
    }

    const providedKey = request.headers.get("x-internal-api-key");
    if (!providedKey || providedKey !== internalApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsedData = incomingMessageSchema.parse(body);
    const mediaUrl = optionalMediaUrlSchema.parse(
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).mediaUrl
        : undefined,
    );

    const result = await processIncomingMessage(parsedData);

    if (mediaUrl && !result.duplicate) {
      await prisma.chatMessage.update({
        where: { id: result.messageId },
        data: { mediaUrl },
      });
    }

    return NextResponse.json(
      {
        ...result,
        mediaUrl: mediaUrl ?? null,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request payload",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    console.error("Error processing incoming message:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
