import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { PlusCircle, Tag, UsersRound, CalendarDays, Edit3, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { deletePromoAction } from "@/app/admin/cupones/actions";
import { DeletePromoButton } from "@/components/admin/delete-promo-button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cupones de Descuento | Admin",
};

export default async function AdminPromosPage() {
  await requireAdmin();

  const promos = await prisma.promoCode.findMany({
    include: {
      creator: true,
      orders: {
        where: { status: "PAID" },
        select: { commissionAmount: true, discountAmount: true, total: true },
      },
      _count: {
        select: {
          orders: { where: { status: "PAID" } },
        }
      }
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="panel">
      <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="eyebrow">Cupones y Afiliados</p>
          <h1>Códigos de Descuento</h1>
        </div>
        <Link className="button button-primary" href="/admin/cupones/new">
          <PlusCircle size={18} />
          <span>Nuevo Cupón</span>
        </Link>
      </div>

      <div className="admin-users-layout" style={{ display: "block" }}>
        <article className="admin-users-list-card">
          {promos.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descuento</th>
                    <th>Comisión</th>
                    <th>Mín. Compra</th>
                    <th>Promotor</th>
                    <th>Usos (Pagados)</th>
                    <th>Generado</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {promos.map((promo) => {
                    const discountText = promo.discountType === "PERCENTAGE" 
                      ? `${Number(promo.discountValue)}%` 
                      : formatCurrency(Number(promo.discountValue), "PEN");
                    
                    const commissionText = promo.commissionType === "PERCENTAGE" 
                      ? `${Number(promo.commissionValue)}%` 
                      : formatCurrency(Number(promo.commissionValue), "PEN");

                    const totalCommissionGenerated = promo.orders.reduce((sum, order) => sum + Number(order.commissionAmount), 0);

                    return (
                      <tr key={promo.id}>
                        <td data-label="Código">
                          <strong style={{ color: "var(--brand-primary)", fontSize: "16px" }}>{promo.code}</strong>
                        </td>
                        <td data-label="Descuento">
                          <span className="badge badge-success">{discountText}</span>
                        </td>
                        <td data-label="Comisión">{commissionText}</td>
                        <td data-label="Mín. Compra">{formatCurrency(Number(promo.minOrderAmount), "PEN")}</td>
                        <td data-label="Promotor">
                          {promo.creator ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <UsersRound size={14} />
                              <span>{promo.creator.name}</span>
                            </div>
                          ) : (
                            <span className="muted">Sin asignar</span>
                          )}
                        </td>
                        <td data-label="Usos">
                          <strong>{promo._count.orders}</strong>
                        </td>
                        <td data-label="Generado">
                          <strong style={{ color: "var(--brand-success)" }}>
                            {formatCurrency(totalCommissionGenerated, "PEN")}
                          </strong>
                        </td>
                        <td data-label="Estado">
                          {promo.isActive ? (
                            <span className="admin-user-role-pill is-admin">Activo</span>
                          ) : (
                            <span className="admin-user-role-pill is-shopper">Inactivo</span>
                          )}
                        </td>
                        <td data-label="Acciones">
                          <div className="table-actions">
                            <Link className="icon-button" href={`/admin/cupones/${promo.id}`}>
                              <Edit3 size={16} />
                              <span>Editar</span>
                            </Link>
                            <DeletePromoButton action={deletePromoAction.bind(null, promo.id)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <article className="panel panel-slim empty-state">
              <Tag size={18} />
              <p className="eyebrow">Sin cupones</p>
              <h2>No hay códigos registrados todavía</h2>
            </article>
          )}
        </article>
      </div>
    </section>
  );
}
