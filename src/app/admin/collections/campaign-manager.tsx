"use client";

import { useState } from "react";
import { Tag, CalendarClock } from "lucide-react";
import type { getStorefrontCampaigns } from "@/lib/storefront-campaigns";
import { CampaignForm } from "./campaign-form";
import styles from "./collections.module.css";

export function CampaignManager({ campaigns }: { campaigns: Awaited<ReturnType<typeof getStorefrontCampaigns>> }) {
  const [selected, setSelected] = useState(campaigns[0]?.slug);
  return <>
    <div className={styles.selector} role="group" aria-label="Seleccionar campaña">
      {campaigns.map(campaign => {
        const Icon = campaign.slug === "ofertas" ? Tag : CalendarClock;
        return <button key={campaign.slug} type="button" className={`${styles.choice} ${selected === campaign.slug ? styles.selected : ""}`} aria-pressed={selected === campaign.slug} aria-controls={`editor-${campaign.slug}`} onClick={() => setSelected(campaign.slug)}>
          <span className={styles.icon}><Icon size={22} aria-hidden="true" /></span>
          <span className={styles.choiceCopy}><strong>{campaign.slug === "ofertas" ? "Ofertas" : "Preventa"}</strong><small>{campaign.productCodes.length} códigos · {campaign.productIds.length} publicables</small></span>
          <span className={`${styles.badge} ${campaign.visible ? styles.visible : ""}`}>{campaign.visible ? "Visible" : "Oculta"}</span>
        </button>;
      })}
    </div>
    {campaigns.map(campaign => <div key={campaign.slug} id={`editor-${campaign.slug}`} hidden={selected !== campaign.slug}>
      <CampaignForm campaign={campaign} />
    </div>)}
  </>;
}
