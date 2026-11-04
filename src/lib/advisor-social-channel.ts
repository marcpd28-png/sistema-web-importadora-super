import { parseSocialChannel, SocialInboxError, type SocialChannel } from "./social-inbox";

export type AdvisorSocialChannel = Extract<SocialChannel, "messenger" | "tiktok">;

/**
 * Keep the advisor queue limited to the social channels rendered in its
 * navigation. This guard is server-side so a crafted URL cannot expose an
 * unrelated provider inbox.
 */
export function parseAdvisorSocialChannel(value: string): AdvisorSocialChannel {
  const channel = parseSocialChannel(value);
  if (channel === "messenger" || channel === "tiktok") return channel;
  throw new SocialInboxError("Canal no disponible para asesores.", 404);
}
