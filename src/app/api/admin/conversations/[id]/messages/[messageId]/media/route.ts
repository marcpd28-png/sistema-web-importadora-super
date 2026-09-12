import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string, messageId: string }> }
) {
  try {
    const auth = await requireAdminApi();
    if (auth.error) {
      return new NextResponse("No autorizado", { status: auth.status });
    }

    const { id, messageId } = await params;

    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId, conversationId: id }
    });

    if (!message) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const metadata: any = message.metadata;
    let mediaId = "";
    
    // Attempt to extract mediaId from inbound payload
    if (metadata && metadata.message) {
      const type = metadata.message.type;
      if (type && metadata.message[type] && metadata.message[type].id) {
        mediaId = metadata.message[type].id;
      }
    }

    // If mediaUrl was explicitly saved (e.g. outbound from bot), we can proxy it or redirect
    if (!mediaId && message.mediaUrl) {
       return NextResponse.redirect(message.mediaUrl);
    }

    if (!mediaId) {
      return new NextResponse("Media not found in metadata", { status: 404 });
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      return new NextResponse("WhatsApp API not configured", { status: 503 });
    }

    // 1. Fetch Media URL from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!metaRes.ok) {
       return new NextResponse("Meta Graph Error", { status: metaRes.status });
    }

    const metaData = await metaRes.json();
    const url = metaData.url;
    const mimeType = metaData.mime_type;

    if (!url) {
      return new NextResponse("Media URL not found in Graph response", { status: 404 });
    }

    // 2. Fetch actual media content securely server-side
    const mediaRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!mediaRes.ok) {
       return new NextResponse("Failed to download media", { status: mediaRes.status });
    }

    const arrayBuffer = await mediaRes.arrayBuffer();

    // 3. Serve it to frontend
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=86400"
      }
    });
  } catch (error) {
    console.error("Error serving media:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
