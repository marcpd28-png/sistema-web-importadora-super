import type { Metadata } from "next";
import { BadgeCheck, BookOpenText, FileText, MessagesSquare } from "lucide-react";
import { requireAdvisor } from "@/lib/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ForcePasswordChange } from "@/components/admin/force-password-change";
import { AdminSidebar, type AdminSidebarDestination } from "@/components/admin/admin-sidebar";
import { SidebarToggle } from "@/components/admin/sidebar-toggle";
import { DarkModeToggle } from "@/components/admin/dark-mode-toggle";
import { LogoutButton } from "@/components/admin/logout-button";
import { AdvisorNav } from "@/components/advisor/advisor-nav";

export const metadata: Metadata = {
  title: "Panel asesor",
  robots: { index: false, follow: false },
};

const destinations: AdminSidebarDestination[] = [
  { href: "/asesor/catalogo", label: "Catálogo", icon: BookOpenText },
  { href: "/asesor/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/asesor/mensajes", label: "Mensajes", icon: MessagesSquare },
];

export default async function AdvisorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdvisor();

  if (session.requirePasswordChange) {
    return (
      <main className="admin-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "20px", background: "#f8fafc" }}>
        <ForcePasswordChange returnTo="/asesor" />
      </main>
    );
  }

  return (
    <main className="admin-shell advisor-shell">
      <a className="admin-skip-link" href="#advisor-main-content">Ir al contenido principal</a>
      <AdminSidebar destinations={destinations} mobileLabel="Asesor">
        <div className="admin-sidebar-brand">
          <div className="brand-logo-container"><BrandLogo href="/asesor" priority size="sm" /></div>
          <div className="admin-sidebar-controls">
            <SidebarToggle />
            <div className="admin-sidebar-utilities"><DarkModeToggle /><LogoutButton /></div>
          </div>
        </div>
        <div className="admin-profile-card">
          <span className="admin-profile-badge"><BadgeCheck size={18} /></span>
          <div className="admin-profile-body"><div className="stack-xs"><p className="eyebrow">Atención comercial</p><h2>{session.name}</h2></div></div>
        </div>
        <AdvisorNav />
      </AdminSidebar>
      <section className="admin-content" id="advisor-main-content" tabIndex={-1}>{children}</section>
    </main>
  );
}
