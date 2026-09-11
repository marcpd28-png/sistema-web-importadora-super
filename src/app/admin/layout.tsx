import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AdminNav } from "@/components/admin/admin-nav";
import { getAdminNavBadges } from "@/lib/admin";
import { ForcePasswordChange } from "@/components/admin/force-password-change";
import { SidebarToggle } from "@/components/admin/sidebar-toggle";
import { DarkModeToggle } from "@/components/admin/dark-mode-toggle";
import { LogoutButton } from "@/components/admin/logout-button";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireAdmin();

  if (session.requirePasswordChange) {
    return (
      <main className="admin-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f8fafc" }}>
        <ForcePasswordChange />
      </main>
    );
  }

  const badges = await getAdminNavBadges();

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-main" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="admin-sidebar-brand" style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1rem" }}>
            <div className="brand-logo-container" style={{ display: "flex", justifyContent: "center", width: "100%" }}>
              <BrandLogo href="/admin" priority size="sm" />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.03)", padding: "4px", borderRadius: "8px" }}>
              <SidebarToggle />
              <div style={{ display: "flex", gap: "4px" }}>
                <DarkModeToggle />
                <LogoutButton />
              </div>
            </div>
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
