import { requireAdmin } from "@/lib/auth";
import { getStorefrontCampaigns } from "@/lib/storefront-campaigns";
import { CampaignForm } from "./campaign-form";

export const dynamic = "force-dynamic";
export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const [campaigns, params] = await Promise.all([getStorefrontCampaigns(), searchParams]);
  return <section className="panel stack-lg">
    <div><p className="eyebrow">Tienda</p><h1>Ofertas y preventa</h1>
      <p>Activa cada colección cuando esté lista. Agrega los códigos exactos del catálogo, uno por línea, en el orden de presentación.</p></div>
    {params.saved ? <p role="status" className="success-text">Colecciones actualizadas.</p> : null}
    {typeof params.error === "string" ? <p role="alert" className="error-text">{params.error}</p> : null}
    {campaigns.map(campaign => <CampaignForm key={`${campaign.slug}-${campaign.updatedAt}`} campaign={campaign} />)}
  </section>;
}
