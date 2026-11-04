import { createSuperBotReplyHandler } from "@/lib/super-bot-internal-reply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Channel adapters call this endpoint to obtain a verified reply only. The
 * adapter remains responsible for its own Messenger/TikTok transport rules.
 */
export const POST = createSuperBotReplyHandler();
