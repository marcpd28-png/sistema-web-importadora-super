import { SocialInbox } from "@/components/admin/messages/SocialInbox";

export const dynamic = "force-dynamic";

export default function AdvisorTiktokPage() {
  return (
    <SocialInbox
      apiBase="/api/asesor/mensajes/social"
      canManageBot={false}
      canManageConnection={false}
      channel="tiktok"
      configured={Boolean(process.env.SOCIAL_INBOX_API_TOKEN)}
    />
  );
}
