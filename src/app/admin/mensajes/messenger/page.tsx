import { SocialInbox } from "@/components/admin/messages/SocialInbox";
export const dynamic = "force-dynamic";
export default function MessengerPage() {
  return <SocialInbox channel="messenger" configured={Boolean(process.env.SOCIAL_INBOX_API_TOKEN)} authorizationUrl={`https://chatbot.tiendavirtualsuper.com/space/${process.env.SOCIAL_INBOX_WORKSPACE_ID || "11727941065966601"}/settings/channels/messenger`} />;
}
