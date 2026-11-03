import { parseSocialChannel, SocialInboxError, type SocialChannel } from "./social-inbox";

export type AdvisorSocialChannel = Extract<SocialChannel, "messenger" | "tiktok">;

/**
 * The advisor workspace intentionally exposes only the social channels shown
 * in its navigation. Keep this boundary server-side so a crafted URL cannot
 * reveal another provider inbox.
 */
export function parseAdvisorSocialChannel(value: string): AdvisorSocialChannel {
  const channel = parseSocialChannel(value);
  if (channel === "messenger" || channel === "tiktok") return channel;
  throw new SocialInboxError("Canal no disponible para asesores.", 404);
}
