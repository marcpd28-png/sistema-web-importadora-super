import { requireQuoteManager } from "@/lib/auth";
import { QuotesListPage } from "@/app/admin/quotes/page";

type AdvisorQuotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdvisorQuotesPage({ searchParams }: AdvisorQuotesPageProps) {
  await requireQuoteManager();
  return <QuotesListPage basePath="/asesor/cotizaciones" canDelete={false} searchParams={searchParams} />;
}
