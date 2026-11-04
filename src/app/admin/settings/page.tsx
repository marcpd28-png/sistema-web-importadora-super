import Link from "next/link";
import { updateSettingsAction } from "@/app/admin/actions";
import { AdminFormSectionNav } from "@/components/admin/admin-form-section-nav";
import { SubmitButton } from "@/components/ui/submit-button";
import { getStoreSettings } from "@/lib/store";

const SETTINGS_FORM_SECTIONS = [
  { id: "settings-business", label: "Negocio", description: "Identidad y canal de atención" },
  { id: "settings-storefront", label: "Portada", description: "Contenido comercial visible" },
  { id: "settings-checkout", label: "Pedidos", description: "Textos y moneda del checkout" },
  { id: "settings-location", label: "Atención", description: "Horario y punto de recojo" },
  { id: "settings-brand", label: "Marca", description: "Color configurado actualmente" },
] as const;

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const settings = await getStoreSettings();
  const params = searchParams ? await searchParams : undefined;
  const status = typeof params?.status === "string" ? params.status : "";
  const error = typeof params?.error === "string" ? params.error : "";
  const locationSettings = settings as typeof settings & {
    storeAddress?: string;
    storeMapsUrl?: string;
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Configuración</p>
          <h1>Datos globales del catálogo</h1>
        </div>
      </div>

      {status ? <p aria-live="polite" className="success-text" role="status">Configuración actualizada.</p> : null}
      {error ? <p aria-live="assertive" className="error-text auth-error" role="alert">{error}</p> : null}

      <form action={updateSettingsAction} className="stack-lg admin-long-form">
        <AdminFormSectionNav label="Secciones de configuración" sections={[...SETTINGS_FORM_SECTIONS]} />

        <section className="product-section-card admin-form-anchor" id="settings-business">
          <div className="product-section-head">
            <div><p className="eyebrow">Negocio</p><h2>Identidad y contacto</h2></div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Nombre del negocio</span>
              <input autoComplete="organization" defaultValue={settings.businessName} name="businessName" required />
            </label>
            <label className="field">
              <span>Messenger</span>
              <input autoComplete="url" defaultValue={settings.messengerUrl} inputMode="url" name="messengerUrl" required type="url" />
            </label>
          </div>
        </section>

        <section className="product-section-card admin-form-anchor" id="settings-storefront">
          <div className="product-section-head">
            <div><p className="eyebrow">Portada</p><h2>Contenido comercial</h2></div>
            <Link className="button button-secondary button-chip" href="/admin/banners">Administrar banners</Link>
          </div>
          <div className="form-grid">
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
              <input defaultValue={settings.heroAutoplaySeconds} inputMode="numeric" max={20} min={2} name="heroAutoplaySeconds" required type="number" />
              <small className="field-caption">Entre 2 y 20 segundos.</small>
            </label>
            <label className="field field-wide">
              <span>Mensaje destacado</span>
              <textarea defaultValue={settings.highlightMessage} name="highlightMessage" rows={3} />
            </label>
          </div>
        </section>

        <section className="product-section-card admin-form-anchor" id="settings-checkout">
          <div className="product-section-head">
            <div><p className="eyebrow">Pedidos</p><h2>Mensajes del checkout</h2></div>
          </div>
          <div className="form-grid">
            <label className="field field-wide">
              <span>Introducción del pedido</span>
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
          </div>
        </section>

        <section className="product-section-card admin-form-anchor" id="settings-location">
          <div className="product-section-head">
            <div><p className="eyebrow">Atención</p><h2>Horario y punto de recojo</h2></div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Horario</span>
              <input defaultValue={settings.supportHours} name="supportHours" required />
            </label>
            <label className="field field-wide">
              <span>Dirección de la tienda</span>
              <input autoComplete="street-address" defaultValue={locationSettings.storeAddress ?? "Jr. Huallaga 420, Cercado de Lima"} name="storeAddress" placeholder="Ej.: Jr. Huallaga 420, Cercado de Lima" />
              <small className="field-caption">Se muestra como referencia para el recojo en local.</small>
            </label>
            <label className="field field-wide">
              <span>Enlace de Google Maps (opcional)</span>
              <input defaultValue={locationSettings.storeMapsUrl ?? ""} inputMode="url" name="storeMapsUrl" placeholder="https://maps.google.com/?q=..." type="url" />
            </label>
          </div>
        </section>

        <section className="product-section-card admin-form-anchor" id="settings-brand">
          <div className="product-section-head">
            <div><p className="eyebrow">Marca</p><h2>Color actual de la tienda</h2></div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Color de marca</span>
              <input defaultValue={settings.primaryColor} name="primaryColor" required type="color" />
              <small className="field-caption">La optimización visual conserva este color configurado.</small>
            </label>
          </div>
        </section>

        <div className="actions-row admin-form-sticky-actions">
          <span className="admin-form-save-hint">Los cambios se aplican a toda la tienda.</span>
          <SubmitButton>Guardar configuración</SubmitButton>
        </div>
      </form>
    </section>
  );
}
