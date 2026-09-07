import { notFound } from "next/navigation";
import { BadgeCheck, Mail, Phone, ShieldCheck, UserMinus, UserPen } from "lucide-react";
import { deleteAdminUserAction, updateAdminUserAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { prisma } from "@/lib/prisma";

type AdminUserEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const roleLabels = {
  ADMIN: "Administrador",
  USERSHOP: "Comprador",
  PROMOTOR: "Promotor",
} as const;

export default async function AdminUserEditPage({ params, searchParams }: AdminUserEditPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const status = typeof query?.status === "string" ? query.status : "";
  const error = typeof query?.error === "string" ? query.error : "";

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    notFound();
  }

  return (
    <section className="panel admin-users-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Usuarios</p>
          <h1>Editar cuenta</h1>
        </div>
      </div>

      {status === "updated" ? <p className="success-text">Usuario actualizado correctamente.</p> : null}
      {error ? <p className="error-text auth-error">{error}</p> : null}

      <div className="admin-users-layout">
        <article className="admin-users-create-card">
          <div className="product-section-head">
            <div>
              <p className="eyebrow">Datos</p>
              <h2>Perfil de acceso</h2>
            </div>
            <span className="admin-users-create-chip">
              <UserPen size={16} />
              Edición
            </span>
          </div>

          <form action={updateAdminUserAction} className="stack-lg">
            <input name="userId" type="hidden" value={user.id} />

            <div className="form-grid">
              <label className="field">
                <span>Nombre</span>
                <input defaultValue={user.name} name="name" required />
              </label>

              <label className="field">
                <span>Correo</span>
                <div className="auth-password-wrap">
                  <Mail size={18} />
                  <input defaultValue={user.email} name="email" required type="email" />
                </div>
              </label>

              <label className="field">
                <span>Teléfono</span>
                <div className="auth-password-wrap">
                  <Phone size={18} />
                  <input defaultValue={user.phone ?? ""} name="phone" placeholder="Opcional" type="tel" />
                </div>
              </label>

              <label className="field">
                <span>Tipo de usuario</span>
                <select defaultValue={user.role} name="role">
                  <option value="USERSHOP">Comprador</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>

              <label className="field">
                <span>Nueva contraseña</span>
                <input name="password" placeholder="Deja en blanco para no cambiar" type="password" />
              </label>

              <label className="field">
                <span>Confirmar contraseña</span>
                <input name="confirmPassword" placeholder="Repite la nueva contraseña" type="password" />
              </label>
            </div>

            <div className="actions-row">
              <SubmitButton pendingLabel="Guardando cambios...">
                Guardar cambios
              </SubmitButton>
            </div>
          </form>
        </article>

        <article className="admin-users-list-card">
          <div className="product-section-head">
            <div>
              <p className="eyebrow">Resumen</p>
              <h2>Estado de la cuenta</h2>
            </div>
          </div>

          <div className="admin-users-summary-grid admin-users-summary-grid--edit">
            <article className="admin-users-summary-card">
              <span className="admin-users-summary-icon">
                <ShieldCheck size={18} />
              </span>
              <strong>{roleLabels[user.role]}</strong>
              <span>Rol actual</span>
            </article>
            <article className="admin-users-summary-card">
              <span className="admin-users-summary-icon">
                <BadgeCheck size={18} />
              </span>
              <strong>{user.phone ? "Sí" : "No"}</strong>
              <span>Teléfono registrado</span>
            </article>
            <article className="admin-users-summary-card admin-users-summary-card--email">
              <span className="admin-users-summary-icon">
                <Mail size={18} />
              </span>
              <strong className="admin-user-email-value">{user.email}</strong>
              <span>Correo de acceso</span>
            </article>
          </div>

          <article className="panel panel-slim">
            <p className="eyebrow">Fechas</p>
            <p className="muted">Creado: {new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" }).format(user.createdAt)}</p>
            <p className="muted">Actualizado: {new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" }).format(user.updatedAt)}</p>
          </article>

          <form action={deleteAdminUserAction}>
            <input name="userId" type="hidden" value={user.id} />
            <button className="button button-ghost cart-clear-button" type="submit">
              <UserMinus size={16} />
              Eliminar cuenta
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}
