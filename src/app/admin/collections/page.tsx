import { requireAdmin } from "@/lib/auth";
import { getStorefrontCampaigns } from "@/lib/storefront-campaigns";
import { CampaignManager } from "./campaign-manager";
import styles from "./collections.module.css";

export const dynamic = "force-dynamic";
export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const [campaigns, params] = await Promise.all([getStorefrontCampaigns(), searchParams]);
  return <section className={styles.page}>
    <header className={styles.pageHeader}><p className="eyebrow">Tienda · Campañas</p><h1>Ofertas y preventa</h1>
      <p>Elige una campaña, agrega sus productos y decide si debe mostrarse en la tienda.</p></header>
    {params.saved ? <p role="status" className="success-text">Colecciones actualizadas.</p> : null}
    {typeof params.error === "string" ? <p role="alert" className="error-text">{params.error}</p> : null}
    <CampaignManager key={campaigns.map(c => c.updatedAt).join("-")} campaigns={campaigns} />
  </section>;
}
