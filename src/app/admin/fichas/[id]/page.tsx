import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FichaEditorWorkspace } from "@/components/admin/ficha-editor-workspace";
import { editorialWriteSelect } from "@/lib/facturador/editorial-write";

export const dynamic = "force-dynamic";

type FichaEditorPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FichaEditorPage({
  params,
  searchParams,
}: FichaEditorPageProps) {
  const routeParams = await params;
  const productId = routeParams.id;

  const queryParams = searchParams ? await searchParams : undefined;
  const status = typeof queryParams?.status === "string" ? queryParams.status : "";

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      digitalProfile: true,
      erpEditorialWrites: { orderBy: { createdAt: "desc" }, take: 5, select: editorialWriteSelect },
      specifications: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      videos: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { sortOrder: "asc" } },
      qr: true,
      researchRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          requestId: true,
          status: true,
          confidence: true,
          identifiedBrand: true,
          identifiedModel: true,
          result: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          sources: {
            select: {
              url: true,
              title: true,
              domain: true,
              sourceType: true,
              isOfficial: true,
            },
          },
        },
      },
    },
  });

  if (!product) {
    notFound();
  }

  // Map product to workspace format
  return (
    <FichaEditorWorkspace
      product={product}
      status={status}
    />
  );
}
