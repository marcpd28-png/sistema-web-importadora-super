import { requireQuoteManager } from "@/lib/auth";
import { QuoteDetailPage } from "@/app/admin/quotes/[id]/page";

type AdvisorQuoteDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function AdvisorQuoteDetailPage({ params }: AdvisorQuoteDetailPageProps) {
  await requireQuoteManager();
  return <QuoteDetailPage backHref="/asesor/cotizaciones" canDelete={false} canSetSystemStatuses={false} catalogPath="/asesor/catalogo" params={params} />;
}
