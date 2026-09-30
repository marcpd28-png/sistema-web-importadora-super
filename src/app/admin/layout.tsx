import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AdminNav } from "@/components/admin/admin-nav";
import { getAdminNavBadges } from "@/lib/admin";
import { ForcePasswordChange } from "@/components/admin/force-password-change";
import { SidebarToggle } from "@/components/admin/sidebar-toggle";
import { DarkModeToggle } from "@/components/admin/dark-mode-toggle";
import { LogoutButton } from "@/components/admin/logout-button";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

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
      <a className="admin-skip-link" href="#admin-main-content">
        Ir al contenido principal
      </a>
      <AdminSidebar>
          <div className="admin-sidebar-brand">
            <div className="brand-logo-container">
              <BrandLogo href="/admin" priority size="sm" />
            </div>
            <div className="admin-sidebar-controls">
              <SidebarToggle />
              <div className="admin-sidebar-utilities">
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
      </AdminSidebar>

      <section className="admin-content" id="admin-main-content" tabIndex={-1}>{children}</section>
    </main>
  );
}
