import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { FichasPrintWorkspace } from "@/components/admin/fichas-print-workspace";

export const dynamic = "force-dynamic";

type PrintFichasPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PrintFichasPage({ searchParams }: PrintFichasPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const idsStr = typeof params?.ids === "string" ? params.ids : "";

  if (!idsStr) {
    notFound();
  }

  const ids = idsStr.split(",");

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      code: true,
      unitPrice: true,
      qr: {
        select: {
          imageUrl: true,
        },
      },
    },
  });

  const formattedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    unitPrice: Number(p.unitPrice),
    qr: p.qr,
  }));

  return <FichasPrintWorkspace products={formattedProducts} />;
}
