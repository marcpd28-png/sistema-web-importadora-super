"use client";
import { useActionState, useState } from "react";
import { saveCampaignAction } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import type { getStorefrontCampaigns } from "@/lib/storefront-campaigns";
type Campaign = Awaited<ReturnType<typeof getStorefrontCampaigns>>[number];
export function CampaignForm({ campaign }: { campaign: Campaign }) {
  const [state, formAction] = useActionState(saveCampaignAction, { error: "" });
  const [enabled, setEnabled] = useState(campaign.enabled);
  const [codes, setCodes] = useState(campaign.productCodes.join("\n"));
  const [description, setDescription] = useState(campaign.description);
  return <form action={formAction} className="product-section-card stack-md">
      {state.error ? <p role="alert" className="error-text">{state.error}</p> : null}
      <h2>{campaign.slug === "ofertas" ? "Ofertas" : "Preventa"}</h2>
      <input type="hidden" name="slug" value={campaign.slug} />
      <input type="hidden" name="version" value={campaign.updatedAt} />
      <label><input type="checkbox" name="enabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Mostrar colección en la tienda</label>
      <label className="field"><span>Códigos de productos</span><textarea name="codes" rows={8} value={codes} onChange={event => setCodes(event.target.value)} placeholder={"N2220\nO15-AZUL"} /></label>
      <label className="field"><span>{campaign.slug === "preventa" ? "Condiciones de reserva y entrega" : "Descripción y condiciones de la oferta"}</span>
        <textarea name="description" maxLength={2000} rows={3} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <p className="muted">{campaign.productIds.length} productos publicables. {campaign.visible ? "Visible en la tienda." : "Oculta en la tienda."}</p>
      <p className="muted">Los precios se toman del catálogo. Agregar un código no cambia su precio ni habilita la compra sin stock.
        {campaign.slug === "preventa" ? " Los clientes pueden consultar la reserva por WhatsApp." : " Verifica los precios y condiciones antes de activar."}</p>
      <SubmitButton>Guardar colección</SubmitButton>
    </form>;
}
