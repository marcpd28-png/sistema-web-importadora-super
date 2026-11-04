export const dynamic = "force-dynamic";
import { MessagesWorkspace } from "@/components/admin/messages/MessagesWorkspace";
import { requireMessagingOwner } from "@/lib/auth";
import { getAssignableAdvisors } from "@/lib/messages-service";

export default async function InboxPage() {
  const [session, advisors] = await Promise.all([requireMessagingOwner(), getAssignableAdvisors()]);
  return (
    <div className="messages-inbox-page">
      <div className="messages-inbox-workspace">
        <MessagesWorkspace
          advisorTargets={advisors}
          viewer={{ id: session.userId, name: session.name, isMessagingOwner: true }}
        />
      </div>
    </div>
  );
}
