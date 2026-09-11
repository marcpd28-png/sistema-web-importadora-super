import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  Edit3,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type { UserRole } from "@prisma/client";
import { createAdminUserAction, deleteAdminUserAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { prisma } from "@/lib/prisma";

type AdminUsersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  USERSHOP: "Comprador",
  PROMOTOR: "Promotor",
};

const rolePills: Record<UserRole, string> = {
  ADMIN: "is-admin",
  USERSHOP: "is-shopper",
  PROMOTOR: "is-promotor",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const status = typeof params?.status === "string" ? params.status : "";
  const error = typeof params?.error === "string" ? params.error : "";

  const [users, totalUsers, adminUsers, shopperUsers] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "USERSHOP" } }),
  ]);

  return (
    <section className="panel admin-users-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Usuarios</p>
          <h1>Alta y registro</h1>
        </div>
      </div>

      <div className="admin-users-summary-grid">
        <article className="admin-users-summary-card">
          <span className="admin-users-summary-icon">
            <UsersRound size={18} />
          </span>
          <strong>{totalUsers}</strong>
          <span>Total usuarios</span>
        </article>
        <article className="admin-users-summary-card">
          <span className="admin-users-summary-icon">
            <ShieldCheck size={18} />
          </span>
          <strong>{adminUsers}</strong>
          <span>Administradores</span>
        </article>
        <article className="admin-users-summary-card">
          <span className="admin-users-summary-icon">
            <BadgeCheck size={18} />
          </span>
          <strong>{shopperUsers}</strong>
          <span>Compradores</span>
        </article>
      </div>

      <div className="admin-users-layout">
        <article className="admin-users-create-card">
          <div className="product-section-head">
            <div>
              <p className="eyebrow">Nuevo usuario</p>
              <h2>Crear cuenta desde admin</h2>
            </div>
            <span className="admin-users-create-chip">
              <UserPlus size={16} />
              Alta directa
            </span>
          </div>

          <form action={createAdminUserAction} className="stack-lg">
            <div className="form-grid">
              <label className="field">
                <span>Nombre</span>
                <input name="name" placeholder="Nombre completo" required />
              </label>

              <label className="field">
                <span>Correo</span>
                <div className="auth-password-wrap">
                  <Mail size={18} />
                  <input name="email" placeholder="usuario@correo.com" required type="email" />
                </div>
              </label>

              <label className="field">
                <span>Teléfono</span>
                <div className="auth-password-wrap">
                  <Phone size={18} />
                  <input name="phone" placeholder="Opcional" type="tel" />
                </div>
              </label>

              <label className="field">
                <span>Tipo de usuario</span>
                <select defaultValue="USERSHOP" name="role">
                  <option value="USERSHOP">Comprador</option>
                  <option value="PROMOTOR">Promotor / Influencer</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>

              <label className="field">
                <span>Contraseña</span>
                <input name="password" placeholder="Mínimo 6 caracteres" required type="password" />
              </label>

              <label className="field">
                <span>Confirmar contraseña</span>
                <input
                  name="confirmPassword"
                  placeholder="Repite la contraseña"
                  required
                  type="password"
                />
              </label>
            </div>

            <div className="actions-row">
              <SubmitButton pendingLabel="Creando usuario...">Crear usuario</SubmitButton>
            </div>
          </form>

          {status ? (
            <p className="success-text">
              {status === "deleted"
                ? "Usuario eliminado correctamente."
                : status === "updated"
                  ? "Usuario actualizado correctamente."
                  : "Usuario creado correctamente."}
            </p>
          ) : null}
          {error ? <p className="error-text auth-error">{error}</p> : null}
        </article>

        <article className="admin-users-list-card">
          <div className="product-section-head">
            <div>
              <p className="eyebrow">Registro</p>
              <h2>Usuarios creados</h2>
            </div>
          </div>

          {users.length ? (
            <div className="table-wrap">
              <table className="data-table admin-users-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Contacto</th>
                    <th>Rol</th>
                    <th>Fecha</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td data-label="Usuario">
                        <strong>{user.name}</strong>
                        <p className="muted">{user.email}</p>
                      </td>
                      <td data-label="Contacto">
                        <p className="muted">{user.phone || "Sin teléfono"}</p>
                      </td>
                      <td data-label="Rol">
                        <span className={`admin-user-role-pill ${rolePills[user.role]}`}>
                          {roleLabels[user.role]}
                        </span>
                      </td>
                      <td data-label="Fecha">
                        <div className="admin-user-date">
                          <CalendarDays size={14} />
                          <span>{formatDate(user.createdAt)}</span>
                        </div>
                      </td>
                      <td data-label="Acciones">
                        <div className="table-actions">
                          <Link className="icon-button" href={`/admin/users/${user.id}`}>
                            <Edit3 size={16} />
                            <span>Editar</span>
                          </Link>
                          <form action={deleteAdminUserAction}>
                            <input name="userId" type="hidden" value={user.id} />
                            <button className="icon-button danger" type="submit">
                              <Trash2 size={16} />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <article className="panel panel-slim empty-state">
              <UsersRound size={18} />
              <p className="eyebrow">Sin usuarios</p>
              <h2>No hay registros todavía</h2>
            </article>
          )}
        </article>
      </div>
    </section>
  );
}
