import Link from "next/link";
import { House, KeyRound } from "lucide-react";
import { redirectIfAuthenticated } from "@/lib/auth";
import { loginAction } from "@/app/login/actions";
import { SubmitButton } from "@/components/ui/submit-button";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await redirectIfAuthenticated();
  const params = searchParams ? await searchParams : undefined;
  const error = typeof params?.error === "string" ? params.error : "";

  return (
    <main className="auth-shell">
      <section className="auth-layout auth-layout-single">
        <section className="auth-panel">
          <div className="stack-sm">
            <p className="eyebrow">Iniciar sesión</p>
            <h2>Entra al panel</h2>
            <p className="muted">
              Usa tu correo y contraseña para gestionar productos, stock y configuración general.
            </p>
          </div>

          <form action={loginAction} className="stack-md">
            <label className="field">
              <span>Correo</span>
              <input name="email" placeholder="admin@empresa.com" required type="email" />
            </label>

            <label className="field">
              <span>Contraseña</span>
              <div className="auth-password-wrap">
                <KeyRound size={18} />
                <input name="password" placeholder="Tu contraseña" required type="password" />
              </div>
            </label>

            {error ? <p className="error-text auth-error">{error}</p> : null}

            <SubmitButton pendingLabel="Ingresando..." className="auth-submit">
              Entrar al panel
            </SubmitButton>
          </form>

          <div className="auth-footer">
            <div className="auth-note">
              <span>Acceso interno</span>
              <strong>Panel exclusivo para administración</strong>
            </div>
            <div className="auth-inline-actions">
              <Link className="button button-secondary" href="/acceso">
                Acceso comprador
              </Link>
              <Link className="button button-ghost auth-home-link" href="/" aria-label="Volver al catálogo">
                <House size={18} />
              </Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
