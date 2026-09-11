import { Settings, LayoutGrid, Eye, LayoutList, Check } from "lucide-react";
import Link from "next/link";

export default function DashboardSettingsPage() {
  return (
    <div className="stack-lg">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Settings size={24} />
            Configuración del Dashboard
          </h1>
          <p className="muted">Personaliza la vista principal, el orden de los gráficos y la disposición del menú.</p>
        </div>
        <Link href="/admin" className="button button-secondary">
          Volver al Dashboard
        </Link>
      </header>

      <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <section className="panel stack-md">
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><LayoutGrid size={20} /> Métricas Visibles</h3>
          <p className="muted" style={{ fontSize: "0.9rem" }}>Próximamente: Podrás encender o apagar métricas específicas del resumen de ventas y cotizaciones.</p>
          
          <div style={{ padding: "16px", background: "var(--bg-muted)", borderRadius: "8px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <strong>Ventas Mensuales</strong>
              <span className="pill pill-success"><Check size={12} /> Activo</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Top Productos</strong>
              <span className="pill pill-success"><Check size={12} /> Activo</span>
            </div>
          </div>
        </section>

        <section className="panel stack-md">
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><LayoutList size={20} /> Personalización del Menú</h3>
          <p className="muted" style={{ fontSize: "0.9rem" }}>Próximamente: Podrás reordenar las opciones del menú lateral o crear accesos rápidos.</p>
          <div style={{ padding: "16px", border: "1px dashed var(--border)", borderRadius: "8px", textAlign: "center", color: "var(--muted)" }}>
            Funcionalidad en desarrollo
          </div>
        </section>

        <section className="panel stack-md" style={{ gridColumn: "1 / -1" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><Eye size={20} /> Apariencia</h3>
          <p className="muted" style={{ fontSize: "0.9rem" }}>Próximamente: Modo oscuro o contrastes personalizados para tu cuenta.</p>
          <div style={{ padding: "16px", border: "1px dashed var(--border)", borderRadius: "8px", textAlign: "center", color: "var(--muted)" }}>
            Funcionalidad en desarrollo
          </div>
        </section>
      </div>
    </div>
  );
}
