import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AdminNav } from "@/components/admin/admin-nav";
import { getAdminNavBadges } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireAdmin();
  const badges = await getAdminNavBadges();

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-main">
          <div className="admin-sidebar-brand">
            <BrandLogo href="/admin" priority size="sm" />
          </div>
          <div className="admin-profile-card">
            <span className="admin-profile-badge">
              <ShieldCheck size={18} />
            </span>
            <div className="admin-profile-body">
              <div className="stack-xs">
                <p className="eyebrow">Control center</p>
                <h2>{session.name}</h2>
              </div>
            </div>
          </div>

          <AdminNav badges={badges} />
        </div>
      </aside>

      <section className="admin-content">{children}</section>
    </main>
  );
}
