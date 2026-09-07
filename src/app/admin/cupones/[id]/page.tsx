import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { PromoForm } from "@/components/admin/promo-form";
import { notFound } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export default async function EditPromoPage(props: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const params = await props.params;

  const promo = await prisma.promoCode.findUnique({
    where: { id: params.id },
    include: {
      orders: {
        where: { status: "PAID" },
        orderBy: { createdAt: "desc" },
        include: { user: true }
      }
    }
  });

  if (!promo) {
    notFound();
  }

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" }
  });

  // Serialize Decimal → number so Client Components don't throw
  const serializedPromo = {
    ...promo,
    discountValue: Number(promo.discountValue),
    commissionValue: Number(promo.commissionValue),
    minOrderAmount: Number(promo.minOrderAmount),
    orders: promo.orders.map(o => ({
      ...o,
      total: Number(o.total),
      discountAmount: Number(o.discountAmount),
      commissionAmount: Number(o.commissionAmount),
    })),
  };

  return (
    <section className="panel">
      <div className="panel-header" style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <Link href="/admin/cupones" className="icon-button" style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "8px" }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="eyebrow">Marketing y Afiliados</p>
          <h1>Editar Cupón: {promo.code}</h1>
        </div>
      </div>

      <div className="admin-users-layout">
        <article className="admin-users-create-card">
          <div className="product-section-head">
            <div>
              <p className="eyebrow">Configuración</p>
              <h2>Detalles del Cupón</h2>
            </div>
          </div>
          <PromoForm promo={serializedPromo} promoters={users} />
        </article>

        <article className="admin-users-list-card">
          <div className="product-section-head">
            <div>
              <p className="eyebrow">Historial</p>
              <h2>Trazabilidad de Ventas Pagadas</h2>
            </div>
          </div>
          
          {serializedPromo.orders.length > 0 ? (
            <div className="table-wrap" style={{ maxHeight: "500px", overflowY: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Orden</th>
                    <th>Total Venta</th>
                    <th>Comisión Promotor</th>
                  </tr>
                </thead>
                <tbody>
                  {serializedPromo.orders.map(order => (
                    <tr key={order.id}>
                      <td data-label="Fecha">
                        <span className="muted">{new Date(order.createdAt).toLocaleDateString("es-PE")}</span>
                      </td>
                      <td data-label="Orden">
                        <Link href={`/admin/quotes/${order.id}`} style={{ color: "var(--brand-primary)", fontWeight: "bold" }}>
                          #{order.orderNumber || order.id.slice(-6)}
                        </Link>
                      </td>
                      <td data-label="Total Venta">
                        {formatCurrency(order.total, "PEN")}
                      </td>
                      <td data-label="Comisión">
                        <strong style={{ color: "var(--brand-success)" }}>
                          +{formatCurrency(order.commissionAmount, "PEN")}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <article className="panel panel-slim empty-state">
              <History size={18} />
              <p className="eyebrow">Sin historial</p>
              <h2>Ninguna venta ha usado este cupón todavía.</h2>
            </article>
          )}
        </article>
      </div>
    </section>
  );
}
