import Link from "next/link";
import type { Prisma, UserRole } from "@prisma/client";
import { CalendarDays, Edit3, Mail, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, UsersRound } from "lucide-react";
import { deleteAdminUserAction } from "@/app/admin/actions";
import { AdminUserDeleteForm } from "@/components/admin/admin-user-delete-form";
import { prisma } from "@/lib/prisma";

type AdminUsersPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = "force-dynamic";

const roleLabels: Record<UserRole, string> = { ADMIN: "Administrador", USERSHOP: "Comprador", PROMOTOR: "Promotor" };
const rolePills: Record<UserRole, string> = { ADMIN: "is-admin", USERSHOP: "is-shopper", PROMOTOR: "is-promotor" };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "medium" }).format(value);
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const status = typeof params?.status === "string" ? params.status : "";
  const error = typeof params?.error === "string" ? params.error : "";
  const q = typeof params?.q === "string" ? params.q.trim() : "";
  const role = typeof params?.role === "string" && ["ADMIN", "USERSHOP", "PROMOTOR"].includes(params.role) ? (params.role as UserRole) : "all";
  const where: Prisma.UserWhereInput = {
    ...(role !== "all" ? { role } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const pageSize = 10;
  const requestedPage = Number(typeof params?.page === "string" ? params.page : "1");
  const totalResults = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Number.isSafeInteger(requestedPage) ? Math.min(totalPages, Math.max(1, requestedPage)) : 1;
  const pageHref = (target: number) => {
    const query = new URLSearchParams({ page: String(target) });
    if (q) query.set("q", q);
    if (role !== "all") query.set("role", role);
    return `/admin/users?${query}`;
  };
  const [users, totalUsers, adminUsers, shopperUsers, promoterUsers] = await Promise.all([
    prisma.user.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true } }),
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "USERSHOP" } }),
    prisma.user.count({ where: { role: "PROMOTOR" } }),
  ]);
  const tabs = [
    { label: "Todos", value: "all", count: totalUsers, icon: UsersRound },
    { label: "Administradores", value: "ADMIN", count: adminUsers, icon: ShieldCheck },
    { label: "Compradores", value: "USERSHOP", count: shopperUsers, icon: ShoppingBag },
    { label: "Promotores", value: "PROMOTOR", count: promoterUsers, icon: Sparkles },
  ] as const;

  return (
    <section className="panel admin-users-panel admin-users-workspace">
      <header className="admin-user-page-header">
        <div><p className="eyebrow">Accesos</p><h1>Usuarios</h1><p className="panel-copy">Administra cuentas, roles y datos de contacto.</p></div>
        <Link className="button button-primary" href="/admin/users/new"><Plus size={16} /> Nuevo usuario</Link>
      </header>
      {status ? <div className="admin-toast admin-toast-success" role="status"><strong>Listo</strong><span>{status === "deleted" ? "Usuario eliminado correctamente." : status === "updated" ? "Usuario actualizado correctamente." : "Usuario creado correctamente."}</span></div> : null}
      {error ? <div className="admin-toast admin-toast-error" role="alert"><strong>Error</strong><span>{error}</span></div> : null}
      <nav className="admin-user-tabs" aria-label="Filtrar usuarios por rol">
        {tabs.map((tab) => { const Icon = tab.icon; const href = tab.value === "all" ? "/admin/users" : `/admin/users?role=${tab.value}`; return <Link className={role === tab.value ? "is-active" : ""} href={href} key={tab.value}><Icon size={15} /><span>{tab.label}</span><strong>{tab.count}</strong></Link>; })}
      </nav>
      <form className="admin-user-toolbar" method="GET">
        <label className="admin-user-search"><Search size={17} /><input defaultValue={q} name="q" placeholder="Buscar por nombre, correo o teléfono..." /></label>
        {role !== "all" ? <input name="role" type="hidden" value={role} /> : null}
        <button className="button button-secondary" type="submit">Buscar</button>
        {q ? <Link className="button button-ghost" href={role === "all" ? "/admin/users" : `/admin/users?role=${role}`}>Limpiar</Link> : null}
      </form>
      <div className="admin-user-results-head"><span>{totalResults ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalResults)} de {totalResults} usuarios · página {page} de {totalPages}</span>{role !== "all" ? <span className="muted">Rol: {roleLabels[role]}</span> : null}</div>
      {users.length ? (
        <div className="admin-user-table-card"><table className="data-table admin-users-table">
          <thead><tr><th>Usuario</th><th>Contacto</th><th>Rol</th><th>Registro</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}>
            <td data-label="Usuario"><div className="admin-user-identity"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td>
            <td data-label="Contacto"><div className="admin-user-contact"><Mail size={14} /><span>{user.phone || "Sin teléfono"}</span></div></td>
            <td data-label="Rol"><span className={`admin-user-role-pill ${rolePills[user.role]}`}>{roleLabels[user.role]}</span></td>
            <td data-label="Registro"><div className="admin-user-date"><CalendarDays size={14} /><span>{formatDate(user.createdAt)}</span></div></td>
            <td data-label="Acciones"><div className="table-actions admin-user-row-actions"><Link aria-label={`Editar ${user.name}`} className="icon-button" href={`/admin/users/${user.id}`}><Edit3 size={16} /></Link><AdminUserDeleteForm action={deleteAdminUserAction} compact userId={user.id} userName={user.name} /></div></td>
          </tr>)}</tbody>
        </table></div>
      ) : <article className="admin-user-empty"><UsersRound size={24} /><strong>No encontramos usuarios</strong><p>Prueba otro término o limpia los filtros aplicados.</p><Link className="button button-secondary" href="/admin/users">Ver todos</Link></article>}
      {totalPages > 1 ? <nav className="pagination-row" aria-label="Páginas de usuarios">
        {page > 1 ? <Link className="button button-secondary" href={pageHref(page - 1)}>Página anterior</Link> : <span />}
        {page < totalPages ? <Link className="button button-secondary" href={pageHref(page + 1)}>Siguiente página</Link> : null}
      </nav> : null}
    </section>
  );
}
