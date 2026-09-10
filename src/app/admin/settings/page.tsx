import Link from "next/link";
import { updateSettingsAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { getStoreSettings } from "@/lib/store";

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const settings = await getStoreSettings();
  const params = searchParams ? await searchParams : undefined;
  const status = typeof params?.status === "string" ? params.status : "";
  const error = typeof params?.error === "string" ? params.error : "";

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Configuración</p>
          <h1>Datos globales del catálogo</h1>
        </div>
      </div>

      {status ? <p className="success-text">Configuración actualizada.</p> : null}
      {error ? <p className="error-text auth-error">{error}</p> : null}

      <form action={updateSettingsAction} className="stack-lg">
        <div className="form-grid">
          <label className="field">
            <span>Nombre del negocio</span>
            <input defaultValue={settings.businessName} name="businessName" required />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input defaultValue={settings.whatsappNumber} name="whatsappNumber" required />
          </label>
          <label className="field field-wide">
            <span>Título principal</span>
            <input defaultValue={settings.heroTitle} name="heroTitle" required />
          </label>
          <label className="field field-wide">
            <span>Descripción principal</span>
            <textarea defaultValue={settings.heroDescription} name="heroDescription" rows={4} />
          </label>
          <label className="field">
            <span>Segundos por slide</span>
            <input
              defaultValue={settings.heroAutoplaySeconds}
              max={20}
              min={2}
              name="heroAutoplaySeconds"
              required
              type="number"
            />
          </label>
          <label className="field field-wide">
            <span>Mensaje destacado</span>
            <textarea defaultValue={settings.highlightMessage} name="highlightMessage" rows={3} />
          </label>
          <label className="field field-wide">
            <span>Intro del pedido</span>
            <textarea defaultValue={settings.orderIntro} name="orderIntro" rows={3} />
          </label>
          <label className="field field-wide">
            <span>Cierre del pedido</span>
            <textarea defaultValue={settings.orderFooter} name="orderFooter" rows={3} />
          </label>
          <label className="field">
            <span>Moneda</span>
            <input defaultValue={settings.currencySymbol} name="currencySymbol" required />
          </label>
          <label className="field">
            <span>Horario</span>
            <input defaultValue={settings.supportHours} name="supportHours" required />
          </label>
          <label className="field field-wide">
            <span>📍 Dirección de la tienda (para recojo en local)</span>
            <input
              defaultValue={(settings as any).storeAddress ?? "Jr. Huallaga 420, Cercado de Lima"}
              name="storeAddress"
              placeholder="Ej: Jr. Huallaga 420, Cercado de Lima"
            />
          </label>
          <label className="field field-wide">
            <span>🗺️ Link de Google Maps (opcional)</span>
            <input
              defaultValue={(settings as any).storeMapsUrl ?? ""}
              name="storeMapsUrl"
              placeholder="https://maps.google.com/?q=..."
              type="url"
            />
          </label>
          <label className="field">
            <span>Color de marca</span>
            <input defaultValue={settings.primaryColor} name="primaryColor" required type="color" />
          </label>
        </div>

        <div className="actions-row">
          <Link className="button button-secondary" href="/admin/banners">
            Administrar banners
          </Link>
          <SubmitButton>Guardar configuración</SubmitButton>
        </div>
      </form>
    </section>
  );
}
