import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PromoForm } from "@/components/admin/promo-form";

export default async function NewPromoPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" }
  });

  return (
    <section className="panel">
      <div className="panel-header" style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <Link href="/admin/cupones" className="icon-button" style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "8px" }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="eyebrow">Marketing y Afiliados</p>
          <h1>Crear Nuevo Cupón</h1>
        </div>
      </div>

      <div style={{ maxWidth: "800px" }}>
        <PromoForm promoters={users} />
      </div>
    </section>
  );
}
