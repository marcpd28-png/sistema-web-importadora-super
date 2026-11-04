import Link from "next/link";
import { ArrowLeft, Headset, KeyRound, ShieldCheck, ShoppingBag, Sparkles, UserPlus } from "lucide-react";
import { createAdminUserAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/submit-button";

type NewAdminUserPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewAdminUserPage({ searchParams }: NewAdminUserPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const error = typeof params?.error === "string" ? params.error : "";

  return (
    <section className="panel admin-user-form-page">
      <header className="admin-user-page-header">
        <div>
          <Link className="admin-user-back-link" href="/admin/users">
            <ArrowLeft size={15} /> Volver a usuarios
          </Link>
          <p className="eyebrow">Usuarios</p>
          <h1>Nueva cuenta</h1>
          <p className="panel-copy">Crea el acceso y asigna únicamente el nivel de permisos necesario.</p>
        </div>
      </header>

      {error ? <div className="admin-toast admin-toast-error" role="alert"><strong>Error</strong><span>{error}</span></div> : null}

      <div className="admin-user-form-layout">
        <form action={createAdminUserAction} className="admin-user-form-card">
          <section className="admin-user-form-section">
            <div className="admin-user-form-section-heading">
              <span>01</span>
              <div><h2>Información personal</h2><p>Datos para identificar y contactar al usuario.</p></div>
            </div>
            <div className="form-grid">
              <label className="field"><span>Nombre completo</span><input autoComplete="name" name="name" placeholder="Ej. Andrea Ramírez" required /></label>
              <label className="field"><span>Correo de acceso</span><input autoComplete="email" name="email" placeholder="usuario@correo.com" required type="email" /></label>
              <label className="field field-wide"><span>Teléfono</span><input autoComplete="tel" name="phone" placeholder="Opcional" type="tel" /></label>
            </div>
          </section>

          <section className="admin-user-form-section">
            <div className="admin-user-form-section-heading">
              <span>02</span>
              <div><h2>Rol y permisos</h2><p>Define qué experiencia tendrá al iniciar sesión.</p></div>
            </div>
            <div className="admin-user-role-options">
              <label><input name="role" type="radio" value="ASESOR" /><span><Headset size={18} /><strong>Asesor</strong><small>Consulta catálogo, atiende cotizaciones y responde mensajes.</small></span></label>
              <label><input defaultChecked name="role" type="radio" value="USERSHOP" /><span><ShoppingBag size={18} /><strong>Comprador</strong><small>Consulta su cuenta, pedidos y cotizaciones.</small></span></label>
              <label><input name="role" type="radio" value="PROMOTOR" /><span><Sparkles size={18} /><strong>Promotor</strong><small>Acceso comercial como promotor o influencer.</small></span></label>
              <label><input name="role" type="radio" value="ADMIN" /><span><ShieldCheck size={18} /><strong>Administrador</strong><small>Acceso completo al panel administrativo.</small></span></label>
            </div>
          </section>

          <section className="admin-user-form-section">
            <div className="admin-user-form-section-heading">
              <span>03</span>
              <div><h2>Contraseña inicial</h2><p>Debe contener al menos seis caracteres.</p></div>
            </div>
            <div className="form-grid">
              <label className="field"><span>Contraseña</span><input autoComplete="new-password" minLength={6} name="password" required type="password" /></label>
              <label className="field"><span>Confirmar contraseña</span><input autoComplete="new-password" minLength={6} name="confirmPassword" required type="password" /></label>
            </div>
          </section>

          <div className="admin-user-form-actions">
            <Link className="button button-secondary" href="/admin/users">Cancelar</Link>
            <SubmitButton pendingLabel="Creando cuenta..."><UserPlus size={16} /> Crear cuenta</SubmitButton>
          </div>
        </form>

        <aside className="admin-user-form-aside">
          <span className="admin-user-aside-icon"><KeyRound size={20} /></span>
          <p className="eyebrow">Antes de crear</p>
          <h2>Acceso claro y seguro</h2>
          <ul>
            <li>El correo será el identificador de acceso.</li>
            <li>Compradores y promotores ingresan desde la tienda.</li>
            <li>Asesores y administradores ingresan al panel interno.</li>
            <li>El rol puede modificarse posteriormente.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
