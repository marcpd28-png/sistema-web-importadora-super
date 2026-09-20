"use client";
import { useActionState, useState } from "react";
import { saveCampaignAction } from "./actions";
import { ProductPicker } from "./product-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import type { getStorefrontCampaigns } from "@/lib/storefront-campaigns";
import styles from "./collections.module.css";
type Campaign = Awaited<ReturnType<typeof getStorefrontCampaigns>>[number];
export function CampaignForm({ campaign }: { campaign: Campaign }) {
  const [state, formAction] = useActionState(saveCampaignAction, { error: "" });
  const [enabled, setEnabled] = useState(campaign.enabled);
  const [codes, setCodes] = useState(campaign.productCodes.join("\n"));
  const [description, setDescription] = useState(campaign.description);
  const title = campaign.slug === "ofertas" ? "Ofertas" : "Preventa";
  const codeCount = new Set(codes.split(/[\n,;]+/).map(code => code.trim()).filter(Boolean)).size;
  const dirty = enabled !== campaign.enabled || codes !== campaign.productCodes.join("\n") || description !== campaign.description;
  return <form action={formAction} className={styles.editor}>
      <header className={styles.editorHeader}><div><h2>Configurar {title.toLowerCase()}</h2><p>{campaign.slug === "ofertas" ? "Reúne productos con precios especiales y explica las condiciones." : "Organiza los productos de reserva e indica las condiciones de entrega."}</p></div><span className={styles.savedState}>Estado guardado: <strong>{campaign.visible ? "visible" : "oculta"}</strong></span></header>
      {state.error ? <p role="alert" className="error-text">{state.error}</p> : null}
      <input type="hidden" name="slug" value={campaign.slug} />
      <input type="hidden" name="version" value={campaign.updatedAt} />
      <label className={styles.visibility}><span><strong>Mostrar en la tienda</strong><small>{enabled ? "Se mostrará al guardar si hay productos publicables y condiciones." : "Puedes preparar la campaña y mantenerla oculta."}</small></span><input type="checkbox" role="switch" name="enabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} /></label>
      <div className={styles.fields}>
        <div className={styles.field}><label htmlFor={`${campaign.slug}-codes`} className={styles.fieldTitle}>Productos <small>{codeCount} / 500 códigos</small></label><ProductPicker id={`${campaign.slug}-picker`} codes={codes} onChange={setCodes} /><span className={styles.hint} id={`${campaign.slug}-codes-help`}>Selecciona con la lupa o pega códigos, uno por línea. El orden define cómo aparecen.</span><textarea id={`${campaign.slug}-codes`} aria-describedby={`${campaign.slug}-codes-help`} name="codes" rows={6} className={styles.codes} value={codes} onChange={event => setCodes(event.target.value)} placeholder={"Ejemplo:\nN2220\nO15-AZUL"} /><span className={styles.hint}>Los códigos se validan al guardar. También puedes separarlos con comas.</span></div>
        <label className={styles.field}><span className={styles.fieldTitle}>{campaign.slug === "preventa" ? "Reserva y entrega" : "Condiciones de la oferta"}</span><span className={styles.hint}>Este texto se muestra a los clientes. Es obligatorio para activar la campaña.</span><textarea name="description" maxLength={2000} rows={6} value={description} onChange={event => setDescription(event.target.value)} placeholder={campaign.slug === "preventa" ? "Indica el plazo estimado de entrega y cómo consultar la reserva." : "Describe la vigencia y las condiciones de los productos seleccionados."} /><span className={styles.counter}>{description.length} / 2000 caracteres</span></label>
      </div>
      <aside className={styles.notice}><strong>Precios y disponibilidad</strong><p>Los precios se toman del catálogo. Agregar códigos no modifica precios ni permite comprar sin stock.{campaign.slug === "preventa" ? " Las reservas se consultan por WhatsApp." : " Revisa los precios antes de activar la oferta."}</p></aside>
      <footer className={styles.footer}><span role="status">{dirty ? "Tienes cambios sin guardar" : "Sin cambios pendientes"}</span><SubmitButton className={styles.save}>Guardar {title.toLowerCase()}</SubmitButton></footer>
    </form>;
}
